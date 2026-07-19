# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A TypeScript reference implementation of the **LLMbda calculus** (Garby,
Gordon & Sands, arXiv:2602.20064) — a labeled, dynamically
information-flow-tracked lambda calculus for agentic LLM programs. It
closely follows the paper's §3/§5/§B big-step operational semantics.

**This port carries no formal guarantee.** The paper's noninterference
theorems (TIPNI, Insulated TIPNI, oracular correctness) are
machine-checked only in the paper's Lean 4 development. This repo
implements the algorithm and regression-tests it against the paper's own
leak examples — it does not prove anything. Keep this distinction in mind
when describing what a passing test run means; "the interpreter rejects
the Fenton/Denning gadget" is not the same claim as "the interpreter is
noninterferent."

## Commands

```bash
pnpm install
pnpm run build               # tsc -p tsconfig.json — strict build, checks src/ only
pnpm test                    # node --import tsx test/run.ts — runs every examples/*.ts as pass/fail
pnpm run example:postcode
pnpm run example:retry
pnpm run example:leak
pnpm run example:confinement
pnpm run example:quarantine
pnpm run example:robust-endorse
```

There is no separate lint step and no per-test filtering flag — `test/run.ts`
iterates all of `examples/*.ts` and reports pass/fail per file. To exercise a
single scenario in isolation, run its `pnpm run example:*` script directly
(e.g. `pnpm run example:leak`), or `node --import tsx examples/<file>.ts`.

To add a new regression case: add an `examples/<name>.ts` file (it should
assert/throw on failure the way the existing examples do) and it is picked
up automatically by `test/run.ts` — no registration needed.

## Architecture

```
src/
  ast.ts        Expr/Value AST + TS-native builder functions (§3.1, §3.2, §B.1)
  lattice.ts    Lattice<L>/FactoredLattice<L,I,S> + the {U,S}-powerset and
                CaMeL-style Sources×Readers lattice instances (§3.2, §5.2, Appendix D.5)
  model.ts      parse/serialise/primEval/toLabel config (§3.3, §B.1)
  oracle.ts     the Oracle abstraction (§6) — pure evaluator, injectable nondeterminism
  evaluator.ts  the big-step semantics, rule by rule — each rule is commented
                with the paper section it implements, and for the two
                security-critical rules, which of the paper's three named
                leaks (§1) it closes
  prelude.ts    fix/quarantine/robust_endorse/bounded_endorse (§C.5, §5.1,
                §E.2, §E.3) as real object-language closures, not host TS
                functions — see below
  errors.ts     SecurityError vs RuntimeError

examples/       one file per worked scenario/regression test; test/run.ts
                runs all of them as the test suite (see table in README.md
                for what each one exercises)
```

### Substitution semantics, not environments — and the bug that came from conflating them

The paper's semantics is **substitution-based** (`e[x := e′]`), not
environment-based. This port uses environments (the standard practical way
to implement a substitution calculus), which means `var` lookup and record
`.field` access must **actively re-join the ambient `pc` into the returned
value's label** — under a substitution-based reading, re-encountering a
value inside a `pc`-raised context implicitly taints it via
`⇓-Labelled`/`⇓-Lam`, but a naive environment lookup just returns the
stored value unchanged and silently drops that taint.

This exact gap was found and fixed once already (`evaluator.ts`, the `var`
and `field` cases now join the ambient `pc`/container label, matching what
`⇓-ArrayIndex` already did correctly). `examples/var-pc-confinement.ts` is
the regression test. **When touching `evaluator.ts`, especially any case
that reads a value out of an environment/record/array rather than
constructing one fresh, check whether it needs the same `pc`-join** — this
is the specific bug class (implicit flow through an untaken/already-bound
path) that both this bug and the paper's own Fenton/Denning gadget belong
to.

### Design choices worth knowing about (see README.md for full rationale)

- `quarantine`/`robust_endorse`/`bounded_endorse` are built as
  object-language `Expr` closures in `prelude.ts` (registered in
  `Model.preludeSource`), not host TS functions — they must be callable
  from agent-generated code that only sees named bindings in the object
  language's environment. `bounded_endorse` is a builder rather than a
  bare `Expr` because its trust domain must be fixed at construction time
  (§E.3 — a runtime-computed domain forfeits the log₂n leakage bound).
- No `weight`/probability tracking and no "fuel" argument — both are
  artifacts of the paper's Lean-side proof machinery (probabilistic
  big-step semantics, termination proofs) that the executable
  interpreter doesn't need.
- Labels are homogeneous per run: `BareValue`'s record/array fields store
  `Labeled<unknown>` rather than threading `L` through every data shape,
  soundness coming from a single `asL<L>()` cast in `evaluator.ts` rather
  than infecting `BareValue` with a generic parameter.
- `endorse` requires `Model<L>.lattice` to implement `FactoredLattice`;
  if it only implements `Lattice<L>`, `endorse` throws `RuntimeError` at
  evaluation time (a deliberate runtime check, not a type-level one).
- Default `parse`/`serialise` is naive `JSON.parse`/`JSON.stringify` with
  a try/catch — not a grammar-constrained parser. A real deployment
  should replace `defaultParse` per §7.3/Appendix C.5.
