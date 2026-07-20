# ADR-0005: `endorse`'s `FactoredLattice` requirement is a runtime check, not a type constraint

## Status
Accepted

## Context
`endorse` (§E.2/§E.3) needs to decompose a label into its integrity and
confidentiality components, which only a `FactoredLattice<L,I,S>`
(not every `Lattice<L>`) can do. Some `Model<L>` instances (e.g. ones
built around a lattice that never needs `endorse`) only implement the
plain `Lattice<L>` interface. The two options were: require every
`Model<L>` to supply a `FactoredLattice`, even when unused, or let
`Model<L>.lattice` be a plain `Lattice<L>` and treat the extra factoring
capability as something checked when `endorse` is actually reached.

## Decision
`Model<L>.lattice` is typed as `Lattice<L>`. `endorse` requires it to
also implement `FactoredLattice`; `evaluator.ts`'s `asFactoredLattice`
does a runtime capability check (testing for `toIntegrity`/
`toConfidentiality`/`pair`) and throws `RuntimeError` if it's missing,
rather than the type system statically forbidding `endorse` on a
non-factored model.

## Consequences
- Models that never use `endorse` don't have to implement a factoring
  they don't need — no speculative interface implementation forced on
  every lattice instance (Article 5).
- The cost is a class of error that a stricter type (e.g. requiring
  `Model<FactoredLattice<L,I,S>>` wherever `endorse` can appear) would
  catch at compile time instead: calling `endorse` against a model whose
  lattice isn't factored is only caught at evaluation time, as a thrown
  `RuntimeError`, and only if that code path is actually exercised.
- Any `Model<L>` author adding `endorse` support to an existing lattice
  must remember to implement `FactoredLattice`'s three methods — nothing
  in the type checker prompts this.
