/**
 * Distinguishing SecurityError from RuntimeError matters: a SecurityError
 * is the interpreter refusing to perform an illegal information flow
 * (the `send` no-high-upgrade check, a failed `assert`) — this is the
 * calculus *working correctly*, not a bug. A RuntimeError is an ordinary
 * program fault (unbound variable, type mismatch, etc). Keeping them
 * separate lets test suites assert "this SHOULD throw SecurityError"
 * for the paper's leak examples, distinct from "this is a real bug".
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}
