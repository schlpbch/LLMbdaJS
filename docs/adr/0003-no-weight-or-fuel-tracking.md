# ADR-0003: No `weight`/probability tracking and no "fuel" argument

## Status
Accepted

## Context
The paper's Lean 4 development carries a `weight`/probability parameter
through its big-step judgment (needed for its probabilistic semantics
and the machine-checked noninterference proofs) and a "fuel" argument
(a standard technique to make an otherwise-partial evaluation function
total for Lean's termination checker). Neither is part of what the
calculus *computes* — both are proof-engineering artifacts of doing the
semantics in a proof assistant.

## Decision
Omit both from this port. `evaluate` is an ordinary (possibly
non-terminating, like any interpreter) TypeScript function; it doesn't
track a weight and doesn't take or decrement a fuel parameter.

## Consequences
- Keeps `evaluate`'s signature and every rule's implementation focused on
  the actual input/output behavior being ported, not proof scaffolding
  that has no operational meaning outside Lean.
- This is a real, if narrow, divergence from the paper's exact judgment
  form (Article 1 requires this be documented rather than silently
  absorbed — recorded here and in `README.md`/`CLAUDE.md`'s design-choice
  lists).
- No probabilistic reasoning about the interpreter's behavior (e.g.
  "this trace has probability p") is possible from this port; anyone
  wanting to reconstruct that would need to reintroduce weight tracking
  deliberately, not assume it's implicit.
