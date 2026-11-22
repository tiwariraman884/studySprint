// Password policy must match what the project enforces, and say exactly what is
// missing. Observed from a live project: minimum 6 characters, and lowercase,
// uppercase, digit and symbol are all required. The old client checked 8 and
// said "Use at least 8 characters", so a 6-character password with a symbol was
// rejected with a misleading "Choose a longer password" message.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_LENGTH,
  checkPassword,
  describePasswordProblems,
  isStrongEnough,
} from "../src/client/core/password-policy.js";

test("the minimum length matches the project default", () => {
  assert.equal(MIN_LENGTH, 6);
});

test("a password meeting every rule is accepted", () => {
  for (const password of ["Abc1!x", "SprintCheck-2026!", "Aa1!aa"]) {
    assert.equal(isStrongEnough(password), true, password);
    assert.equal(describePasswordProblems(password), "", password);
  }
});

test("a short password is told it is short", () => {
  const message = describePasswordProblems("A1!");
  assert.match(message, /at least 6 characters/);
});

test("a missing character class is named instead of asking for more length", () => {
  // This is the case that produced the confusing message.
  const message = describePasswordProblems("Password1");
  assert.match(message, /symbol/);
  assert.doesNotMatch(message, /at least 6 characters/, "length is not the problem here");
  assert.equal(checkPassword("Password1").length, 1);
});

test("every missing rule is listed, in one sentence", () => {
  const message = describePasswordProblems("abc");
  for (const part of ["at least 6 characters", "an uppercase letter", "a number", "a symbol"]) {
    assert.ok(message.includes(part), `${part} missing from: ${message}`);
  }
  assert.match(message, /\.$/);
});
