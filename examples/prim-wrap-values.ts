/**
 * Regression test for the wrapValues fix in `prim`/`binop` (evaluator.ts).
 *
 * §B.1's ⇓-Prim rule requires a primitive's output be passed through
 * `wrapValues`, which stamps ⊥ onto every nested record field / array
 * element, however deeply nested. Without it, a composite result built
 * from `stripLabels`'d input (`recordUpdate`) or freshly constructed by a
 * primitive that doesn't know the concrete lattice (`shape`) carries no
 * *valid* label on its nested fields at all — reading one of those fields
 * back out via `field`/`index` unconditionally joins the container's
 * label with the field's, and joining with "no label" is not the same as
 * joining with ⊥ (the join-identity element): it's a type error, not a
 * label bottom, so field access into either primitive's result used to
 * crash the interpreter outright rather than compute a (correct) label.
 *
 *   shape("hello").type              -- reads a field of shape()'s own output
 *   recordUpdate({a:1,b:2}, "c", 3).a -- reads an UNTOUCHED field of the update
 *
 * Both must simply return their value with a valid label, not throw.
 */
import { array, field, letIn, num, prim, record, str, v } from "../src/ast.js";
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

async function run(name: string, program: ReturnType<typeof letIn>, expected: string) {
  const runState = newRunState();
  try {
    const result = await evaluate(model, scriptedOracle([]), runState, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
    const bv = result.value.value;
    const got = bv.kind === "string" || bv.kind === "number" ? String(bv.value) : JSON.stringify(bv);
    const ok = got === expected;
    console.log(
      ok ? "PASS" : "FAIL",
      `${name}: field access into the primitive's result returned`,
      got,
      "label:",
      usLattice.show(result.value.label),
    );
    if (!ok) process.exit(1);
  } catch (e) {
    console.error(`FAIL (CRASH): ${name} threw instead of returning a labeled value:`, e);
    process.exit(1);
  }
}

async function main() {
  await run(
    "shape",
    letIn("s", prim("shape", str("hello")), field(v("s"), "type")),
    "string",
  );
  await run(
    "recordUpdate (untouched field)",
    letIn(
      "r",
      prim("recordUpdate", array([record([["a", num(1)], ["b", num(2)]]), str("c"), num(3)])),
      field(v("r"), "a"),
    ),
    "1",
  );
}

main();
