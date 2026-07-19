/**
 * §E.2: `robust_endorse` stamps an "E" tag on anything it endorses, and
 * refuses (via a stuck `assert`) to endorse a value that already carries
 * that tag. This blocks endorsement *cascades* — the one gap the plain
 * pc-bound argument (§E.1) leaves open, where an attacker could chain
 * endorse-then-endorse to accumulate trust.
 *
 *   robust_endorse [] (["U"]:"data")            -- first endorsement: succeeds
 *   robust_endorse [] (result of the above)      -- second endorsement: MUST fail
 */
import { appN, labelLit, str } from "../src/ast.js";
import { U, usFactoredLattice } from "../src/lattice.js";
import { emptyConversation, runProgram } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { buildPrelude, tagArray } from "../src/prelude.js";
import { scriptedOracle } from "../src/oracle.js";
import { SecurityError } from "../src/errors.js";

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
  preludeSource: buildPrelude(),
};

async function main() {
  // Step 1: robust_endorse a plain {U}-tainted value. Should succeed and
  // come back carrying the "E" (endorsed) tag stamped on, per §E.2.
  const firstEndorse = appN(
    { kind: "var", name: "robust_endorse" },
    tagArray([]),
    labelLit(U, str("data")),
  );
  const run1result = await runProgram(
    model,
    scriptedOracle([]),
    usFactoredLattice.bottom,
    emptyConversation(usFactoredLattice.bottom),
    firstEndorse,
  );
  const firstLabel = run1result.value.label;
  const carriesE = firstLabel.includes("E");
  console.log(
    carriesE ? "PASS" : "FAIL",
    "first robust_endorse succeeds and stamps the E tag: label =",
    usFactoredLattice.show(firstLabel),
  );
  if (!carriesE) process.exit(1);

  // Step 2: robust_endorse the ALREADY-endorsed value again. The assert
  // guard inside robust_endorse (`assert ["U","S"] v`) requires the
  // value's label to flow to {U,S} — i.e. carry NO "E" tag. Since it
  // now does, this must throw.
  const secondEndorseProgram = appN(
    { kind: "var", name: "robust_endorse" },
    tagArray([]),
    // embed the already-endorsed value directly as a literal, labeled
    // exactly as the first call produced it
    { kind: "labelLit", label: firstLabel, expr: str("data") },
  );
  try {
    await runProgram(
      model,
      scriptedOracle([]),
      usFactoredLattice.bottom,
      emptyConversation(usFactoredLattice.bottom),
      secondEndorseProgram,
    );
    console.log("FAIL: expected the cascade to be blocked, but the second endorse succeeded");
    process.exit(1);
  } catch (e) {
    if (e instanceof SecurityError) {
      console.log("PASS: cascade correctly blocked:");
      console.log("  ->", e.message);
    } else {
      throw e;
    }
  }
}

main();
