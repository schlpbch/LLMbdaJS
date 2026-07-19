/**
 * §2.2: a retry loop that keeps prompting until a response parses
 * successfully, feeding the previous error back into the next prompt.
 * This exercises `fix` (recursion via the paper's Y-combinator, §C.5)
 * and a multi-turn oracle that only "succeeds" on its second attempt —
 * standing in for an LLM that gets the syntax wrong once, then recovers
 * once it sees the error message, which is exactly the shape of Leak 2's
 * retry-loop hazard (§1) done *correctly*: this loop lives inside the
 * calculus, so every retry is still subject to the send/recv taint rules.
 *
 *   let retry = fix (\self. \round. \max. \prompt.
 *     if round > max then [false, "max retries"] else
 *     let r = @prompt in
 *     if r.[0] then [true, r.[1], round]
 *     else self (round + 1) max "Error: {r.[1]}. Try again.")
 */
import { app, appN, binop, bool, fix, ifThenElse, index, lam, letIn, num, prim, prompt, record, str, v } from "../src/ast.js";
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

const idx = (e: Parameters<typeof index>[0], n: number) => index(e, num(n));

const retry = fix(
  lam(
    "self",
    lam(
      "round",
      lam(
        "max",
        lam(
          "prompt_",
          ifThenElse(
            binop(">", v("round"), v("max")),
            record([
              ["0", bool(false)],
              ["1", str("max retries")],
            ]),
            letIn(
              "r",
              prompt(v("prompt_")),
              ifThenElse(
                idx(v("r"), 0),
                record([
                  ["0", bool(true)],
                  ["1", idx(v("r"), 1)],
                  ["2", v("round")],
                ]),
                appN(
                  v("self"),
                  binop("+", v("round"), num(1)),
                  v("max"),
                  binop("+", str("Error: retry-me. Try again. attempt="), prim("toStr", v("round"))),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
);

const program = letIn(
  "retry",
  retry,
  appN(v("retry"), num(1), num(5), str("Write the factorial function")),
);

async function main() {
  // First attempt "fails" to parse (garbage), second attempt succeeds —
  // mirroring an LLM that gets the syntax wrong once, then self-corrects
  // once it sees the fed-back error message.
  const oracle = ruleOracle((_history, callIndex) => {
    if (callIndex === 0) return "not valid json {{{";
    return JSON.stringify("factorial-function-placeholder");
  });
  const run = newRunState();
  const result = await evaluate(
    model,
    oracle,
    run,
    usLattice.bottom,
    emptyConversation(usLattice.bottom),
    program,
    new Map(),
  );
  if (result.value.value.kind !== "record") throw new Error("expected a record result");
  const ok = result.value.value.fields.get("0");
  const val = result.value.value.fields.get("1");
  const round = result.value.value.fields.get("2");
  const succeeded = ok && ok.value.kind === "bool" && ok.value.value === true;
  const roundsTaken = round && round.value.kind === "number" ? round.value.value : undefined;
  console.log(
    succeeded && roundsTaken === 2 ? "PASS" : "FAIL",
    "succeeded:",
    succeeded,
    "value:",
    val?.value.kind === "string" ? val.value.value : val?.value,
    "rounds taken:",
    roundsTaken,
  );
  if (!(succeeded && roundsTaken === 2)) process.exit(1);
}

main();
