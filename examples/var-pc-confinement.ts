/**
 * Regression test for the var/field pc-confinement fix (evaluator.ts).
 *
 * This is a second instance of the Fenton/Denning implicit-flow pattern
 * (§1, §3.4) — the paper's own worked example shows the leak via a
 * *write* (`send` inside a secret-tainted `if`); this variant shows the
 * same class of leak via a *read*: a value bound OUTSIDE a secret branch
 * gets referenced INSIDE it, and the read must come back re-tainted by
 * the branch's pc, or the branch's existence (and by extension the
 * secret condition that selected it) escapes untracked.
 *
 *   let pub = "public value" in         -- bound at bottom label
 *   let secret = true in
 *   if ["S"]:secret
 *     then pub                          -- read `pub` from inside a secret branch
 *     else pub
 *
 * Confinement (Lemma 1, §3.3) requires: pc ⊑ ℓ(result). The `then`
 * branch runs at pc = ["S"] (the secret condition's own label, joined
 * in by the `if` rule) — so the returned `pub` value, however it was
 * originally labeled, MUST come back carrying at least ["S"] once
 * observed through this branch. If it doesn't, that's exactly the
 * "implicit flow through a variable reference inside a tainted branch"
 * hole this test exists to catch.
 *
 * A companion record-field version checks the same thing through
 * `⇓-FieldAccess` instead of a bare variable.
 */
import { bool, field, ifThenElse, labelLit, letIn, record, str, v } from "../src/ast.js";
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

async function testVarConfinement() {
  const program = letIn(
    "pub",
    str("public value"),
    letIn(
      "secret",
      bool(true),
      ifThenElse(labelLit(S, v("secret")), v("pub"), v("pub")),
    ),
  );
  const run = newRunState();
  const result = await evaluate(
    model,
    scriptedOracle([]),
    run,
    usLattice.bottom,
    emptyConversation(usLattice.bottom),
    program,
    new Map(),
  );
  const isSecretTainted = usLattice.flowsTo(S, result.value.label);
  console.log(
    isSecretTainted ? "PASS" : "FAIL (CONFINEMENT BUG)",
    "var read through a secret branch is re-tainted: label =",
    usLattice.show(result.value.label),
  );
  if (!isSecretTainted) process.exit(1);
}

async function testFieldConfinement() {
  const program = letIn(
    "rec",
    record([["pub", str("public value")]]),
    letIn(
      "secret",
      bool(true),
      ifThenElse(labelLit(S, v("secret")), field(v("rec"), "pub"), field(v("rec"), "pub")),
    ),
  );
  const run = newRunState();
  const result = await evaluate(
    model,
    scriptedOracle([]),
    run,
    usLattice.bottom,
    emptyConversation(usLattice.bottom),
    program,
    new Map(),
  );
  const isSecretTainted = usLattice.flowsTo(S, result.value.label);
  console.log(
    isSecretTainted ? "PASS" : "FAIL (CONFINEMENT BUG)",
    "field read through a secret branch is re-tainted: label =",
    usLattice.show(result.value.label),
  );
  if (!isSecretTainted) process.exit(1);
}

async function main() {
  await testVarConfinement();
  await testFieldConfinement();
}

main();
