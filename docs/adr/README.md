# Architecture Decision Records

This directory records the significant, deliberate design decisions
behind this port and the reasoning behind them. It complements the other
docs rather than duplicating them:

- `CLAUDE.md` — how to work in this repo (commands, conventions).
- `CONSTITUTION.md` — the non-negotiable principles the project is
  developed under (why those principles exist).
- `ARCHITECTURE.md` — how the pieces of `src/` fit together at runtime.
- `docs/adr/*.md` (here) — individual decisions: the alternatives that
  were considered, and why this one was chosen.

## Format

Each ADR follows a short template:

```markdown
# ADR-000N: Title

## Status
Accepted

## Context
What forces made this a decision rather than a non-issue.

## Decision
What was decided.

## Consequences
What this buys, and what it costs or forecloses.
```

## Index

| # | Title |
|---|---|
| [0001](0001-environments-not-substitution.md) | Environments implement substitution semantics, with explicit `pc` re-join on reads |
| [0002](0002-prelude-as-object-language-closures.md) | Prelude functions (`quarantine`, `robust_endorse`, `bounded_endorse`) are object-language closures, not host TS functions |
| [0003](0003-no-weight-or-fuel-tracking.md) | No `weight`/probability tracking and no "fuel" argument |
| [0004](0004-homogeneous-labels-per-run.md) | Labels are homogeneous per run; `BareValue` stores `Labeled<unknown>` |
| [0005](0005-endorse-runtime-lattice-capability-check.md) | `endorse`'s `FactoredLattice` requirement is a runtime check, not a type constraint |
| [0006](0006-naive-json-parse-serialise.md) | Default `parse`/`serialise` is naive JSON, not a grammar-constrained parser |
| [0007](0007-fork-snapshots-conversation.md) | `fork` snapshots the conversation instead of gating access to it |

## Adding a new ADR

Only decisions that were genuinely deliberated — where a real alternative
was considered and rejected — belong here (Article 5: minimalism applies
to documentation too). A straightforward port of a paper rule with no
implementation choice involved doesn't need one; the paper section
comment in `evaluator.ts`/`lattice.ts` already covers that. Number
sequentially; never renumber or delete a past ADR, mark it superseded and
add a new one instead.
