/**
 * Regression test for the deepLabel-into-closure-environments fix
 * (evaluator.ts).
 *
 * §3.3 defines `deepLabel(e)` as "the join of every label occurring
 * anywhere in e, however deeply nested (record fields, array elements,
 * EVEN LAMBDA BODIES)". In the paper's substitution-based semantics, a
 * closure's body is an ordinary Expr that may contain literal `l:v`
 * labeled-value subterms wherever an earlier application substituted
 * them in — so `deepLabel` has to walk it like any other structure. This
 * port is environment-based: a closure's (unevaluated) `body` field
 * never contains substituted values at all — they live in the closure's
 * captured `env` instead. The `deepLabel` helper recursed into records
 * and arrays but never into a closure's captured environment, so a
 * secret captured by a closure was invisible to it entirely.
 *
 *   let secret = ["S"]:"shh" in
 *   let fn = \_. secret in       -- fn's OWN label is bottom; the taint
 *                                   only lives in what it captured
 *   send { holder: fn }          -- the record's shallow label is also bottom
 *
 * Not a textual leak (closures serialise to an opaque placeholder, never
 * their captured values) but a real Confinement violation: the
 * conversation's resulting label under-counts what was actually embedded
 * into it, so a *later* `recv` on this same conversation would
 * incorrectly evaluate its parsed response at a too-low pc — exactly the
 * same class of bug as the already-fixed var/field/deepLabel confinement
 * issues, just reached through a closure's captured environment instead
 * of a record field or a policy value.
 */
import { labelLit, lam, letIn, record, send, str, v } from "../src/ast.js";
import { S, usLattice } from "../src/lattice.js";
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

async function main() {
  const program = letIn(
    "secret",
    labelLit(S, str("shh")),
    letIn("fn", lam("_", v("secret")), send(record([["holder", v("fn")]]))),
  );
  const run = newRunState();
  const result = await evaluate(model, scriptedOracle([]), run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
  const isSecretTainted = usLattice.flowsTo(S, result.conv.label);
  console.log(
    isSecretTainted ? "PASS" : "FAIL (CONFINEMENT BUG)",
    "sending a record holding a closure that captured a secret taints the conversation: label =",
    usLattice.show(result.conv.label),
  );
  if (!isSecretTainted) process.exit(1);
}

main();
