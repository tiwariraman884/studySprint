// Password policy, aligned with the Supabase project default.
//
// The server is authoritative: a project can set a different minimum or require
// character classes. The client checks the same minimum (6) and the same classes
// so a student is told exactly what is missing before a request is made,
// instead of "Choose a longer password" when the real problem is a missing
// capital or symbol. Server responses remain the final word.

export const MIN_LENGTH = 6;

export const CLASSES = [
  { id: "lower", label: "a lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "an uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "a number", test: (p) => /[0-9]/.test(p) },
  { id: "symbol", label: "a symbol such as ! ? # @", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** Everything wrong with a candidate password. Empty array means acceptable. */
export function checkPassword(password) {
  const value = String(password || "");
  const problems = [];
  if (value.length < MIN_LENGTH) problems.push(`at least ${MIN_LENGTH} characters`);
  for (const rule of CLASSES) if (!rule.test(value)) problems.push(rule.label);
  return problems;
}

/** A single sentence naming exactly what is missing. */
export function describePasswordProblems(password) {
  const problems = checkPassword(password);
  if (!problems.length) return "";
  if (problems.length === 1) return `Your password needs ${problems[0]}`;
  return `Your password needs ${problems.slice(0, -1).join(", ")} and ${problems[problems.length - 1]}.`;
}

export function isStrongEnough(password) {
  return checkPassword(password).length === 0;
}
