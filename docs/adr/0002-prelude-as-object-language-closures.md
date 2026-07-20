# ADR-0002: Prelude functions are object-language closures, not host TS functions

## Status
Accepted

## Context
`fix`, `quarantine`, `robust_endorse`, and `bounded_endorse` (§C.5, §5.1,
§E.2, §E.3) need to be callable from code the interpreter did not write
— strings an LLM returns via `recv`, parsed by `Model.parse` into an
`Expr`. Parsed code can only reference names bound in *that `Expr`'s
environment*; it has no way to reach an arbitrary host-language (TS)
function, no matter how it's registered.

`bounded_endorse` has an additional constraint: per §E.3, its trust
domain must be a fixed, static list baked in at construction time — a
runtime-computed domain would forfeit the paper's log₂n leakage bound.
That rules out implementing it as a single reusable `Expr` the way
`fix`/`quarantine`/`robust_endorse` are.

## Decision
Define `fix`, `quarantine`, and `robust_endorse` in `prelude.ts` as
`Expr` values built from the same AST constructors used everywhere else
(`ast.ts`), exposed as a name→`Expr` map via `Model.preludeSource`, and
merged into scope for both the top-level program and every parsed `recv`
response (mirroring §3.3's `M.preludeEnv`). Define `bounded_endorse` as a
*builder function* that takes the static trust domain at construction
time and returns an `Expr`, rather than as a single fixed prelude entry.

## Consequences
- Agent-generated code can call these exactly like any other bound name,
  with no special-casing in `evaluator.ts`.
- Prelude definitions are pure closures with no dependency on `conv`/the
  oracle, so `evaluator.ts`'s `getPreludeEnv` can evaluate each entry
  once per run and cache it on `RunState` rather than re-evaluating per
  call site.
- Writing these constructs in the object language (rather than as TS
  helpers) is more verbose and harder to read than a native
  implementation would be — this is a deliberate cost paid for
  reachability from parsed code, not an oversight.
- `bounded_endorse`'s builder shape is an intentional asymmetry with the
  other three prelude entries; a future prelude construct should default
  to the fixed-`Expr` shape unless it has the same runtime-domain
  leakage concern.
