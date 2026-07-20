# ADR-0007: `fork` snapshots the conversation instead of gating access to it

## Status
Accepted

## Context
`send`, `recv`, and `clear` all gate access to `LabeledConversation<L>`
by checking `flowsTo(pc, conv.label)` before touching it, then updating
`conv.label` to reflect the new taint. `fork` is different in kind: its
job (§5.1, backing `quarantine` in `prelude.ts`) is to run a sub-program
against a conversation the caller is walled off from, not to check a
flow condition on shared state.

## Decision
`fork` doesn't gate the conversation at all. `expr.body` evaluates
against a *copy* of `conv`; anything that body does — including its own
`send`/`recv`/`clear` calls — is invisible to the caller, who gets back
the original, pre-fork `conv` unchanged. `quarantine` is implemented
entirely as "run untrusted code inside a `fork`" — there is no separate
sandboxing mechanism.

## Consequences
- `quarantine`'s entire security argument reduces to `fork`'s snapshot
  isolation being correct — one mechanism to get right and test, rather
  than two independent ones (a generic `fork` plus a bespoke
  quarantine-specific isolation path) that could drift apart.
- Because `fork` doesn't check `flowsTo` on the way in the way
  `send`/`recv`/`clear` do, any future evaluator case that touches
  `conv` needs to be checked against whether it belongs in the
  "gate-then-update" family or the "snapshot-then-isolate" family — the
  two are deliberately not unified into one shared code path, since they
  enforce different properties.
- `RunState.callIndex` has to be threaded independently of
  `conv.history.length` specifically because a forked body can call
  `recv` against a snapshotted conversation whose length doesn't reflect
  how many oracle calls have actually happened in the run — see
  `evaluator.ts`'s `case "fork"` and `ARCHITECTURE.md`.
