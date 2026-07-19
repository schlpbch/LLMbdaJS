/**
 * Regression test for the binop/prim consistency fix (evaluator.ts).
 *
 * §B.1 defines binary operators as sugar: `e1 ⊕ e2 ≜ prim "binop_⊕"
 * [e1, e2]` — so `case "binop"` and `case "prim"` must treat their
 * argument identically: strip labels before calling `Model.primEval`,
 * and pass the result through `wrapValues` afterward. `case "prim"` did
 * both; `case "binop"` did neither, so a custom `primEval` that (validly,
 * per its type signature) inspects labels, or returns a composite value,
 * would see different, inconsistent behaviour depending on whether the
 * caller wrote `prim("binop_add", [x, y])` directly or used `x + y`
 * sugar — invisible with the packaged `defaultPrimEval`, which ignores
 * labels entirely, but a real divergence from the spec and a latent trap
 * for any richer primitive table.
 *
 * This custom primEval, registered for "binop_add", both (a) reports
 * whether the labels on its input were already stripped when it was
 * called, and (b) returns a composite (record) result — so this single
 * test also exercises wrapValues on binop's result path, the same way
 * prim-wrap-values.ts does for the `prim` path.
 */
import { binop, field, num } from "../src/ast.js";
import { usLattice } from "../src/lattice.js";
import { emptyConversation, evaluate, newRunState } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { scriptedOracle } from "../src/oracle.js";
import type { BareValue } from "../src/ast.js";

function customPrimEval(name: string, arg: BareValue): BareValue {
  if (name === "binop_add" && arg.kind === "array") {
    const strippedBeforeCall = arg.items.every((i) => (i as { label: unknown }).label === undefined);
    return {
      kind: "record",
      fields: new Map([["strippedBeforeCall", { label: undefined as never, value: { kind: "bool", value: strippedBeforeCall } }]]),
    };
  }
  return defaultPrimEval(name, arg);
}

const model: Model<typeof usLattice.bottom> = {
  lattice: usLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: customPrimEval,
  toLabel: () => undefined,
  fromLabel: () => ({ kind: "record", fields: new Map() }),
};

async function main() {
  // 1 + 2 with a primEval that reports whether its input arrived
  // stripped, and returns a fresh composite value.
  const program = field(binop("+", num(1), num(2)), "strippedBeforeCall");

  const run = newRunState();
  try {
    const result = await evaluate(model, scriptedOracle([]), run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
    const bv = result.value.value;
    const strippedBeforeCall = bv.kind === "bool" ? bv.value : undefined;
    const ok = strippedBeforeCall === true;
    console.log(
      ok ? "PASS" : "FAIL",
      "binop stripped labels before calling primEval, and wrapValues let the result's field be read back:",
      strippedBeforeCall,
      "label:",
      usLattice.show(result.value.label),
    );
    if (!ok) process.exit(1);
  } catch (e) {
    console.error("FAIL (CRASH): reading a field of binop's primEval result threw:", e);
    process.exit(1);
  }
}

main();
