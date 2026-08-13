/**
 * Copyright (c) Andreas Schlapbach <schlpbch@asc.engineering>
 */
/**
 * Prelude definitions — §C.5 (fix), §5.1 (quarantine), §E.2
 * (robust_endorse), §E.3 (bounded_endorse).
 *
 * Why these are LLMbda closures and not plain TypeScript functions:
 * `quarantine`/`robust_endorse`/`bounded_endorse` are meant to be
 * callable from *agent-generated* code — an LLM response that gets
 * parsed and evaluated (§3.3's ⇓-Recv) can only call things that exist
 * as named bindings in the object language's environment. A host-side
 * TS helper function is invisible to generated code; a prelude entry in
 * `Model.preludeSource` is not — it's merged into scope for every recv
 * (see `getPreludeEnv`/`mergeEnv` in evaluator.ts) and available to the
 * top-level program too via `runProgram`.
 *
 * Each export below is a *builder* — a function returning an Expr —
 * rather than a bare Expr, because `bounded_endorse` needs its trust
 * domain baked in at construction time (§E.3 requires the domain be a
 * fixed, static list, or the log₂n leakage bound it's justified by
 * doesn't hold), and a single universal prelude entry can't do that.
 */
import {
  app,
  appN,
  array,
  binop,
  bool,
  endorse,
  fix as fixApplied,
  fork,
  ifThenElse,
  index,
  labelAssert,
  labelLit as labelLitExpr,
  lam,
  letIn,
  num,
  prompt,
  str,
  v,
  clear as clearExpr,
  type Expr,
} from "./ast.js";
import type { UsLabel } from "./lattice.js";

/**
 * `fix` — the call-by-value Y-combinator (§C.5), bound as a real closure
 * so generated code can write `fix (\self. ...)` the way the paper's
 * own examples do, rather than only being usable as the host-side
 * `fix()` AST builder in ast.ts (which stays useful for TS-authored
 * programs — the two are complementary, not redundant: the builder
 * inlines `fix f` at construction time; this binds `fix` as a callable
 * name for code the interpreter receives at runtime).
 */
export const fixDef: Expr = lam(
  "f",
  app(
    lam("x", app(v("f"), lam("v_", app(app(v("x"), v("x")), v("v_"))))),
    lam("x", app(v("f"), lam("v_", app(app(v("x"), v("x")), v("v_"))))),
  ),
);

/**
 * `quarantine` — §5.1:
 *   let quarantine = \prompt.
 *     let pair = fork( let _ = clear in @ prompt ) in
 *     pair.[1]
 *
 * Prompts the LLM in an isolated, cleared sub-conversation, and returns
 * the parsed result — the actual isolation mechanism `fork`+`clear`
 * provide, wrapped up as a one-argument function.
 */
export const quarantineDef: Expr = lam(
  "prompt_",
  letIn(
    "pair",
    fork(letIn("_c", clearExpr, prompt(v("prompt_")))),
    index(v("pair"), num(1)),
  ),
);

/**
 * A label-literal Expr for a set of {U,S,E}-powerset tags, used to build
 * the literal label arguments `robust_endorse`/`bounded_endorse` pass to
 * `assert`/`endorse` (matching how `usFactoredLattice.toLabel` expects
 * to decode an array of tag-name strings — see examples/endorse.ts).
 */
export const tagArray = (tags: ReadonlyArray<"U" | "S" | "E">): Expr =>
  array(tags.map((t) => str(t)));

/**
 * `robust_endorse` — §E.2:
 *   let robust_endorse = \tgt. \v.
 *     let _ = assert ["U","S"] v in   -- stuck if v already carries E
 *     endorse (tgt + ["E"]) v         -- wash to tgt, stamping the endorsed bit
 *
 * Blocks endorsement *cascades*: if `v` has already been endorsed once
 * (carries the "E" tag), the assert fails and evaluation gets stuck —
 * exactly the guard that closes the one gap the plain pc-bound argument
 * (§E.1) leaves open. `tgt` is expected to be a label-literal Expr value
 * (an array of tag strings) at call time, e.g. `tagArray([])`.
 */
export const robustEndorseDef: Expr = lam(
  "tgt",
  lam(
    "val",
    letIn(
      "_a",
      labelAssert(tagArray(["U", "S"]), v("val")),
      endorse(binop("+", v("tgt"), tagArray(["E"])), v("val")),
    ),
  ),
);

/**
 * `bounded_endorse` — §E.3, parameterised by a fixed, static trust
 * domain (a JS-level array, baked into the generated Expr as a chain of
 * equality checks — no generic `any`/fold combinator needed). In-domain
 * values are washed to bottom-integrity trusted; out-of-domain values
 * pass through unchanged (still whatever they were before, typically
 * untrusted) rather than aborting — this is the non-blocking behaviour
 * §E.3 specifically calls out as the point of this variant versus
 * `robust_endorse`'s blocking one.
 *
 * §7.3's case study explicitly cites *booleans* alongside category
 * labels as the intended small-domain values ("the agent endorses
 * booleans and category labels"). Building every domain entry as a
 * `str(...)` literal — as this used to do unconditionally — silently
 * makes booleans (and numbers) impossible to ever recognise as
 * in-domain: comparing a genuine `bool` value against a `{kind:
 * "string", value: true}` scalar always fails on the kind mismatch
 * (`scalarEq`, model.ts), so every boolean value falls through to the
 * out-of-domain, still-untrusted branch regardless of its actual value —
 * fail-closed, not a security bug, but a real gap against the paper's
 * own stated use case for this construct. Fixed by building each
 * domain entry with the scalar constructor matching its actual JS type.
 *
 * IMPORTANT (§E.3): domain must be fixed at construction time. A domain
 * built from anything computed at runtime forfeits the log₂n leakage
 * bound this construct is meant to provide — don't parameterise this by
 * an Expr, only by a plain JS array baked in here.
 */
export function boundedEndorseDef(domain: ReadonlyArray<string | number | boolean>): Expr {
  const washed = endorse(tagArray([]), v("val"));
  // if w == dom[0] then w else if w == dom[1] then w else ... else v
  let chain: Expr = v("val"); // fallthrough: out-of-domain, pass through unchanged
  for (let i = domain.length - 1; i >= 0; i--) {
    chain = ifThenElse(binop("==", v("w"), domainScalarLit(domain[i]!)), v("w"), chain);
  }
  return lam("val", letIn("w", washed, chain));
}

function domainScalarLit(value: string | number | boolean): Expr {
  if (typeof value === "boolean") return bool(value);
  if (typeof value === "number") return num(value);
  return str(value);
}

/**
 * `clean` — the bottom (fully trusted, fully public) label, matching
 * Appendix C.5/D.5's convention of a named reference for `endorse`
 * targets: `endorse clean my_val` rather than a bare literal at each
 * call site.
 */
export const cleanDef: Expr = tagArray([]);

/**
 * Convenience: build a `Model.preludeSource` map with the standard set
 * of definitions. `boundedEndorseName`/`boundedEndorseDomain` let a
 * caller register one or more domain-specific bounded_endorse variants
 * under whatever names make sense for their agent (e.g.
 * "bounded_endorse_category" for an email-classification domain).
 */
export function buildPrelude(
  boundedEndorseVariants: ReadonlyArray<{ name: string; domain: ReadonlyArray<string> }> = [],
): ReadonlyMap<string, Expr> {
  const prelude = new Map<string, Expr>([
    ["fix", fixDef],
    ["quarantine", quarantineDef],
    ["robust_endorse", robustEndorseDef],
    ["clean", cleanDef],
  ]);
  for (const { name, domain } of boundedEndorseVariants) {
    prelude.set(name, boundedEndorseDef(domain));
  }
  return prelude;
}

void appN; // kept for symmetry with other modules that use the curried-apply helper
export type { UsLabel };
