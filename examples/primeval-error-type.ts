/**
 * Copyright (c) Andreas Schlapbach <schlpbch@asc.engineering>
 */
/**
 * Regression test for the model.ts error-type fix (model.ts).
 *
 * `errors.ts`'s own docstring states the point of splitting
 * `SecurityError` from `RuntimeError`: it "lets test suites assert
 * 'this SHOULD throw SecurityError' for the paper's leak examples,
 * distinct from 'this is a real bug'". Every validation failure inside
 * `defaultPrimEval` (`model.ts`) — a malformed `recordUpdate` call, an
 * unsupported `binop_eq` operand pair, an unknown primitive name, and so
 * on — is exactly the "real bug" category `RuntimeError` exists for, but
 * every one of them was thrown as a plain `Error` instead. Since
 * `case "prim"`/`case "binop"` in `evaluator.ts` don't wrap
 * `Model.primEval` in a try/catch that re-types the error, a plain
 * `Error` propagated all the way out of `evaluate()` uncaught — breaking
 * this repo's own documented invariant that callers can distinguish
 * "policy refusal" (`SecurityError`) from "genuine bug"
 * (`RuntimeError`) for every failure `evaluate()` can produce. Any code
 * (including this repo's own other regression examples, had they
 * exercised this path) doing `if (e instanceof RuntimeError) ...` would
 * silently fall through to an "unexpected error" branch for what is
 * actually a completely ordinary, expected validation failure.
 */
import { array, binop } from "../src/ast.js";
import { usLattice } from "../src/lattice.js";
import { emptyConversation, evaluate, newRunState } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { scriptedOracle } from "../src/oracle.js";
import { RuntimeError } from "../src/errors.js";

const model: Model<typeof usLattice.bottom> = {
  lattice: usLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: () => undefined,
  fromLabel: () => ({ kind: "record", fields: new Map() }),
};

async function main() {
  const run = newRunState();
  try {
    // binop_eq is only defined for scalars (§B.1) -- comparing two
    // arrays is exactly the kind of validation failure defaultPrimEval
    // is expected to reject.
    await evaluate(model, scriptedOracle([]), run, usLattice.bottom, emptyConversation(usLattice.bottom), binop("==", array([]), array([])), new Map());
    console.error("FAIL: expected a RuntimeError but the comparison succeeded");
    process.exit(1);
  } catch (e) {
    if (e instanceof RuntimeError) {
      console.log("PASS: a defaultPrimEval validation failure surfaces as a proper RuntimeError:");
      console.log("  ->", e.message);
    } else {
      console.error("FAIL: expected instanceof RuntimeError, got a plain error instead:", e);
      process.exit(1);
    }
  }
}

main();
