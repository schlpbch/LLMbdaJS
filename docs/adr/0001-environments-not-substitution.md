# ADR-0001: Environments implement substitution semantics, with explicit `pc` re-join on reads

## Status
Accepted

## Context
The paper's big-step semantics (§3/§5/§B) is defined over
**substitution** (`e[x := e′]`): a variable occurrence is *replaced* by
the value it's bound to, so re-encountering that value under a
subsequently-raised `pc` implicitly taints it via `⇓-Labelled`/`⇓-Lam`.
This port uses environments (name → value maps) instead, which is the
standard practical technique for implementing a substitution calculus —
substitution itself is not something you want to actually perform on
every function application.

The catch: a naive environment lookup (`var`, record `.field` access)
just returns whatever value was stored at bind time, unchanged. Under
substitution semantics, a value read out from inside a `pc`-raised
context is retroactively part of that context and picks up its taint;
under naive environment lookup, it silently doesn't. This gap was found
in `var`/`field` (`⇓-ArrayIndex` already did it correctly), fixed, and
then found again independently in further spots across three rounds of
a rule-by-rule audit — see `evaluator.ts`/`lattice.ts` git history and
`examples/var-pc-confinement.ts`.

## Decision
Keep the environment-based implementation (rewriting to a substitution
interpreter would be a much larger, higher-risk change for no semantic
benefit), but treat "does this case need to re-join the ambient `pc`
into the returned value's label" as a mandatory question for every case
that *reads* a value out of an existing structure — environment, record,
array — rather than constructing one fresh. This is now a standing check
called out in `CLAUDE.md` for anyone adding a new evaluation rule.

## Consequences
- Practical, idiomatic evaluator implementation; no performance or
  complexity cost of real substitution.
- Introduces a specific, easy-to-miss correctness obligation (re-join
  `pc`/container label on every read-from-existing-structure case) that
  doesn't exist in the substitution-based original — this is the
  single most common source of confinement bugs found in this port's
  audit history.
- Each instance found gets a targeted regression test rather than a
  general property test, since the substitution/environment gap doesn't
  have one syntactic shape — it has to be checked case by case against
  the paper's exact rule text (Article 1, Article 6).
