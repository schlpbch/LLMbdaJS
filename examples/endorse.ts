/**
 * Two tests in one file, both exercising `endorse` (§5) against the
 * factored {U,S}-powerset lattice (usFactoredLattice, lattice.ts):
 *
 * 1. §E.5 example (1): endorsing a {U}-tainted value with a bottom
 *    target washes it to {} — trusted — while leaving its content
 *    untouched. This is the mechanism §5.1's `bounded_endorse` prelude
 *    function relies on.
 *
 * 2. §E.5 example (2) / Theorem 2 (Insulated TIPNI), spot-checked: you
 *    CANNOT use endorse to launder confidentiality. Endorsing a
 *    {S}-tainted ("secret") value must still leave the result carrying
 *    the {S} tag — only the integrity axis is affected. If this test
 *    ever fails, the evaluator's endorse rule has a real bug (it would
 *    mean secrets can be laundered to public, which is exactly what
 *    Insulated TIPNI (Theorem 2) rules out in the paper).
 */
import { bool, endorse, labelLit, str } from "../src/ast.js";
import { BOTTOM, S, U, usFactoredLattice } from "../src/lattice.js";
import { emptyConversation, evaluate, newRunState } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { scriptedOracle } from "../src/oracle.js";

const model: Model<typeof usFactoredLattice.bottom> = {
  lattice: usFactoredLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: (v) => {
    if (v.kind === "array" && v.items.every((i) => i.value.kind === "string")) {
      return v.items.map((i) => (i.value as { kind: "string"; value: string }).value) as typeof usFactoredLattice.bottom;
    }
    return undefined;
  },
  fromLabel: (l) => ({ kind: "array", items: l.map((tag) => ({ label: usFactoredLattice.bottom, value: { kind: "string", value: tag } })) }),
};

const targetLabel = (tags: ReadonlyArray<string>) => ({
  kind: "array" as const,
  items: tags.map((t) => ({ kind: "scalar" as const, value: { kind: "string" as const, value: t } })),
});

async function testWash() {
  // endorse [] (["U"]:"untrusted") should yield an untagged value with
  // the same content — §E.5 example (1).
  const program = endorse(targetLabel([]), labelLit(U, str("untrusted")));
  const run = newRunState();
  const result = await evaluate(
    model,
    scriptedOracle([]),
    run,
    usFactoredLattice.bottom,
    emptyConversation(usFactoredLattice.bottom),
    program,
    new Map(),
  );
  const label = result.value.label;
  const ok =
    usFactoredLattice.equals(label, BOTTOM) &&
    result.value.value.kind === "string" &&
    result.value.value.value === "untrusted";
  console.log(ok ? "PASS" : "FAIL", "wash {U}->{}: label =", usFactoredLattice.show(label), "value =", result.value.value);
  if (!ok) process.exit(1);
}

async function testNoDeclassification() {
  // endorse [] (["S"]:"password") must NOT drop the {S} tag — §E.5
  // example (2): endorse only weakens integrity, never confidentiality.
  const program = endorse(targetLabel([]), labelLit(S, str("password")));
  const run = newRunState();
  const result = await evaluate(
    model,
    scriptedOracle([]),
    run,
    usFactoredLattice.bottom,
    emptyConversation(usFactoredLattice.bottom),
    program,
    new Map(),
  );
  const label = result.value.label;
  const stillSecret = usFactoredLattice.toConfidentiality(label).includes("S");
  console.log(
    stillSecret ? "PASS" : "FAIL (SECURITY BUG)",
    "endorse cannot declassify: label =",
    usFactoredLattice.show(label),
  );
  if (!stillSecret) process.exit(1);
}

async function main() {
  await testWash();
  await testNoDeclassification();
}

void bool;
main();
