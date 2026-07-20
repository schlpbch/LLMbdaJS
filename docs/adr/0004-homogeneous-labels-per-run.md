# ADR-0004: Labels are homogeneous per run; `BareValue` stores `Labeled<unknown>`

## Status
Accepted

## Context
`evaluate` is generic over the label type `L` (`Lattice<L>`/
`Model<L>`), but composite runtime values — record fields, array
elements — need to store labeled sub-values too. Threading `L` through
`BareValue` generically (`Labeled<L>` everywhere a labeled value can
appear, recursively) would work, but it means every data-shape type in
`ast.ts` becomes generic in `L`, for a distinction that is never actually
exercised: a single `evaluate()` call always closes over exactly one
concrete `Model<L>`, so every label a given run ever produces already has
the same concrete `L`.

## Decision
`BareValue`'s record/array fields store `Labeled<unknown>` rather than
`Labeled<L>`. Soundness of treating those `unknown` labels as the run's
actual `L` comes from a single `asL<L>()` cast at the point in
`evaluator.ts` where it matters, rather than from the type system proving
it structurally throughout `ast.ts`.

## Consequences
- Keeps `ast.ts`'s value types simple and non-generic; avoids infecting
  every data shape with a type parameter for a property (run-wide label
  homogeneity) that's already guaranteed by how `evaluate` is called, not
  by the data shape itself.
- The homogeneity guarantee lives outside the type checker at that one
  cast site — a caller who somehow mixed two different `Model<L>`
  instances within a single evaluation (not something the current API
  allows, but not statically impossible to misuse either) could produce
  a runtime type mismatch the compiler wouldn't catch. This is an
  accepted, narrow trade against Article 5 (minimalism) rather than an
  oversight.
