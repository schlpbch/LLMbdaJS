/**
 * §5.1: read an untrusted email, classify it via a quarantined LLM call
 * (fork + clear, so the classification prompt never pollutes the main
 * conversation) that reads the email's content directly — so the
 * classification result genuinely inherits {U} taint via the send/recv
 * rules, not just nominally. Then endorse the category ONLY if it's one
 * of a small known set (§E.3's bounded_endorse) before letting it reach
 * a trust-asserting sink. Two runs: one where the LLM returns an
 * in-domain category (sink succeeds, because bounded_endorse washed it
 * to trusted), one where it returns something out-of-domain (sink
 * correctly refuses — bounded_endorse passes the ORIGINAL {U}-tainted
 * value through unchanged rather than blindly trusting it).
 */
import { app, binop, labelAssert, labelLit, letIn, str, v } from "../src/ast.js";
import { U, usFactoredLattice } from "../src/lattice.js";
import { emptyConversation, runProgram } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { buildPrelude, tagArray } from "../src/prelude.js";
import { scriptedOracle } from "../src/oracle.js";
import { SecurityError } from "../src/errors.js";

const preludeSource = buildPrelude([
  { name: "bounded_endorse_category", domain: ["billing", "support", "general"] },
]);

const model: Model<typeof usFactoredLattice.bottom> = {
  lattice: usFactoredLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: (val) => {
    if (val.kind === "array" && val.items.every((i) => i.value.kind === "string")) {
      return val.items.map((i) => (i.value as { kind: "string"; value: string }).value) as typeof usFactoredLattice.bottom;
    }
    return undefined;
  },
  fromLabel: (l) => ({ kind: "array", items: l.map((tag) => ({ label: usFactoredLattice.bottom, value: { kind: "string", value: tag } })) }),
  preludeSource,
};

/**
 * subject = a "send_email"-style sink (§5.1): only accepts a value whose
 * label flows to ["S"] — i.e., no "U" tag present. `category` is the
 * output of bounded_endorse_category; if in-domain it's trusted ({} —
 * flows to ["S"] trivially), if out-of-domain it's still {U} and the
 * assert correctly refuses it.
 */
function programFor(email: string): ReturnType<typeof letIn> {
  return letIn(
    "email",
    labelLit(U, str(email)),
    letIn(
      "raw_category",
      app(
        v("quarantine"),
        binop(
          "+",
          str("Classify this email as billing, support, or general. Reply with just the word.\n\nEMAIL:\n"),
          v("email"),
        ),
      ),
      letIn(
        "category",
        app(v("bounded_endorse_category"), v("raw_category")),
        letIn(
          "_gate",
          labelAssert(tagArray(["S"]), v("category")),
          str("ok: email acknowledged"),
        ),
      ),
    ),
  );
}

async function runCase(label: string, llmResponse: string) {
  const oracle = scriptedOracle([JSON.stringify(llmResponse)]);
  try {
    const result = await runProgram(
      model,
      oracle,
      usFactoredLattice.bottom,
      emptyConversation(usFactoredLattice.bottom),
      programFor("Please cancel my subscription, this is urgent!"),
    );
    console.log(`[${label}] SUCCEEDED:`, result.value.value.kind === "string" ? result.value.value.value : result.value.value);
    return true;
  } catch (e) {
    if (e instanceof SecurityError) {
      console.log(`[${label}] REFUSED (SecurityError):`, e.message);
      return false;
    }
    throw e;
  }
}

async function main() {
  const inDomainOk = await runCase("in-domain 'billing'", "billing");
  const outOfDomainBlocked = !(await runCase("out-of-domain 'sarcastic-remark'", "sarcastic-remark"));

  const ok = inDomainOk && outOfDomainBlocked;
  console.log(ok ? "\nPASS" : "\nFAIL", "- in-domain category reached the sink, out-of-domain category was refused");
  if (!ok) process.exit(1);
}

main();
