/**
 * §2.1: extract and normalise a UK postcode from an address string,
 * using `fork` so each of several extractions is independent of the
 * others (the isolation mechanism that stands in for a dual-LLM split).
 *
 *   let extract = \addr.
 *     let r = fork @("Extract: " + addr) in
 *     if r.[0] then r.[1] else "error"
 *
 * We don't call a real model — the scripted oracle stands in for the
 * three @-calls `extract` makes, one per address, in order.
 */
import { app, array, binop, fork, ifThenElse, index, lam, letIn, prompt, str, v } from "../src/ast.js";
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

const extract = lam(
  "addr",
  letIn(
    "r",
    fork(prompt(binop("+", str("Extract: "), v("addr")))),
    ifThenElse(index(v("r"), { kind: "scalar", value: { kind: "number", value: 0 } }), index(v("r"), { kind: "scalar", value: { kind: "number", value: 1 } }), str("error")),
  ),
);

const program = letIn(
  "extract",
  extract,
  array([
    app(v("extract"), str("10 Downing Street, London SW1A2AA")),
    app(v("extract"), str("221B Baker Street, London NW16XE")),
    app(v("extract"), str("Old Trafford, Manchester M16 0RA")),
  ]),
);

async function main() {
  // one canned "extracted postcode" JSON string per address, in order
  const oracle = scriptedOracle([
    JSON.stringify("SW1A 2AA"),
    JSON.stringify("NW1 6XE"),
    JSON.stringify("M16 0RA"),
  ]);
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
  if (result.value.value.kind !== "array") throw new Error("expected an array result");
  const postcodes = result.value.value.items.map((it) => {
    if (it.value.kind !== "string") throw new Error("expected string postcodes");
    return it.value.value;
  });
  const expected = ["SW1A 2AA", "NW1 6XE", "M16 0RA"];
  const ok = JSON.stringify(postcodes) === JSON.stringify(expected);
  console.log(ok ? "PASS" : "FAIL", "postcodes:", postcodes);
  if (!ok) process.exit(1);
}

main();
