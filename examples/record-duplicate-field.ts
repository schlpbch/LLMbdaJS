/**
 * Regression test for the duplicate-field-shadowing fix in `case
 * "record"` (evaluator.ts).
 *
 * §B.1's `⇓-FieldAccess` rule resolves field reads via a `lookup(f, f⃗)`
 * helper, whose text is explicit: "returns the value of the first field
 * named f in the field list f⃗ (a duplicate field is shadowed by the
 * first)". A record literal with two entries under the same name must
 * therefore behave as though the *earlier* one wins — the later
 * occurrence is present in the field list but never observable through
 * `lookup`.
 *
 * `case "record"` built its result with a plain `Map`, whose `.set()`
 * unconditionally overwrites on a repeated key — the opposite of the
 * spec's rule: the *last* occurrence silently won instead of the first.
 * Every field's expression is still evaluated in source order regardless
 * (side effects — a `send`/`recv` inside a shadowed field's value — must
 * still happen, per `⇓-Record Cons`'s recursive structure); only which
 * *value* ends up stored for a repeated key was wrong.
 */
import { field, letIn, prompt, record, str, v } from "../src/ast.js";
import { usLattice } from "../src/lattice.js";
import { emptyConversation, evaluate, newRunState } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { scriptedOracle } from "../src/oracle.js";

const model: Model<typeof usLattice.bottom> = {
  lattice: usLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: () => undefined,
  fromLabel: () => ({ kind: "record", fields: new Map() }),
};

async function testFirstWins() {
  const rec = record([
    ["a", str("first")],
    ["a", str("second")],
  ]);
  const run = newRunState();
  const result = await evaluate(model, scriptedOracle([]), run, usLattice.bottom, emptyConversation(usLattice.bottom), field(rec, "a"), new Map());
  const got = result.value.value.kind === "string" ? result.value.value.value : undefined;
  const ok = got === "first";
  console.log(ok ? "PASS" : "FAIL", "duplicate field 'a' resolves to the FIRST occurrence:", got);
  if (!ok) process.exit(1);
}

async function testShadowedSideEffectsStillFire() {
  // The shadowed (second) field's expression must still be evaluated —
  // its VALUE loses to the first occurrence, but its side effects
  // (a send/recv here) must not be skipped.
  const rec = record([
    ["a", str("kept")],
    ["a", prompt(str("should still fire even though shadowed"))],
  ]);
  const run = newRunState();
  const result = await evaluate(model, scriptedOracle([JSON.stringify("resp")]), run, usLattice.bottom, emptyConversation(usLattice.bottom), field(rec, "a"), new Map());
  const got = result.value.value.kind === "string" ? result.value.value.value : undefined;
  const sideEffectFired = result.conv.history.length === 2; // the shadowed field's send + recv
  const ok = got === "kept" && sideEffectFired;
  console.log(
    ok ? "PASS" : "FAIL",
    "shadowed field's value discarded but its side effects still ran: value =",
    got,
    "history length =",
    result.conv.history.length,
  );
  if (!ok) process.exit(1);
}

async function main() {
  await testFirstWins();
  await testShadowedSideEffectsStillFire();
}

main();
