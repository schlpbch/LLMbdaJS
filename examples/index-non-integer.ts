/**
 * Copyright (c) Andreas Schlapbach <schlpbch@asc.engineering>
 */
/**
 * Regression test for the non-integer array index fix (evaluator.ts).
 *
 * §B.1's `⇓-ArrayIndex` takes an index via `Rat.num(i)` — the numerator
 * of the rational number `i` in lowest terms — and requires `0 ⊑ i` and
 * `Rat.num(i) < |V⃗|`. This port's `number` scalar is a plain JS float,
 * not a rational type, so it can't reproduce `Rat.num`'s exact behavior
 * for a genuinely fractional index; the pragmatic choice is to require
 * an actual integer and fail with a clean `RuntimeError` otherwise.
 *
 * `case "index"` previously validated only `idx < 0` and
 * `idx >= items.length`, missing the integer check entirely — a
 * non-integer index like `1.5` passed both bounds checks (1.5 is neither
 * negative nor out of range for a 3-element array) and was then used
 * directly as a JS array index (`items[1.5]`), which JS silently
 * evaluates to `undefined` rather than erroring — the interpreter then
 * crashed with an uncaught `TypeError: Cannot read properties of
 * undefined (reading 'label')` instead of a clean, catchable
 * `RuntimeError`.
 */
import { array, index, num, str } from "../src/ast.js";
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
  const program = index(array([str("a"), str("b"), str("c")]), num(1.5));
  const run = newRunState();
  try {
    await evaluate(model, scriptedOracle([]), run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
    console.error("FAIL: expected a RuntimeError but the non-integer index was silently accepted");
    process.exit(1);
  } catch (e) {
    if (e instanceof RuntimeError) {
      console.log("PASS: non-integer array index correctly refused with a clean RuntimeError:");
      console.log("  ->", e.message);
    } else {
      console.error("FAIL (CRASH): expected a RuntimeError, got:", e);
      process.exit(1);
    }
  }
}

main();
