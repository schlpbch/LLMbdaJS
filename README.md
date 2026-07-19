# llmbda-ts

[![CI](https://github.com/schlpbch/lllmda-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/schlpbch/lllmda-ts/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/schlpbch/lllmda-ts/badges/coverage.json)](https://github.com/schlpbch/lllmda-ts/actions/workflows/ci.yml)

A TypeScript reference implementation of the **LLMbda calculus** — Garby,
Gordon & Sands, *"The LLMbda Calculus: AI Agents, Conversations, and
Information Flow"* (arXiv:2602.20064, July 2026).

## What this is

An executable interpreter for the calculus's operational semantics:
labeled lambda calculus + first-class conversation primitives (`send`,
`recv`, `fork`, `clear`) + dynamic information-flow labels (`l : e`,
`e1 ? e2`, `assert`, `endorse`). It follows the paper's §3/§5/§B big-step
rules, evaluation-rule by evaluation-rule — each rule in
`src/evaluator.ts` is commented with the paper section it implements.

## What this is **not**

**This port carries no formal guarantee.** The paper's central results —
Theorem 1 (TIPNI), Theorem 2 (Insulated TIPNI), Theorem 3 (oracular
correctness) — are machine-checked in the paper's Lean 4 development.
Porting the *algorithm* to TypeScript does not port the *proof*.

What this repo does instead: implements the same evaluation rules so the
same *inputs* produce the same *outputs* as the paper's interpreter
(spot-checked against the paper's own worked examples in `examples/`,
including its named leak example and a positive `endorse` test). If you
need the actual noninterference guarantee, it lives in the paper's Lean
development, not here.

## Structure

```
src/
  ast.ts        — Expr/Value AST + TS-native builder functions (§3.1, §3.2, §B.1)
  lattice.ts     — Lattice<L>/FactoredLattice<L,I,S> + the {U,S}-powerset and
                   CaMeL-style Sources×Readers instances (§3.2, §5.2, Appendix D.5)
  model.ts       — parse/serialise/primEval/toLabel config (§3.3, §B.1)
  oracle.ts      — the Oracle abstraction (§6) — pure evaluator, injectable nondeterminism
  evaluator.ts   — the actual big-step semantics, rule by rule
  prelude.ts     — fix/quarantine/robust_endorse/bounded_endorse (§C.5, §5.1, §E.2, §E.3)
                   as real object-language closures, not host TS functions
  errors.ts      — SecurityError vs RuntimeError

examples/   — one file per worked scenario or regression test, each run by
              `test/run.ts` as a pass/fail suite. Covers the paper's own
              examples (postcode extraction, retry loops, the Fenton/Denning
              leak, quarantine + endorse, the CaMeL-style lattice) plus a
              regression test per bug documented below.
```

## Bugs this port found in itself

Three rounds of a rule-by-rule audit against the paper's exact formal
text (not just scenario testing) found eight real divergences between
this port and the spec, all fixed, each with a regression test verified
to actually fail against the pre-fix code. The common thread: **the
paper's semantics is substitution-based** (`e[x := e′]`), not
environment-based, and most of these are a different place where that
translation dropped something the substitution reading requires —
silently, since TypeScript can't catch it.

| # | Bug | Fix | Regression test |
|---|---|---|---|
| 1 | `var`/`field` didn't rejoin the ambient `pc` on lookup, dropping Confinement (`pc ⊑ ℓ(V)`) — a second instance of the Fenton/Denning implicit-flow class the `send` rule exists to close. | Join ambient `pc`/container label on lookup, matching `⇓-ArrayIndex`. | `var-pc-confinement.ts` |
| 2 | `labelDyn`/`labelTest`/`labelAssert`/`endorse` used a value's *shallow* label where the spec's `flatten(V)=n:v` requires `deepLabel(V)` — deep taint nested inside a policy value silently escaped. Demonstrated: an `assert` the spec requires to be refused instead silently succeeded. | Use the existing `deepLabel` helper (already used correctly by `send`/`prim`) in all four. | `deep-label-confinement.ts` |
| 3 | `prim`/`binop` results skipped `wrapValues`, leaving nested fields with no valid lattice label — reading one back out crashed (`TypeError`) instead of computing a label. | Added a `wrapValues` helper in `evaluator.ts` (where the lattice is in scope) and applied it to both. | `prim-wrap-values.ts` |
| 4 | `binop` skipped `stripLabels` before calling `primEval`, unlike `prim` right next to it, despite being literally defined as sugar for it (§B.1). | Match `prim`'s handling exactly. | `binop-prim-consistency.ts` |
| 5 | `recv` evaluated a freshly-parsed (attacker-influenceable) response against the **caller's entire local environment** merged with the prelude, instead of the prelude alone (`M.parse(r)[M.preludeEnv]`) — a full label-system bypass via variable-name collision for any sufficiently expressive `Model.parse`. | Evaluate against `preludeEnv` alone. | `recv-scope-isolation.ts` |
| 6 | `camelLattice.readersFlowsTo` had its confidentiality direction inverted: a value restricted to a few readers was wrongly allowed to flow into a fully public destination (a real leak via the ordinary `send` check), and bottom failed to flow into restricted destinations (violating `∀l, ⊥ ⊑ l`). | Check the source's `unrestricted` case before the destination's. | `camel-readers-flowsto.ts` |
| 7 | `mod`/`!=` were constructible via the `BinOp` type but never wired into `binopPrimName`/`defaultPrimEval` — always threw regardless of operands. Not a security bug (fails loudly), but a real gap against the paper's `+\|−\|×\|÷\|mod\|=\|<\|>\|≤\|≥` grammar. | Wire both through end to end as ordinary primitives. | `missing-binops.ts` |
| 8 | Record literals used a plain `Map`, so a duplicate field name silently took the *last* occurrence's value — the spec's `lookup(f, f⃗)` explicitly requires "a duplicate field is shadowed by the first". Each field's expression is still evaluated in order (side effects from a shadowed field must still fire), only the stored value was wrong. | Only store a field's value the first time its name is seen. | `record-duplicate-field.ts` |

No guarantee even two audit passes were exhaustive — this is precisely
why the Lean development remains the actual source of truth for the
security theorem, not this repository.

## Design choices worth knowing about

- **`quarantine`/`robust_endorse`/`bounded_endorse` are object-language
  closures** (`prelude.ts`), not host TS functions — agent-generated code
  can only call names bound in the object language's environment.
  `bounded_endorse` is a builder rather than a bare `Expr` because its
  trust domain must be a fixed, static list baked in at construction time
  (§E.3 — a runtime-computed domain forfeits the log₂n leakage bound).
- **No `weight`/probability tracking, no "fuel" argument.** Both are
  artifacts of the paper's Lean-side proof machinery (probabilistic
  big-step semantics, termination proofs) the executable interpreter
  doesn't need.
- **Labels are homogeneous per run.** `BareValue`'s record/array fields
  store `Labeled<unknown>` rather than threading `L` through every data
  shape — sound since a single `evaluate()` call always uses one concrete
  `Model<L>`, asserted via a single `asL<L>()` cast where it matters.
- **`endorse` requires a `FactoredLattice`**, checked at evaluation time
  (`RuntimeError`, not a type error) rather than in `Model<L>`'s type.
- **Default `parse`/`serialise` is naive JSON** (`JSON.parse` with a
  try/catch) — the paper's §7.3 flags the lack of a grammar-constrained
  parser as a real utility cost; a real deployment should replace this.

## Running it

```bash
pnpm install
pnpm run build     # full strict tsc build, checks src/ only
pnpm test           # runs every examples/*.ts, reports pass/fail
pnpm run coverage    # same suite, instrumented with c8 (text + html report in coverage/)
pnpm run example:<name>   # run one example directly, e.g. example:postcode
```

See `package.json` for the full list of `example:*` scripts (one per file
in `examples/`).

## Where this could go

Roughly in order of how much they'd actually buy you:

1. **A "randori"-style agent harness** (§7.1) — practice against a mock
   world state, then regenerate and run for real — proving the port is
   usable for something, not just faithful to the semantics.
2. **Property-based testing for TIPNI-adjacent claims** (`fast-check`):
   generate `∼ₘ`-related program pairs and check their traces are
   compatible under a scripted oracle — real evidence, never a proof, but
   also a good way to hunt for further undiscovered divergences.
3. **A conformance-vector harness against the Lean `peval`** — diffing
   this interpreter's output against Lean-side `(program, oracle) →
   (conversation, value)` triples on shared test programs. Given the bugs
   already found by hand, probably the highest-value item on this list.
4. **A real `Oracle` backed by an actual LLM API** — currently only
   `scriptedOracle`/`ruleOracle` (test doubles) exist; a production
   oracle is a thin adapter.
