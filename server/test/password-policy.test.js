// Unit tests for the shared password policy and reset-token helpers (no database needed).
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "unit-test-only-secret-0123456789abcdefghij";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  passwordProblem,
  isResetTokenShape,
  hashResetToken,
  randomToken,
} = require("../src/utils/security");

test("password length is 8–30 characters", () => {
  assert.match(passwordProblem("Ab1!xyz"), /8–30/); // 7
  assert.equal(passwordProblem("Ab1!wxyz"), null); // 8
  assert.equal(passwordProblem("Ab1!" + "x".repeat(26)), null); // 30
  assert.match(passwordProblem("Ab1!" + "x".repeat(27)), /8–30/); // 31
  assert.equal(passwordProblem("Ab1!😀😀😀😀"), null); // emoji count as one character each
});

test("existing strength rules are preserved", () => {
  assert.match(passwordProblem("ab1!wxyz"), /uppercase/);
  assert.match(passwordProblem("AB1!WXYZ"), /lowercase/);
  assert.match(passwordProblem("Abc!wxyz"), /number/);
  assert.match(passwordProblem("Abc1wxyz"), /special/);
  assert.equal(passwordProblem(undefined), "Password is required.");
  assert.equal(passwordProblem(""), "Password is required.");
});

test("reset tokens: 43-char base64url, hashed deterministically, hash never equals token", () => {
  const t = randomToken(32);
  assert.equal(isResetTokenShape(t), true);
  assert.equal(isResetTokenShape(t + "x"), false);
  assert.equal(isResetTokenShape("../etc/passwd"), false);
  assert.equal(isResetTokenShape(undefined), false);
  const h = hashResetToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashResetToken(t));
  assert.notEqual(h, t);
  assert.notEqual(hashResetToken(randomToken(32)), h);
});
