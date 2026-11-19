import confetti from "canvas-confetti";

export const getDifficultyBadgeClass = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case "easy":
      return "badge-success";
    case "medium":
      return "badge-warning";
    case "hard":
      return "badge-error";
    default:
      return "badge-ghost";
  }
};

// makes actual/expected outputs comparable (spacing, quotes, array formatting)
export const normalizeOutput = (output) => {
  if (typeof output !== "string") return "";

  return output
    .trim()
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/'/g, '"') // treat 'a' and "a" the same
        .replace(/\[\s+/g, "[")
        .replace(/\s+\]/g, "]")
        .replace(/\s*,\s*/g, ",")
    )
    .filter((line) => line.length > 0)
    .join("\n");
};

export const checkIfTestsPassed = (actualOutput, expectedOutput) =>
  normalizeOutput(actualOutput) === normalizeOutput(expectedOutput);

export const triggerConfetti = () => {
  [0.2, 0.8].forEach((x) =>
    confetti({
      particleCount: 80,
      spread: 250,
      origin: { x, y: 0.6 },
      zIndex: 2147483647,
    })
  );
};

// red screen flash shown when the user's code is wrong
export const triggerWrongFlash = () => {
  const flash = document.createElement("div");
  flash.className =
    "wrong-flash pointer-events-none fixed inset-0 z-[9999] bg-red-600/40 shadow-[inset_0_0_150px_rgba(220,38,38,0.9)]";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 800);
};