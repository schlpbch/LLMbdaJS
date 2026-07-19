/**
 * Regression test for the deepLabel fix in labelDyn/labelTest/labelAssert/
 * endorse (evaluator.ts).
 *
 * §3.3/§B.1's ⇓-LabelFlow, ⇓-LabelTest, ⇓-LabelAssert, and ⇓-Endorse rules
 * all require `flatten(V1) = n:v1`, where `flatten`'s `n = deepLabel(V1)`
 * — the join of every label nested anywhere inside the evaluated
 * label-describing value, not just its own shallow/top-level label. A
 * label VALUE (e.g. an array of tag strings) can itself have deeper taint
 * than its outer wrapper shows — e.g. an array literal whose individual
 * elements are separately `labelLit`'d — and that taint must be counted
 * when computing how far the enclosing pc gets raised, or it silently
 * escapes tracking.
 *
 * This is a third instance of the same "shallow label instead of deep
 * label" bug class as the already-fixed var/field confinement bug (see
 * var-pc-confinement.ts) — found via rule-by-rule comparison against the
 * paper's formal semantics rather than by an end-to-end attack scenario,
 * but concretely demonstrable: a `labelAssert` whose *policy* value is
 * itself secretly tainted must be refused (the secret cannot be allowed
 * to determine which policy check silently fires), per ⇓-LabelAssert's
 * `n ⊑ pc` side condition.
 *
 *   policy = [ ["S"]:"U" ]     -- decodes (by string content) to ["U"],
 *                                 but the one element is itself Secret
 *   assert policy ["U"]:"irrelevant"
 *
 * deepLabel(policy's value) = ["S"] (from the nested labelLit), even
 * though the array's own shallow/top-level label is []. Since
 * ["S"] does not flow to pc=[], the assert must be refused.
 */
import { array, labelAssert, labelDyn, labelLit, letIn, str, v } from "../src/ast.js";
import { S, U, usLattice } from "../src/lattice.js";
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

async function testLabelAssertDeepTaint() {
  // policy decodes to ["U"], but its element is individually [S]-tagged.
  const policy = array([labelLit(S, str("U"))]);
  const data = labelLit(U, str("irrelevant"));
  const program = labelAssert(policy, data);

  const run = newRunState();
  try {
    await evaluate(model, scriptedOracle([]), run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
    console.error("FAIL (CONFINEMENT BUG): expected a SecurityError but the assert succeeded");
    process.exit(1);
  } catch (e) {
    if (e instanceof SecurityError) {
      console.log("PASS: labelAssert correctly refused a secretly-tainted policy value:");
      console.log("  ->", e.message);
    } else {
      console.error("FAIL: expected a SecurityError, got:", e);
      process.exit(1);
    }
  }
}

async function testLabelDynDeepTaint() {
  // Same idea via labelDyn: the label-describing value's deep taint must
  // raise pc for the guarded sub-expression, even though the array
  // wrapping the tag string was never itself under a labelLit.
  const dynamicLabel = array([labelLit(S, str("U"))]); // deepLabel = [S], decodes to ["U"]
  const program = letIn(
    "tagged",
    labelDyn(dynamicLabel, str("payload")),
    v("tagged"),
  );

  const run = newRunState();
  const result = await evaluate(model, scriptedOracle([]), run, usLattice.bottom, emptyConversation(usLattice.bottom), program, new Map());
  const isSecretTainted = usLattice.flowsTo(S, result.value.label);
  console.log(
    isSecretTainted ? "PASS" : "FAIL (CONFINEMENT BUG)",
    "labelDyn's target pc is raised by the label value's deep taint: label =",
    usLattice.show(result.value.label),
  );
  if (!isSecretTainted) process.exit(1);
}

async function main() {
  await testLabelAssertDeepTaint();
  await testLabelDynDeepTaint();
}

main();
