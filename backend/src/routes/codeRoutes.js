import express from "express";
import { getAuth } from "@clerk/express";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const router = express.Router();

const MAX_CODE_LENGTH = 50_000;
const TIME_LIMIT_MS = 10_000; // covers startup + compile + run
const MAX_CONCURRENT_RUNS = 3;
let activeRuns = 0;

// How each language is run on this machine.
// On Windows the Python command is usually "python" (or "py"); on Linux/macOS it's "python3".
const RUNNERS = {
  java: { file: "Main.java", cmd: "java", args: ["-Xmx256m"] }, // needs JDK 11+
  python: {
    file: "main.py",
    cmd: process.platform === "win32" ? "python" : "python3",
    args: ["main.py"],
  },
};

function findJavaMainClass(code) {
  const mainMatch = /\b(?:public\s+)?static\s+void\s+main\s*\(\s*(?:String(?:\s*\[\s*\]|\s*\.{3})\s+\w+)\s*\)/.exec(code);
  if (!mainMatch) return null;

  const mainIndex = mainMatch.index;
  const classes = [...code.matchAll(/\b(?:public\s+|abstract\s+|final\s+)*class\s+([A-Za-z_]\w*)/g)];
  const owningClass = [...classes]
    .reverse()
    .find((match) => match.index <= mainIndex);

  return owningClass?.[1] || null;
}

// Minimal environment for the child process, so user code can't read your server's secrets
// (Clerk secret key, database URL, etc.) through process environment variables.
const childEnv = (dir) => ({
  PATH: process.env.PATH,
  TEMP: dir,
  TMP: dir,
  PYTHONIOENCODING: "utf-8",
  ...(process.env.JAVA_HOME && { JAVA_HOME: process.env.JAVA_HOME }),
  ...(process.env.SystemRoot && { SystemRoot: process.env.SystemRoot }),
});

const run = (cmd, args, options) =>
  new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { ...options, timeout: TIME_LIMIT_MS, killSignal: "SIGKILL", maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });

// JavaScript runs in the browser (see frontend/src/lib/codeRunner.js)
router.post("/execute", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Please sign in again." });

  const { language, code } = req.body || {};
  const runner = RUNNERS[language];

  if (!runner) {
    return res.status(400).json({ error: `Unsupported language on the server: ${language}` });
  }
  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "No code to run." });
  }
  if (code.length > MAX_CODE_LENGTH) {
    return res.status(400).json({ error: "Code is too long." });
  }
  if (activeRuns >= MAX_CONCURRENT_RUNS) {
    return res.status(503).json({ error: "The code runner is busy. Try again in a moment." });
  }

  activeRuns++;
  let dir;

  try {
    dir = await mkdtemp(path.join(tmpdir(), "code-run-"));
    await writeFile(path.join(dir, runner.file), code, "utf8");

    let runArgs = runner.args;

    if (language === "java") {
      const compile = await run("javac", ["Main.java"], {
        cwd: dir,
        env: childEnv(dir),
      });

      if (compile.error && compile.error.code === "ENOENT") {
        return res.json({
          stdout: "",
          stderr: "Java is not installed on the server (could not find 'javac').",
        });
      }
      if (compile.error) {
        return res.json({
          stdout: compile.stdout,
          stderr: compile.stderr || compile.error.message,
        });
      }

      const mainClass = findJavaMainClass(code);
      if (!mainClass) {
        return res.json({
          stdout: "",
          stderr: "Java code must contain a static void main(String[] args) method.",
        });
      }
      runArgs = [...runner.args, mainClass];
    }

    const { error, stdout, stderr } = await run(runner.cmd, runArgs, {
      cwd: dir,
      env: childEnv(dir),
    });

    if (error && error.code === "ENOENT") {
      return res.json({
        stdout: "",
        stderr: `${language} is not installed on the server (could not find the '${runner.cmd}' command).`,
      });
    }
    if (error && error.killed) {
      return res.json({
        stdout,
        stderr: `Time limit exceeded (${TIME_LIMIT_MS / 1000}s). Check for an infinite loop.`,
      });
    }
    if (error) {
      // Compile error or uncaught exception: details are in stderr
      return res.json({ stdout, stderr: stderr || error.message });
    }

    res.json({ stdout, stderr: "" });
  } catch (err) {
    console.error("Error in /code/execute:", err.message);
    res.status(500).json({ error: "Failed to run the code." });
  } finally {
    activeRuns--;
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;