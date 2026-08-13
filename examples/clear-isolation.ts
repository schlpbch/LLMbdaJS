/**
 * Copyright (c) Andreas Schlapbach <schlpbch@asc.engineering>
 */
/**
 * `clear` (§3.1) as the actual isolation mechanism behind `quarantine`
 * (§5.1, prelude.ts's `quarantineDef` = `fork(let _ = clear in @prompt)`).
 * examples/quarantine-classify.ts calls the prelude's `quarantine`
 * black-box and checks its *label* effects; this example opens the box
 * and checks the thing `clear` is actually for: wiping conversation
 * HISTORY before a forked sub-call, so a quarantined LLM call doesn't
 * see the outer conversation's prior turns in its prompt.
 *
 * `fork` alone only isolates outward (the caller never sees what the
 * forked body did to the conversation) — it does nothing about what the
 * forked body itself sees on the way IN, since it starts from a
 * snapshot of the outer conversation's full history. `clear` is what
 * blanks that snapshot. We prove this by using a `ruleOracle` that
 * records the literal `history` array it's called with at each `recv`,
 * and checking whether a sensitive detail from the first turn ("Alice",
 * an account number) leaks into the forked call's prompt history.
 */
import { clear as clearExpr, fork, letIn, prompt, str } from "../src/ast.js";
import { usLattice } from "../src/lattice.js";
import { emptyConversation, evaluate, newRunState } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { ruleOracle } from "../src/oracle.js";

const model: Model<typeof usLattice.bottom> = {
  lattice: usLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: () => undefined,
  fromLabel: () => ({ kind: "record", fields: new Map() }),
};

const SENSITIVE_TURN = "Hello, I am user Alice, my account number is 12345.";

async function runCase(label: string, withClear: boolean) {
  const seenHistories: string[][] = [];
  const oracle = ruleOracle((history, callIndex) => {
    seenHistories.push([...history]);
    return callIndex === 0 ? JSON.stringify("ok, got your details") : JSON.stringify("Summary: a user reached out.");
  });

  const forkedBody = withClear
    ? letIn("_c", clearExpr, prompt(str("Summarize the conversation so far.")))
    : prompt(str("Summarize the conversation so far."));
  const program = letIn("_1", prompt(str(SENSITIVE_TURN)), fork(forkedBody));

  const run = newRunState();
  await evaluate(model, oracle, run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());

  const forkedCallHistory = seenHistories[1] ?? [];
  const leaked = forkedCallHistory.some((h) => h.includes("Alice") || h.includes("12345"));
  console.log(`[${label}] forked call's history:`, JSON.stringify(forkedCallHistory));
  return !leaked;
}

async function main() {
  const leakedWithoutClear = !(await runCase("without clear", false));
  const isolatedWithClear = await runCase("with clear", true);

  const ok = leakedWithoutClear && isolatedWithClear;
  console.log(ok ? "\nPASS" : "\nFAIL", "- prior turn leaked into the forked call without clear, isolated with clear");
  if (!ok) process.exit(1);
}

main();
