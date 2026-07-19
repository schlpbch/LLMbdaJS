# Business Analysis: The LLMbda Calculus

**Prepared as an input to business requirement gathering.**
**Source document:** Garby, Gordon & Sands, *"The LLMbda Calculus: AI Agents,
Conversations, and Information Flow"*, arXiv:2602.20064v2, July 2026 —
`specification/2602.20064v2.pdf` (this repository).
**Comparator documents reviewed:** five papers cited by the source document as
its closest prior art and benchmark standard; all five were verified against
their live arXiv listings and downloaded to `specification/related-papers/`
(see §16).
**Status:** Draft, for review. Requirements in §9 are candidates for
validation with stakeholders, not agreed scope.

---

## 1. Executive Summary

Prompt injection — untrusted data an AI agent reads being obeyed as an
instruction — is an unsolved, actively exploited weakness in every
LLM-agent product on the market. The industry's most credible response,
*provenance-based defence* (track where data came from; keep untrusted data
away from privileged actions), is real and shipping (Google's CaMeL,
Microsoft's FIDES), but every current implementation has a proven or
architecturally-implied hole: informal semantics, gaps at the tracking
boundary, or a hard-wired architecture that forces a stark choice between
security and task completion.

The source document, LLMbda, is an academic proposal — not a product — for
a small programming language in which agent conversations (`@`, `fork`,
`clear`) and information-flow labels are first-class, and in which the
resulting security guarantee (noninterference) is **machine-checked in
Lean 4** over the entire language, including code the agent itself writes
and runs. Its own benchmark (Randori, run against AgentDojo's banking suite)
is the standout finding: with enforcement *always on*, it matches the task
completion rate of an *unprotected* baseline and blocks 1294 of 1296 attack
runs (99.85%) — where the closest competitor (CaMeL) must choose between
full protection (utility collapses to 37.5%) and full utility (attacks get
through).

That result is compelling, but three things temper it for a business
reader: (1) the proof-carrying reference artifact (the Lean codebase) is
**not publicly released** — the paper states it is "available from the
authors"; (2) the guarantee has a stated escape hatch (`endorse`) that an
over-permissive agent can still misuse, with no proof preventing that; and
(3) the calculus does not yet model general external tool I/O, only
in-program functions. This repository's own TypeScript port,
`llmbda-ts`, exists precisely because of gap (1) — it re-implements the
*algorithm* for exploration and prototyping but explicitly disclaims the
formal guarantee, which lives only in the (non-public) Lean development.

**Bottom line for requirement gathering:** LLMbda is credible, differentiated
research validating a real market problem and a real gap in current
products, but it is pre-commercial. It is not yet something to build a
compliance claim on. It is a strong candidate to (a) monitor, (b)
prototype against using this repository's TypeScript port for internal
evaluation, and (c) use as a design reference — its core insight (isolation
as a policy the program expresses, not an architecture baked in) is
adoptable independent of whether the Lean artifact itself is ever used.

---

## 2. Background & Problem Statement

AI agents increasingly plan, call tools, read data from the web or a
user's inbox, and act on the results, without a human reviewing each step.
Because the model cannot reliably distinguish "data to read" from
"instructions to obey," any attacker who can place text somewhere the
agent will read it — a webpage, an email, a file — can potentially hijack
the agent's next action. This is *prompt injection*, first named in 2022
and now the subject of a dedicated evaluation benchmark (AgentDojo, 2024)
and multiple published defences from Google, Microsoft, and academia
within the last 18 months. It is a live, resourced problem area, not a
theoretical one.

Two defence strategies exist:

1. **Content inspection** (classifiers, "does this look like an attack"
   prompting) — the incumbent approach, and explicitly characterised by
   the source document as an unwinnable arms race: it "guarantees nothing"
   because it invites a fresh evasion for every detector.
2. **Provenance-based defence** — classify data by *source* (trusted vs.
   untrusted) and mechanically prevent untrusted data from influencing
   privileged actions, via (a) architectural separation of duty (the
   "dual-LLM pattern": a privileged planner that never reads untrusted
   data directly, and a quarantined model that reads it but can only
   return values) and/or (b) information-flow control (IFC): label data
   by provenance, refuse it at sensitive sinks.

Strategy 2 is where the credible, well-resourced competition sits (CaMeL,
FIDES — see §6), and it is also where the source document positions
itself, arguing that even the leading systems in this category are "hard
to fully trust" for three concrete, demonstrated reasons:

- **IFC is easy to get wrong at its boundaries.** The paper reproduces a
  classic implicit-flow bug (Fenton 1974 / Denning 1976) inside CaMeL's
  own tracker: a secret-dependent branch that updates a variable only on
  the branch it *doesn't* take leaks the secret, because a purely dynamic
  monitor cannot taint an assignment it never runs. Separately, CaMeL's
  security-check outcome (pass/fail) leaks through an *untracked* Python
  retry loop, one bit per attempt — and an adaptive attacker can iterate
  that loop to launder an entire secret.
- **Deliberate relaxations are hard to audit.** FIDES knowingly does not
  track secrets through data-dependent control flow, and has a bounded
  "small-domain values are safe" escape hatch — each choice is reasonable,
  but on a given run there is no way to tell whether an admitted value is
  a benign, intended downgrade or a genuine leak wearing the same clothes.
- **The dual-LLM pattern is hard-wired.** Both CaMeL and FIDES bake the
  privileged/quarantined split into their architecture as a fixed design
  choice, and neither has a soundness theorem covering the arbitrary,
  code-generating programs real agents are (CaMeL's own authors call
  formalisation "a crucial direction" for future work).

This is the problem LLMbda is designed to close: make provenance-based
defence *expressible and provably sound*, for arbitrary agent-generated
programs, without committing to one fixed architecture.

---

## 3. Source Material Reviewed

| # | Document | Role | Local copy |
|---|---|---|---|
| 1 | Garby, Gordon & Sands. *The LLMbda Calculus.* arXiv:2602.20064v2 (2026) | Primary source under analysis | `specification/2602.20064v2.pdf` |
| 2 | Debenedetti et al. *Defeating Prompt Injections by Design* (CaMeL). arXiv:2503.18813 (Google / Google DeepMind / ETH Zürich, 2025) | Primary named competitor & benchmark baseline | `specification/related-papers/camel-defeating-prompt-injections.pdf` |
| 3 | Costa et al. *Securing AI Agents with Information-Flow Control* (FIDES). arXiv:2505.23643 (Microsoft, 2025) | Second named competitor | `specification/related-papers/fides-securing-ai-agents-ifc.pdf` |
| 4 | Debenedetti et al. *AgentDojo.* arXiv:2406.13352 (ETH Zürich / Invariant Labs, 2024) | The shared benchmark all evaluated systems (including LLMbda's own Randori agent) are scored against | `specification/related-papers/agentdojo-benchmark.pdf` |
| 5 | Zhou, D'Antoni & Polikarpova. *Language-Based Agent Control* (LBAC / TypeGuard). arXiv:2605.12863 (UC San Diego, 2026) | Contemporaneous alternative discipline (static typing, not dynamic IFC) | `specification/related-papers/lbac-language-based-agent-control.pdf` |
| 6 | Odersky et al. *Tracking Capabilities for Safer Agents* (tacit). arXiv:2603.00991 (EPFL, 2026) | Contemporaneous alternative discipline (capability-safe Scala 3 type system) | `specification/related-papers/tacit-tracking-capabilities.pdf` |

All six were confirmed to exist and match their citation (title, authors)
before download; none were assumed from the source document's reference
list alone.

---

## 4. Technology Overview (plain-language)

LLMbda is a small, general-purpose programming language (an untyped
lambda calculus, the same theoretical family as the core of Python, Lisp,
or JavaScript's functional subset) extended with three kinds of
functionality an agent needs:

- **Conversation as a first-class value.** `@e` sends a prompt and returns
  the model's (parsed) response; `fork e` runs `e` against a temporary
  copy of the conversation that is discarded afterward; `clear` wipes the
  conversation history. Because these are ordinary language constructs
  rather than a hard-wired architecture, a program can express *whatever*
  isolation shape a task needs — the dual-LLM pattern becomes one
  achievable *policy*, not the only one available.
- **Code generation as a normal value.** A model's response can be parsed
  and executed as more LLMbda code — this is what lets an agent "write
  its own plan," the capability CaMeL also relies on for its utility.
- **Dynamic information-flow labels on every value.** Every piece of data
  carries a label (e.g. "untrusted" / "secret") drawn from a configurable
  lattice, and *every* evaluation rule in the language propagates that
  label — there is no code path a label can silently fail to reach. Two
  primitives let policy code react to labels explicitly: `assert` (refuse
  if a value's label doesn't meet a required policy) and `endorse` (an
  explicit, auditable override that can *weaken* a label along one
  chosen axis — e.g. integrity — while leaving the other, e.g.
  confidentiality, untouched).

**The central claim** is a theorem (not a test suite, not an empirical
result) called **TIPNI** (Termination-Insensitive Probabilistic
Noninterference): informally, if a result is labelled "public," it was
influenced only by inputs whose label also flows to "public" — attacker
data literally cannot reach a privileged action through *any* expressible
program, with the theorem holding across the whole language (including
programs the agent itself writes at runtime), not one fixed agent loop.
A second theorem (**Insulated TIPNI**) proves that using `endorse` only
weakens the *one dimension it targets* — endorsing away an integrity
concern cannot silently also leak confidentiality. A third theorem
(**oracular correctness**) proves the actual runnable interpreter behaves
exactly as the mathematical semantics predicts. All three are
machine-checked in Lean 4, and — the paper's key engineering claim — the
*same Lean interpreter that is the subject of the proofs* is the one that
calls the LLM and runs every example in the paper; nothing is "proved
about a model of the system and then hoped to hold for the real one."

**Reference implementation & evaluation.** The authors built an agent
("Randori") in LLMbda and ran it against AgentDojo's banking benchmark
(16 tasks × 9 attacks × 3 repetitions, 3 different LLMs). With IFC
enforcement permanently on, Randori matched an unprotected baseline's
task-completion rate and blocked all but 2 of 1296 attacked runs. The
two failures are both the same task/attack pair (a file whose *legitimate
content is itself* the malicious instruction) — a case every comparator
system in this review (CaMeL, FIDES, LBAC/TypeGuard, tacit) also fails on,
which the paper argues is evidence of a genuine semantic ceiling on what
provenance-based defence can do, not a defect specific to any one design.

---

## 5. Market Context & Problem Validation

- The problem is validated by **independent, well-resourced actors**
  publishing competing solutions within the last ~18 months: Google
  DeepMind + ETH Zürich (CaMeL), Microsoft Research (FIDES), UC San Diego
  (LBAC/TypeGuard), and EPFL (tacit, from Scala's own creator, Martin
  Odersky). This is not a niche academic concern.
- A **shared, extensible public benchmark** (AgentDojo, ETH Zürich /
  Invariant Labs) has emerged as the de facto evaluation standard —
  every system reviewed here, including LLMbda's own Randori agent,
  reports results against it. A shared benchmark lowers switching/
  evaluation costs for a buyer and is itself worth tracking as
  infrastructure this space depends on.
- The problem has a **quantified cost shape**, not just a qualitative
  one: every reviewed system that adds real enforcement pays for it in
  task-completion rate. CaMeL's utility roughly halves when its policy
  checks are turned on (66.7%→37.5% safe-task completion in this paper's
  reruns); a comparable Haskell system (TypeGuard) shows the same pattern
  on a different AgentDojo suite (15/21→8/21). This utility/security
  trade-off — not the existence of attacks — is the commercial pain point
  incumbent systems have not solved, and it is precisely the gap LLMbda's
  benchmark result claims to close.

---

## 6. Competitive & Comparative Landscape

| | **LLMbda** (this doc) | **CaMeL** | **FIDES** | **LBAC / TypeGuard** | **tacit** |
|---|---|---|---|---|---|
| Publisher | Nottingham / Edinburgh / Chalmers (academic) | Google, Google DeepMind, ETH Zürich | Microsoft Research | UC San Diego | EPFL |
| Core discipline | Dynamic IFC, first-class conversation primitives | Dual-LLM + capability-based control/data-flow extraction | Dynamic taint tracking (confidentiality + integrity) | Static typing: agent code type-checks against scaffolding | Static capability tracking via Scala 3 capture checking |
| Formal soundness proof for the *whole* composed system | **Yes** — machine-checked in Lean 4 (TIPNI, Insulated TIPNI, oracular correctness) | **No** — authors call formalisation "a crucial direction" for future work | Formal model for planner class, but confidentiality guarantee is *deliberately* incomplete (ignores data-dependent control flow) | No noninterference-style proof of the composed application | No noninterference-style proof of the composed application |
| Known/demonstrated gap | `endorse` escape hatch (no proof prevents overuse); external tool I/O not yet modelled | Untaken-branch implicit flow; untracked retry-loop bit-leak channel (both demonstrated in the source paper) | Ignores control-flow-carried secrets by design | Static typing catches pre-execution issues only; no residual dynamic-behaviour guarantee | Integrity/capability-flavoured discipline; not a confidentiality IFC guarantee |
| Utility with enforcement fully on (AgentDojo banking, comparable run) | ~63–75% (matches unprotected baseline within confidence intervals) | ~37.5% (roughly half of policy-off baseline) | Reports broad task coverage; not directly comparable numbers in this review | Comparable collapse pattern reported on Slack suite (15/21→8/21) via LIO/RIO | Not evaluated on this benchmark suite in the reviewed paper |
| Security (attacks resisted) | 1294/1296 (99.85%) attacked runs | 100% with policy on; injections succeed with policy off | Strong reported coverage; not directly comparable | Near-100% reported on its own suite | Reports prevention of unsafe behaviours; different attack model |
| Reference implementation publicly available | **No** — "available from the authors" per the paper | **Yes** — public GitHub repo | **Yes** — public GitHub repo | Not stated as released in the reviewed abstract | Not stated as released in the reviewed abstract |
| Implementation language / ecosystem | Lean 4 (proof + interpreter); this repo's TS port is a non-authoritative, unproven derivative | Python | Python (implied) | Haskell (LIO library) | Scala 3 (capture checking) |
| Architecture flexibility | Not hard-wired — isolation is a program-expressed policy | Hard-wired dual-LLM split | Hard-wired planner loop, parametric only in tools | Requires agent code to type-check against scaffolding | Requires Scala 3 capability-safe harness |

**Reading this table for a business decision:** LLMbda is the only entry
with an end-to-end machine-checked proof and the best published
utility/security trade-off, but it is also the only entry without a
public reference implementation. CaMeL and FIDES are the more
commercially mature choices *today* (public code, real-world backing from
Google and Microsoft respectively) at the cost of a materially worse
utility/security trade-off and gaps the source paper demonstrates
concretely against CaMeL. LBAC/TypeGuard and tacit represent a different
technical bet (static typing/capabilities over dynamic IFC) worth tracking
as a complementary rather than directly substitutable approach — the
source paper itself conjectures the two disciplines "are complementary:
static enforcement pre-execution, our noninterference guarantee for the
residual dynamic behaviour."

---

## 7. Stakeholder Analysis

| Stakeholder | Interest | Current position relative to LLMbda |
|---|---|---|
| Security/risk engineering (adopting org) | A defensible, auditable prompt-injection control they can point to in a review | Cannot yet audit or deploy the proof-carrying artifact (not public); can evaluate the *design* via this repo's TS port |
| Product/agent engineering (adopting org) | Ship agent features without a utility hit from security controls | LLMbda's benchmark result is the most attractive of any reviewed system on this axis, if it holds up outside the paper's own evaluation |
| Compliance / audit | Evidence a security control actually does what it claims | LLMbda's Lean proof is the strongest evidence *in principle*; today it is not independently reviewable without a released artifact |
| Paper authors (Garby, Gordon, Sands) | Establish the calculus as the reference approach; likely seeking adoption/citation and possibly eventual open release | Own the only compliant artifact; gate on their release decision |
| This repository's maintainer | Explore/prototype the calculus; provide a TypeScript reference for teams that can't consume Lean directly | Already disclaims the formal guarantee — correctly positions the port as exploratory, not compliance-bearing |
| Competing vendors (Google/CaMeL, Microsoft/FIDES) | Defend market position; both already have public, production-adjacent artifacts | Ahead on availability and real-world backing; behind on the proof and the utility/security trade-off, per this paper's own reruns |

---

## 8. Value Proposition & Business Objectives

If an organisation wanted to build on LLMbda's ideas (whether by using the
eventual official artifact, this TypeScript port, or a fresh
implementation informed by the design), the value proposition is:

1. **Remove the security/utility trade-off** that every other reviewed
   provenance-based system currently forces — the single most concrete,
   quantified business benefit in the source material (near-parity task
   completion with enforcement always on, vs. roughly half elsewhere).
2. **Architecture independence** — isolation is expressed in the program,
   not fixed by the framework, so the same guarantee applies whether an
   agent uses a dual-LLM split, a single loop, or something not yet
   invented, avoiding lock-in to one agent-framework shape.
3. **An auditable override, not a silent gap** — `endorse` gives teams a
   documented, scoped way to say "yes, let this through" instead of the
   informal, hard-to-review relaxations the paper identifies in FIDES.
4. **A stronger evidentiary basis for a security claim** than a test suite
   alone — "we ran N benchmark attacks and blocked them" is weaker
   evidence than "the enforcement mechanism is proven, for the entire
   language, to only let through what the label lattice permits."

---

## 9. Derived Business Requirements (draft, for validation)

These are candidate requirements derived from the source material for a
future build/adopt decision. Each is traced to where it comes from and
flagged with its current status against the *published* LLMbda work (not
against this repository's port, which is scoped separately in §14).

### Functional

| ID | Requirement | Source | Status |
|---|---|---|---|
| BR-1 | The system MUST prevent untrusted (attacker-reachable) data from influencing a privileged action, without relying on content classifiers. | §1 (problem statement) | Met, by proof (Theorem 1), for the calculus as specified |
| BR-2 | The guarantee MUST hold for agent-generated code the system did not author, not only for a fixed planner loop. | §1 contribution (2); §4 | Met, by proof — this is the specific gap the paper shows CaMeL/FIDES lack |
| BR-3 | Any mechanism that overrides the default security policy MUST be explicit, logged/auditable, and scoped to a single declared dimension (e.g. integrity-only). | §5, Theorem 2 | Met, by proof (Insulated TIPNI), with a stated residual risk (§11, R-1) |
| BR-4 | The system MUST support isolating an untrusted sub-task's context (fork/clear equivalent) as a general-purpose, programmable primitive rather than a fixed architectural pattern. | §2, §7.1 | Met |
| BR-5 | The reference implementation and the artifact used in production MUST be the same artifact the correctness proof is stated about (no unverified translation layer). | §1 contribution (4) | Met, per the paper's own description — cannot be independently verified without the released artifact (§11, R-2) |

### Non-functional

| ID | Requirement | Source | Status |
|---|---|---|---|
| NFR-1 | Enforcement MUST NOT materially reduce legitimate task-completion rate versus an unprotected baseline. | §7.3 benchmark | Reported met on one benchmark (AgentDojo banking, 3 models); not yet independently reproduced |
| NFR-2 | The system MUST integrate with real external tools and data sources (files, web, APIs), not only in-program functions. | §9 (paper's own stated limitation) | **Gap** — explicitly out of scope in the current formalisation |
| NFR-3 | The system SHOULD provide error handling / retry ergonomics comparable to unprotected agent frameworks. | §7.3 (paper's own stated disadvantage) | **Gap** — flagged by the authors as a concrete weakness versus CaMeL's Python-native error handling |
| NFR-4 | The reference/compliance artifact MUST be available for independent security review before being relied on for a compliance claim. | §11 (this analysis) | **Not met** — not publicly released at time of writing |
| NFR-5 | Performance/latency overhead of enforcement MUST be measured against baseline agent latency. | Not addressed in the source paper | **Unverified / not measured** — a gap in the source material itself, not only in adoption readiness |

---

## 10. Assumptions

- A1: The organisation's threat model includes indirect prompt injection
  (untrusted data, not just untrusted user input) as an in-scope risk —
  if not, much of this analysis is lower priority.
- A2: A future evaluation would use AgentDojo or an equivalent benchmark,
  consistent with how every reviewed system (including LLMbda) is scored,
  so results remain comparable.
- A3: "Available from the authors" (§1, source paper) means the Lean
  artifact can plausibly be obtained via direct researcher contact; this
  analysis does not assume it is or will become open-source under any
  particular licence.
- A4: This repository's TypeScript port (`llmbda-ts`) is treated as a
  *separate*, non-authoritative artifact for the purposes of any
  compliance-relevant requirement (see §14) — its own documentation
  states it "carries no formal guarantee."

## 11. Constraints & Risks

| ID | Risk / Constraint | Impact | Likelihood/Notes |
|---|---|---|---|
| R-1 | `endorse` misuse: nothing in the proof stops an over-permissive agent plan from endorsing away protection it shouldn't. | High — this is exactly how both of Randori's 2 successful-attack cases occurred | Confirmed in the paper's own evaluation (§7.3); mitigations (plan-time-only endorsement, harness restriction) are design suggestions, not proven guarantees |
| R-2 | No public reference artifact. The proof is only as good, for procurement purposes, as the community's ability to inspect the exact code it is proven about. | High for any compliance claim | Current, as of the reviewed paper version |
| R-3 | External tool/data-source I/O is not yet modelled — real deployments need this. | Medium-High — blocks direct production use as specified | Explicitly acknowledged by the authors as future work |
| R-4 | Novel language for engineering teams (vs. CaMeL/FIDES's familiar Python). | Medium — adoption friction, hiring/training cost | Acknowledged by the authors as a disadvantage in their own Randori vs. CaMeL comparison |
| R-5 | Missing native error handling hurts retry-loop UX, a core agent pattern. | Medium | Acknowledged by the authors |
| R-6 | The semantic-attack ceiling (malicious content that *is* the legitimate instruction) is unresolved by IFC in general, not just by LLMbda — sets a hard upper bound on what any provenance-based purchase can promise. | Low-Medium (expectation-setting risk, not a defect) | All 4 comparator systems converge on the same residual failure class per the source paper |
| R-7 | Benchmark results are from a single paper, one benchmark suite (AgentDojo banking subset), and the authors' own reruns of the competing systems. | Medium — independent replication needed before relying on the numbers | Standard academic-benchmark caveat |

## 12. Dependencies

- Availability (or non-availability) of the authors' Lean codebase —
  gates any compliance-grade adoption path (R-2).
- Continued maintenance/relevance of AgentDojo as the shared benchmark —
  the comparability of every number in §6 depends on it.
- This repository's `llmbda-ts` TypeScript port, for any near-term
  internal prototyping that cannot wait on artifact availability (see
  §14) — itself dependent on `pnpm`/Node tooling already in place in this
  repo (see `CLAUDE.md`).

## 13. Success Criteria / KPIs (for a future evaluation phase)

- Independent reproduction of a utility/security result comparable to
  Table 1 of the source paper, on an internal or AgentDojo-derived task
  set.
- Zero undisclosed `endorse` (or equivalent override) usage in a
  representative agent trace sample — i.e., every override is visible in
  an audit log.
- Measured latency overhead of enforcement, expressed as a percentage of
  baseline agent response time (currently unmeasured in the source
  material — this is a net-new KPI this analysis recommends).
- A concrete plan for at least one real external tool/data-source
  integration exercised end-to-end (addresses NFR-2/R-3).

## 14. Recommendations & Next Steps

1. **Do not treat this as build-ready today.** The core gap is R-2
   (no public reference artifact) — nothing else in this analysis
   changes that until it is resolved one way or another.
2. **Track, don't wait.** Given the pace of this field (five credible,
   independently-funded competing approaches published within roughly
   18 months of each other), revisit this analysis on a fixed cadence
   (recommend: quarterly) rather than a one-off.
3. **Use this repository's `llmbda-ts` for internal, non-production
   prototyping only.** It faithfully ports the *algorithm* (confirmed via
   this repo's own regression examples — see `README.md`'s "bug this
   port found in itself" section, itself evidence of exactly the class of
   subtle divergence risk any unproven port carries) and is useful for
   building intuition and internal demos, but per its own documentation
   it must not be the basis of a security or compliance claim.
4. **If a compliance-grade evaluation becomes a priority, contact the
   authors directly** to establish whether/how the Lean artifact can be
   made available for review, rather than assuming a public release
   timeline.
5. **In parallel, evaluate CaMeL and/or FIDES as the pragmatic,
   available-today alternative**, with eyes open to the specific gaps
   this paper demonstrates (the untaken-branch leak and untracked
   retry-loop channel in CaMeL; FIDES's by-design control-flow blind
   spot) — these may or may not matter for a given use case, but should
   be a deliberate, documented risk acceptance rather than an
   unconsidered gap.
6. **Adopt the design principle regardless of vendor choice:** "isolation
   is a policy the program expresses, not a shape the framework imposes"
   is a reusable architectural insight independent of which system (if
   any) is ultimately adopted, and is worth reflecting in any internal
   agent-framework requirements written from here.

## 15. Glossary

- **Prompt injection** — untrusted data read by an agent being obeyed as
  an instruction rather than treated as data.
- **Provenance-based defence** — securing an agent by tracking where data
  came from (trusted/untrusted) rather than inspecting its content.
- **Dual-LLM pattern** — architecture with a privileged planner model that
  never reads untrusted data directly, and a quarantined model that reads
  untrusted data but can only return values.
- **Information-flow control (IFC)** — labelling data by sensitivity/
  provenance and enforcing rules about where labelled data may flow.
- **Noninterference** — the property that secret/untrusted inputs cannot
  influence public/privileged outputs.
- **TIPNI** — Termination-Insensitive Probabilistic Noninterference; the
  source paper's central theorem, allowing only a bounded, standard
  leakage channel (whether a program terminates) and nothing else.
- **Endorse** — an explicit, audited construct that weakens a label along
  one chosen dimension (e.g. trust/integrity) without touching the other
  (e.g. secrecy/confidentiality).
- **Lean 4** — a proof assistant / programming language used here to
  machine-check the security theorems against the actual interpreter code.
- **AgentDojo** — a public benchmark (ETH Zürich / Invariant Labs) for
  evaluating prompt-injection attacks and defences on realistic agent
  tasks; the shared evaluation standard for every system in §6.

## 16. References & Source Documents

All items below were fetched and verified (title/author match against the
citing document) before being saved into this repository.

1. Garby, Z., Gordon, A. D., & Sands, D. (2026). *The LLMbda Calculus: AI
   Agents, Conversations, and Information Flow.* arXiv:2602.20064v2.
   `specification/2602.20064v2.pdf`
2. Debenedetti, E., Shumailov, I., Fan, T., Hayes, J., Carlini, N.,
   Fabian, D., Kern, C., Shi, C., Terzis, A., & Tramèr, F. (2025).
   *Defeating Prompt Injections by Design* (CaMeL). arXiv:2503.18813.
   `specification/related-papers/camel-defeating-prompt-injections.pdf`
3. Costa, M., Köpf, B., Kolluri, A., Paverd, A., Russinovich, M., Salem,
   A., Tople, S., Wutschitz, L., & Zanella-Béguelin, S. (2025). *Securing
   AI Agents with Information-Flow Control* (FIDES). arXiv:2505.23643.
   `specification/related-papers/fides-securing-ai-agents-ifc.pdf`
4. Debenedetti, E., Zhang, J., Balunović, M., Beurer-Kellner, L.,
   Fischer, M., & Tramèr, F. (2024). *AgentDojo: A Dynamic Environment to
   Evaluate Prompt Injection Attacks and Defenses for LLM Agents.*
   arXiv:2406.13352.
   `specification/related-papers/agentdojo-benchmark.pdf`
5. Zhou, T., D'Antoni, L., & Polikarpova, N. (2026). *Language-Based
   Agent Control.* arXiv:2605.12863.
   `specification/related-papers/lbac-language-based-agent-control.pdf`
6. Odersky, M., Zhao, Y., Xu, Y., Bračevac, O., & Pham, C. N. (2026).
   *Tracking Capabilities for Safer Agents.* arXiv:2603.00991.
   `specification/related-papers/tacit-tracking-capabilities.pdf`
