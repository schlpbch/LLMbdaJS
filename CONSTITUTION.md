# Constitution

This document states the non-negotiable principles this project is
developed under. `CLAUDE.md` tells an agent *how* to work in this repo
(commands, architecture, conventions); this document states *why*, and
what must never be traded away to move faster. Where the two conflict,
this document wins.

## 1. The paper's formal text is the source of truth, not convenience

This repository ports the *algorithm* of Garby, Gordon & Sands' LLMbda
calculus (arXiv:2602.20064). Where the TypeScript implementation and the
paper's exact rule text disagree, **the implementation is wrong** — not
"differently reasonable," not "an acceptable simplification" — unless the
divergence is explicitly documented as a deliberate, scoped exception
(see Article 4). A change that makes the code cleaner, faster, or more
idiomatic TypeScript at the cost of silently diverging from a `⇓`-rule is
not acceptable. Every case in `src/evaluator.ts` must be traceable to a
specific paper section; when it can't be, that's a defect to fix, not a
license to improvise.

## 2. No claim of a formal guarantee this repository doesn't carry

The paper's central results (TIPNI, Insulated TIPNI, oracular
correctness) are machine-checked in Lean 4. This repository is not. No
commit message, README claim, comment, or release note may imply this
port *proves* noninterference, is *verified*, or offers a *security
guarantee* — it implements the same rules and is regression-tested
against the paper's own examples, which is evidence, not proof. Anyone
reading this repository's own claims about itself must come away with an
accurate picture of what is and isn't established, every time.

## 3. Every fix ships with a regression test proven to fail first

A bug is not considered fixed until there is a test that (a) fails
against the pre-fix code and (b) passes against the fix. "I fixed it and
it looks right now" is not sufficient — verify the test actually would
have caught the bug, not just that it currently passes. This is not
optional process overhead; it is how this project has found eight real,
previously-unknown divergences from the spec across three audit passes,
several of them genuine security-relevant confinement violations that no
amount of code review alone had caught.

## 4. Known gaps are documented, not hidden

Where this port deliberately or unavoidably diverges from the paper (no
probability/weight tracking, no fuel argument, a plain-JSON default
parser instead of a grammar-constrained one, no rational-number index
type), that gap is written down — in code comments at the point of
divergence, and in `README.md` — with the reasoning, not silently
absorbed. A reviewer or future contributor should never have to
rediscover a known limitation by tripping over it.

## 5. Minimalism: no speculative abstraction

Don't build for a future requirement that hasn't arrived. Don't add a
configuration option, an abstraction layer, or a generalization beyond
what the current, concrete need justifies. Three similar lines beat a
premature shared helper. This applies as much to `src/` as to
`examples/` — an example exists to demonstrate or regression-test one
specific thing clearly, not to be a reusable test harness.

## 6. Rigor over velocity when the two conflict

When there is a choice between shipping a plausible-looking fix quickly
and verifying it against the paper's exact text (or, for a lattice
instance, against its fundamental algebraic laws — reflexivity,
transitivity, antisymmetry, the bottom law, join being a least upper
bound), verify first. This project's own history is the argument for
this: an *ad hoc*, scenario-driven discovery process found one bug early
on; a systematic, rule-by-rule audit later found seven more. Thoroughness
found what intuition missed.

## 7. 100% statement/function/line coverage and a full typecheck, enforced

Every statement, function, and line in `src/` is exercised by
`examples/*.ts`, and `pnpm run coverage` fails the build
(`c8 --check-coverage --statements 100 --functions 100 --lines 100
--branches 99`) if that regresses — this is a CI gate, not an aspiration.
`pnpm run typecheck` (`tsconfig.examples.json`) additionally typechecks
every file `pnpm run build` doesn't — `examples/` and `test/`, which
`tsc -p tsconfig.json` never covers (`include: ["src/**/*.ts"]`). Both
gates exist because they've each already caught a real defect this way:
`typecheck` was added specifically after `pnpm run build` was found to
exit 0 with a deliberately-injected, obvious type error sitting in an
example file, and immediately found one genuine (if minor) type error
already present in a coverage-focused example. "It runs under `tsx`" is
not the same claim as "it typechecks" — `tsx` transpiles, it doesn't
verify.
Branch coverage is held to 99%, not 100%, only because a small, named set
of branches are genuinely unreachable through any well-typed program (a
`binop` case no longer constructible through the fully-typed `BinOp`
union; two dead-code paths that require `JSON.parse` to misbehave in ways
it never does) — each is identified by file and line at its own site, not
asserted in the abstract. A change that drops coverage must either add
the missing test or, if the newly-uncovered code is *also* genuinely
unreachable, extend that named, justified list — never silently loosen
the threshold to make the build pass.

## 8. Honesty about what auditing this codebase has and hasn't shown

No audit pass claims exhaustiveness it hasn't earned. "We checked X and
found no issues" is a statement about what was checked, not a guarantee
about what remains. This project's own commit history says as much
explicitly after every audit round — that framing must not erode over
time into an implied claim of completeness.
