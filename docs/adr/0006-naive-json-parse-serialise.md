# ADR-0006: Default `parse`/`serialise` is naive JSON, not a grammar-constrained parser

## Status
Accepted

## Context
Every `send`/`recv` crosses the `Expr`↔string boundary through
`Model.parse`/`Model.serialise`. The paper's §7.3 flags that a
production deployment needs a grammar-constrained parser — one that can
only ever produce a well-formed `Expr`, closing off a class of
oracle-side attacks where a malicious or malfunctioning LLM response
parses into something unintended. Building that parser is real, nontrivial
work orthogonal to what this port exists to demonstrate (the evaluation
semantics).

## Decision
Ship `defaultParse`/`defaultSerialise` as `JSON.parse`/`JSON.stringify`
wrapped in a try/catch, and document — in `README.md`'s design-choices
list, `CLAUDE.md`, and here — that this is a known, deliberate gap
(Article 4), not a claim that this is production-ready parsing.

## Consequences
- Keeps the reference implementation's surface area focused on the
  calculus itself rather than on parser-security engineering.
- Anyone deploying this port against a real LLM oracle must replace
  `defaultParse`/`defaultSerialise` with a grammar-constrained parser per
  §7.3 before treating untrusted model output as safe to evaluate — using
  the defaults as-is in that setting would silently reopen a class of
  issue the paper explicitly calls out.
- `Model<L>`'s `parse`/`serialise` being ordinary injectable functions
  (not hardcoded) means this replacement doesn't require touching
  `evaluator.ts` — the extension point already exists; only the default
  implementation is naive.
