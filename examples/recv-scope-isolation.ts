/**
 * Regression test for the recv scope-isolation fix (evaluator.ts).
 *
 * §3.3's ⇓-Recv rule evaluates a freshly-parsed response as
 * `M.parse(r)[M.preludeEnv]` — only prelude identifiers are substituted
 * into it. The calling program's own local bindings must stay invisible
 * to LLM-generated code: nothing in the rule threads the caller's
 * environment into the parsed response at all.
 *
 * The interpreter previously merged the caller's *entire* local
 * environment into scope for the parsed response (`mergeEnv(env,
 * preludeEnv)` instead of `preludeEnv` alone). Since a `recv`'d response
 * is, by construction, attacker-influenceable content, this meant a
 * sufficiently expressive `Model.parse` (a full LLMbda-syntax parser,
 * which is exactly what an agent that "writes code" as its plan — as
 * Randori does, §7.1 — needs) could resolve a bare variable reference in
 * the response straight to a same-named local binding of the calling
 * program, bypassing the label system entirely via name collision rather
 * than through any tracked flow. `defaultParse` (JSON-only) can't emit a
 * `var` AST node, so this hole is invisible to any example using it —
 * this test exercises it directly with a `parse` that can.
 *
 *   let apiKey = "sk-super-secret" in @"irrelevant prompt"
 *
 * where the (simulated) LLM response, once parsed, is literally the free
 * variable reference `apiKey`. This MUST be an unbound-variable error —
 * `apiKey` is a name from the calling program's own local scope, not from
 * the prelude, so parsed response code has no business seeing it.
 */
import { letIn, prompt, str, v } from "../src/ast.js";
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

// A stand-in for a full LLMbda-syntax parser (unlike defaultParse's
// JSON-only grammar, this one CAN emit a bare `var` node) — the response
// text is irrelevant here; every response parses to `v("apiKey")`.
const modelWithCodeParser: Model<typeof usLattice.bottom> = { ...model, parse: () => v("apiKey") };

async function main() {
  const program = letIn("apiKey", str("sk-super-secret"), prompt(str("irrelevant prompt")));
  const run = newRunState();
  try {
    const result = await evaluate(
      modelWithCodeParser,
      scriptedOracle(["attacker-controlled response"]),
      run,
      usLattice.bottom,
      emptyConversation(usLattice.bottom),
      program,
      new Map(),
    );
    console.error(
      "FAIL (SCOPE LEAK): parsed response resolved 'apiKey' to the caller's local binding:",
      JSON.stringify(result.value.value),
      "label:",
      usLattice.show(result.value.label),
    );
    process.exit(1);
  } catch (e) {
    if (e instanceof RuntimeError && e.message.includes("unbound variable: apiKey")) {
      console.log("PASS: parsed response correctly could not see the caller's local scope:");
      console.log("  ->", e.message);
    } else {
      console.error("FAIL: expected an unbound-variable RuntimeError, got:", e);
      process.exit(1);
    }
  }
}

main();
