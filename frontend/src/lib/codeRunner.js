// Runs code entirely in the user's browser: no server, no API key, no cost.
//  - JavaScript: a throwaway Web Worker per run
//  - Python: Pyodide (Python compiled to WebAssembly) in a long-lived Web Worker

const JS_TIMEOUT_MS = 5000;
const PY_TIMEOUT_MS = 20000; // generous: the very first run also downloads Pyodide
const PYODIDE_VERSION = "0.26.4";

// Java can't run in the browser, so it goes through our Express backend, which runs it
// with the JDK installed on the server (see backend/src/routes/codeRoutes.js).
// Use the same base URL your other API calls use, e.g. "http://localhost:3000/api".
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// true  = run Python with the Python installed on your server (exact version, stdin, libraries)
// false = run Python in the browser with Pyodide (no server install, runs in a browser sandbox)
const PYTHON_ON_SERVER = false;

/* ----------------------------- JavaScript ----------------------------- */

// Worker source kept as a plain string. console.log output is formatted like Node,
// except strings inside arrays use double quotes (["a","b"]) because that is what the
// expectedOutput values in data/problems.js use. Arrays print as [ 1, 2 ] and are
// matched after normalizeOutput().
const JS_WORKER_SOURCE = `
function fmt(v, nested, seen) {
  if (typeof v === "string") return nested ? JSON.stringify(v) : v;
  if (typeof v === "bigint") return v + "n";
  if (typeof v === "function") return "[Function: " + (v.name || "anonymous") + "]";
  if (v === null || typeof v !== "object") return String(v);
  if (v instanceof Error) return v.name + ": " + v.message;
  if (seen.has(v)) return "[Circular]";
  seen.add(v);
  var out;
  if (Array.isArray(v)) {
    out = v.length ? "[ " + v.map(function (x) { return fmt(x, true, seen); }).join(", ") + " ]" : "[]";
  } else {
    var keys = Object.keys(v);
    out = keys.length ? "{ " + keys.map(function (k) { return k + ": " + fmt(v[k], true, seen); }).join(", ") + " }" : "{}";
  }
  seen.delete(v);
  return out;
}

self.onmessage = async function (e) {
  var lines = [];
  function log() {
    var args = Array.prototype.slice.call(arguments);
    lines.push(args.map(function (a) { return fmt(a, false, new Set()); }).join(" "));
  }
  var fakeConsole = { log: log, info: log, warn: log, error: log, debug: log };
  try {
    var result = new Function("console", e.data.code)(fakeConsole);
    if (result && typeof result.then === "function") await result;
    self.postMessage({ ok: true, output: lines.join("\\n") });
  } catch (err) {
    self.postMessage({
      ok: false,
      output: lines.join("\\n"),
      error: err && err.message ? err.name + ": " + err.message : String(err),
    });
  }
};
`;

function runJavaScript(code) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([JS_WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);

    const finish = (result) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          output: "",
          error: "Time limit exceeded (5s). Check for an infinite loop.",
        }),
      JS_TIMEOUT_MS
    );

    worker.onmessage = (e) => finish(e.data);
    worker.onerror = (e) => finish({ ok: false, output: "", error: e.message || "Worker error" });
    worker.postMessage({ code });
  });
}

/* ------------------------------- Python ------------------------------- */

const PY_WORKER_SOURCE = `
importScripts("https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js");
var ready = loadPyodide();

self.onmessage = async function (e) {
  var id = e.data.id;
  var out = [];
  try {
    var pyodide = await ready;
    pyodide.setStdout({ batched: function (s) { out.push(s); } });
    pyodide.setStderr({ batched: function () {} });

    // Fresh namespace per run so earlier runs can't leak variables into this one
    var dict = pyodide.globals.get("dict");
    var ns = dict();
    try {
      ns.set("__name__", "__main__");
      await pyodide.runPythonAsync(e.data.code, { globals: ns });
    } finally {
      ns.destroy();
      dict.destroy();
    }
    self.postMessage({ id: id, ok: true, output: out.join("\\n") });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    var i = msg.indexOf('File "<exec>"');
    if (i > 0) msg = "Traceback (most recent call last):\\n  " + msg.slice(i);
    self.postMessage({ id: id, ok: false, output: out.join("\\n"), error: msg });
  }
};
`;

let pyWorker = null;
let pyRequestId = 0;
const pyPending = new Map();

function resetPythonWorker(errorMessage) {
  if (pyWorker) pyWorker.terminate();
  pyWorker = null;
  for (const [, resolve] of pyPending) {
    resolve({ ok: false, output: "", error: errorMessage });
  }
  pyPending.clear();
}

function getPythonWorker() {
  if (!pyWorker) {
    const url = URL.createObjectURL(new Blob([PY_WORKER_SOURCE], { type: "text/javascript" }));
    pyWorker = new Worker(url);

    pyWorker.onmessage = (e) => {
      const resolve = pyPending.get(e.data.id);
      if (resolve) {
        pyPending.delete(e.data.id);
        resolve(e.data);
      }
    };
    pyWorker.onerror = () =>
      resetPythonWorker(
        "Could not load the Python runtime. Check your internet connection and try again."
      );
  }
  return pyWorker;
}

function runPython(code) {
  return new Promise((resolve) => {
    const worker = getPythonWorker();
    const id = ++pyRequestId;

    const timer = setTimeout(() => {
      pyPending.delete(id);
      // Terminate so an infinite loop can't keep running; it reloads on the next run
      worker.terminate();
      if (pyWorker === worker) pyWorker = null;
      resolve({
        ok: false,
        output: "",
        error: "Time limit exceeded. Check for an infinite loop.",
      });
    }, PY_TIMEOUT_MS);

    pyPending.set(id, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    worker.postMessage({ id, code });
  });
}

// Optional: call once when the problem page opens so the first Run Code click is fast
export function warmUpPython() {
  if (!PYTHON_ON_SERVER) getPythonWorker();
}

/* -------------------------------- Java --------------------------------- */

async function runOnServer(language, code, token) {
  const response = await fetch(`${API_URL}/code/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ language, code }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      output: "",
      error: data.error || `HTTP error! status: ${response.status}`,
    };
  }
  if (data.stderr) return { ok: false, output: data.stdout, error: data.stderr };
  return { ok: true, output: data.stdout };
}

/* ------------------------------ Public API ----------------------------- */

/**
 * Same result shape as before, so ProblemPage's test checking is unchanged.
 * @returns {Promise<{success:boolean, output?:string, error?:string}>}
 */
export async function executeCode(language, code, token) {
  if (!code || !code.trim()) {
    return { success: false, error: "Write some code first." };
  }

  try {
    let result;

    if (language === "javascript") {
      result = await runJavaScript(code);
    } else if (language === "python") {
      result = PYTHON_ON_SERVER
        ? await runOnServer("python", code, token)
        : await runPython(code);
    } else if (language === "java") {
      result = await runOnServer("java", code, token); // token is needed for server runs
    } else {
      return { success: false, error: `Unsupported language: ${language}` };
    }

    if (!result.ok) {
      return { success: false, output: result.output, error: result.error };
    }
    return { success: true, output: result.output || "No output" };
  } catch (error) {
    return { success: false, error: `Failed to execute code: ${error.message}` };
  }
}