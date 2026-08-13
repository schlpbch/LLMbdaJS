/**
 * Copyright (c) Andreas Schlapbach <schlpbch@asc.engineering>
 */
/**
 * Appendix D.5: the CaMeL-style Sources×Readers lattice (`camelLattice`,
 * lattice.ts) as a genuine second lattice instance — every other example
 * in this repo uses the paper's {U,S}-powerset running example, so this
 * one exists to prove the abstraction (`Lattice<L>`/`FactoredLattice`)
 * isn't secretly tied to that toy case.
 *
 * Scenario: an untrusted web snippet is classified by an LLM inside
 * `quarantine` (fork + clear, §5.1) — the classification prompt embeds
 * the web content directly, so the verdict genuinely inherits {sources:
 * only(web)} taint via the send/recv rules (Confinement, Lemma 1), not
 * just nominally. A sink that only accepts internal-database-sourced
 * data refuses the raw verdict outright (`sourcesFlowsTo` fails: {web}
 * is not a subset of {internal-db}). `endorse` can wash the verdict's
 * *provenance* (the integrity factor) to {internal-db} without touching
 * its confidentiality (the readers factor, left as whatever the value's
 * own label already carried) — after which the same sink accepts it.
 *
 * Mirrors examples/quarantine-classify.ts's shape (quarantine + gate +
 * reclassify), but with the CaMeL lattice end to end instead of {U,S}.
 */
import { array, endorse, labelAssert, labelLit, letIn, record, str, v, app, binop, type Expr } from "../src/ast.js";
import type { BareValue, Value } from "../src/ast.js";
import { camelLattice, type CamelLabel, type Readers, type Sources } from "../src/lattice.js";
import { emptyConversation, runProgram } from "../src/evaluator.js";
import { defaultParse, defaultPrimEval, defaultSerialise, type Model } from "../src/model.js";
import { buildPrelude } from "../src/prelude.js";
import { scriptedOracle } from "../src/oracle.js";
import { SecurityError } from "../src/errors.js";

// -------------------- CamelLabel <-> object-language encoding --------------------
// The model needs to decode/encode CamelLabel values so `endorse` and
// `labelAssert` policies can be written as ordinary record literals in
// the object language, the same way examples/quarantine-classify.ts
// encodes UsLabel as an array of tag strings.

function sourcesExpr(s: Sources): Expr {
  return s.kind === "any"
    ? record([["kind", str("any")]])
    : record([["kind", str("only")], ["list", array([...s.sources].map(str))]]);
}
function readersExpr(r: Readers): Expr {
  return r.kind === "unrestricted"
    ? record([["kind", str("unrestricted")]])
    : record([["kind", str("restricted")], ["list", array([...r.readers].map(str))]]);
}
function camelLabelExpr(l: CamelLabel): Expr {
  return record([["sources", sourcesExpr(l.sources)], ["readers", readersExpr(l.readers)]]);
}

const wrap = (bv: BareValue): Value => ({ label: camelLattice.bottom, value: bv });

function sourcesToBareValue(s: Sources): BareValue {
  return s.kind === "any"
    ? { kind: "record", fields: new Map([["kind", wrap({ kind: "string", value: "any" })]]) }
    : {
        kind: "record",
        fields: new Map([
          ["kind", wrap({ kind: "string", value: "only" })],
          ["list", wrap({ kind: "array", items: [...s.sources].map((n) => wrap({ kind: "string", value: n })) })],
        ]),
      };
}
function readersToBareValue(r: Readers): BareValue {
  return r.kind === "unrestricted"
    ? { kind: "record", fields: new Map([["kind", wrap({ kind: "string", value: "unrestricted" })]]) }
    : {
        kind: "record",
        fields: new Map([
          ["kind", wrap({ kind: "string", value: "restricted" })],
          ["list", wrap({ kind: "array", items: [...r.readers].map((n) => wrap({ kind: "string", value: n })) })],
        ]),
      };
}

function decodeSources(bv: BareValue): Sources | undefined {
  if (bv.kind !== "record") return undefined;
  const kind = bv.fields.get("kind")?.value;
  if (kind?.kind !== "string") return undefined;
  if (kind.value === "any") return { kind: "any" };
  if (kind.value !== "only") return undefined;
  const list = bv.fields.get("list")?.value;
  if (list?.kind !== "array") return undefined;
  const names = list.items.map((i) => (i.value.kind === "string" ? i.value.value : undefined));
  if (names.some((n) => n === undefined)) return undefined;
  return { kind: "only", sources: new Set(names as string[]) };
}
function decodeReaders(bv: BareValue): Readers | undefined {
  if (bv.kind !== "record") return undefined;
  const kind = bv.fields.get("kind")?.value;
  if (kind?.kind !== "string") return undefined;
  if (kind.value === "unrestricted") return { kind: "unrestricted" };
  if (kind.value !== "restricted") return undefined;
  const list = bv.fields.get("list")?.value;
  if (list?.kind !== "array") return undefined;
  const names = list.items.map((i) => (i.value.kind === "string" ? i.value.value : undefined));
  if (names.some((n) => n === undefined)) return undefined;
  return { kind: "restricted", readers: new Set(names as string[]) };
}
function decodeCamelLabel(bv: BareValue): CamelLabel | undefined {
  if (bv.kind !== "record") return undefined;
  const sourcesV = bv.fields.get("sources")?.value;
  const readersV = bv.fields.get("readers")?.value;
  if (!sourcesV || !readersV) return undefined;
  const sources = decodeSources(sourcesV);
  const readers = decodeReaders(readersV);
  if (!sources || !readers) return undefined;
  return { sources, readers };
}

// -------------------- model --------------------

const preludeSource = buildPrelude(); // only `quarantine` is needed; robust_endorse/bounded_endorse are {U,S}-specific

const model: Model<CamelLabel> = {
  lattice: camelLattice,
  parse: defaultParse,
  serialise: defaultSerialise,
  primEval: defaultPrimEval,
  toLabel: decodeCamelLabel,
  fromLabel: (l) => ({ kind: "record", fields: new Map([["sources", wrap(sourcesToBareValue(l.sources))], ["readers", wrap(readersToBareValue(l.readers))]]) }),
  preludeSource,
};

const WEB_LABEL: CamelLabel = { sources: { kind: "only", sources: new Set(["web"]) }, readers: { kind: "unrestricted" } };
const INTERNAL_DB_ONLY_POLICY: CamelLabel = { sources: { kind: "only", sources: new Set(["internal-db"]) }, readers: { kind: "unrestricted" } };
const ENDORSE_TARGET = INTERNAL_DB_ONLY_POLICY; // endorse only consumes the target's *sources* (integrity) factor

/**
 * webSnippet -> quarantine(classify prompt) -> raw_verdict, then either
 * gate raw_verdict directly (expected to fail: still {web}-sourced) or
 * endorse it to {internal-db} provenance first (expected to succeed).
 */
function programFor(endorseFirst: boolean): Expr {
  const gated = endorseFirst
    ? letIn("washed", endorse(camelLabelExpr(ENDORSE_TARGET), v("raw_verdict")), v("washed"))
    : v("raw_verdict");
  return letIn(
    "web_snippet",
    labelLit(WEB_LABEL, str("URGENT: verify your account at totally-legit-bank.example/login now!!!")),
    letIn(
      "raw_verdict",
      app(
        v("quarantine"),
        binop("+", str("Classify this message as spam or ham. Reply with just the word.\n\n"), v("web_snippet")),
      ),
      letIn("_gate", labelAssert(camelLabelExpr(INTERNAL_DB_ONLY_POLICY), gated), str("ok: verdict reached the internal-db sink")),
    ),
  );
}

async function runCase(label: string, endorseFirst: boolean) {
  const oracle = scriptedOracle([JSON.stringify("spam")]);
  try {
    const result = await runProgram(model, oracle, camelLattice.bottom, emptyConversation(camelLattice.bottom), programFor(endorseFirst));
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
  const blockedRaw = !(await runCase("raw {web}-sourced verdict", false));
  const allowedAfterEndorse = await runCase("endorsed to {internal-db}", true);

  const ok = blockedRaw && allowedAfterEndorse;
  console.log(ok ? "\nPASS" : "\nFAIL", "- raw web-sourced verdict was refused, endorsed verdict reached the sink");
  if (!ok) process.exit(1);
}

main();
