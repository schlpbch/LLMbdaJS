/**
 * Copyright (c) Andreas Schlapbach <schlpbch@asc.engineering>
 */
/**
 * §3.2's dynamic label form `e1 : e2` (`labelDyn` in ast.ts/evaluator.ts) —
 * every other example in this repo only uses `labelLit` (`l : e`), where
 * the label is a literal the program author wrote down ahead of time.
 * `labelDyn` decodes the label from a runtime VALUE instead — here, a
 * sensitivity tag the LLM itself attaches to its own response, which the
 * program can't know until after the recv completes.
 *
 * This is the same Fenton/Denning implicit-flow shape as
 * examples/fenton-denning-leak.ts (a secret-dependent `if` tries to
 * upgrade the conversation label only on the branch where the secret
 * holds), except the secret's OWN label isn't a compile-time `labelLit`
 * — the LLM declares it at runtime:
 *
 *   let _1 = @"Hello" in
 *   let resp = (@"Should I escalate? Reply {sensitivity:[...], value:bool}").[1] in
 *   let flag = resp.sensitivity : resp.value in   -- dynamically labeled
 *   if flag then @"Escalating..." else null
 *
 * If the LLM tags its own `value` field as `["S"]`, `if`'s branch-pc
 * rule raises the ambient pc to `[S]` for the `then` branch (Denning's
 * implicit-flow tracking), and the nested `send` is refused by the same
 * no-high-upgrade check that closes Leak 1 — proving enforcement doesn't
 * care whether the discriminating label was written by the program's
 * author or decided by the model at runtime.
 */
import { field, ifThenElse, index, labelDyn, letIn, nullLit, num, prompt, str, v } from "../src/ast.js";
import { usLattice } from "../src/lattice.js";
import { emptyConversation, evaluate, newRunState } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { scriptedOracle } from "../src/oracle.js";
import { SecurityError } from "../src/errors.js";

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
  "_1",
  prompt(str("Hello")),
  letIn(
    "resp",
    index(prompt(str("Should I escalate? Reply {sensitivity:[...], value:bool}")), num(1)),
    letIn(
      "flag",
      labelDyn(field(v("resp"), "sensitivity"), field(v("resp"), "value")),
      ifThenElse(v("flag"), prompt(str("Escalating...")), nullLit),
    ),
  ),
);

async function main() {
  const oracle = scriptedOracle([
    "{}", // response to the harmless "Hello" prompt
    JSON.stringify({ sensitivity: ["S"], value: true }), // the LLM declares its own answer secret
  ]);
  const run = newRunState();
  try {
    await evaluate(model, oracle, run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
    console.error("FAIL: expected a SecurityError but the program completed normally");
    process.exit(1);
  } catch (e) {
    if (e instanceof SecurityError) {
      console.log("PASS: branching on a dynamically-[S]-labeled flag correctly blocked the send:");
      console.log("  ->", e.message);
    } else {
      console.error("FAIL: expected a SecurityError, got:", e);
      process.exit(1);
    }
  }
}

main();
