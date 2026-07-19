/**
 * §3.4's worked example: a secret-dependent `if` tries to upgrade the
 * conversation label to secret only on the branch where the secret holds,
 * mimicking the classic Fenton/Denning implicit-flow gadget CaMeL's
 * dynamic tracker misses (§1). LLMbda's `send` rule (no-high-upgrade)
 * refuses this outright — where the leak lives in CaMeL, this port
 * should throw a SecurityError.
 *
 * Concretely:
 *   let secret = true in
 *   let _ = @'Remember this value: x = false' in
 *   let _ = if ["S"]:secret then @'Set x = true' else () in
 *   @'Give me the value of x'
 *
 * We don't have a real LLM handy, so the oracle just needs to supply
 * *something* for the first @-call; the SecurityError should fire before
 * the second recv is ever reached, so its scripted response is unused.
 */
import { app, bool, clear as clearExpr, endorse as _unused, fork as forkExpr, ifThenElse, labelLit, letIn, nullLit, prompt, str, v } from "../src/ast.js";
import { S, U, usLattice } from "../src/lattice.js";
import { emptyConversation, evaluate, newRunState } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { scriptedOracle } from "../src/oracle.js";
import { SecurityError } from "../src/errors.js";

void _unused; void U; // (imported for symmetry with other examples; unused here)

const model: Model<typeof usLattice.bottom> = {
  lattice: usLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: (v) => {
    if (v.kind === "array" && v.items.every((i) => i.value.kind === "string")) {
      return v.items.map((i) => (i.value as { kind: "string"; value: string }).value) as typeof usLattice.bottom;
    }
    return undefined;
  },
  fromLabel: (l) => ({ kind: "array", items: l.map((tag) => ({ label: usLattice.bottom, value: { kind: "string", value: tag } })) }),
};

const program = letIn(
  "secret",
  bool(true),
  letIn(
    "_1",
    prompt(str("Remember this value: x = false")),
    letIn(
      "_2",
      ifThenElse(labelLit(S, v("secret")), prompt(str("Set x = true")), nullLit),
      prompt(str("Give me the value of x")),
    ),
  ),
);

async function main() {
  const oracle = scriptedOracle(["{}", "{}", "{}"]); // never actually consulted past the first send
  const run = newRunState();
  try {
    await evaluate(model, oracle, run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
    console.error("FAIL: expected a SecurityError but the program completed normally");
    process.exit(1);
  } catch (e) {
    if (e instanceof SecurityError) {
      console.log("PASS: send correctly refused the illegal label upgrade:");
      console.log("  ->", e.message);
    } else {
      console.error("FAIL: expected a SecurityError, got:", e);
      process.exit(1);
    }
  }
}

// keep unused imports referenced for future variants of this example
void clearExpr;
void forkExpr;
void app;

main();
