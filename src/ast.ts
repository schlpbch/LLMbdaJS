/**
 * Abstract syntax for the LLMbda calculus.
 *
 * Mirrors the paper's grammar directly:
 *   §3.1  lambda + conversation primitives (var, lam, app, send, recv, fork, clear)
 *   §3.2  labels and tests (labelLit, labelDyn, labelTest, labelAssert)
 *   §5.2  endorse
 *   §B.1  JSON-style data (scalar, record, array, field, index, prim)
 *
 * We keep Expr (unevaluated syntax) and Value (evaluation results) as
 * distinct types even though their shapes overlap — conflating them is a
 * classic source of interpreter bugs, and it's where a port like this is
 * most likely to silently diverge from the paper's judgment form.
 */

export type Scalar =
  | { kind: "null" }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string };

export type Expr =
  // --- core lambda calculus (§3.1) ---
  | { kind: "var"; name: string }
  | { kind: "lam"; param: string; body: Expr }
  | { kind: "app"; fn: Expr; arg: Expr }
  // --- conversation primitives (§3.1) ---
  | { kind: "send"; prompt: Expr }
  | { kind: "recv" }
  | { kind: "fork"; body: Expr }
  | { kind: "clear" }
  // --- labels and tests (§3.2) ---
  | { kind: "labelLit"; label: LabelExpr; expr: Expr } // l : e   (static label)
  | { kind: "labelDyn"; labelExpr: Expr; expr: Expr } //  e1 : e2 (dynamic label)
  | { kind: "labelTest"; policy: Expr; expr: Expr } //   e1 ? e2
  | { kind: "labelAssert"; policy: Expr; expr: Expr } // assert e1 e2
  // --- endorsement (§5.2) ---
  | { kind: "endorse"; target: Expr; expr: Expr }
  // --- JSON-style data (§B.1) ---
  | { kind: "scalar"; value: Scalar }
  | { kind: "record"; fields: ReadonlyArray<readonly [string, Expr]> }
  | { kind: "array"; items: ReadonlyArray<Expr> }
  | { kind: "field"; obj: Expr; name: string }
  | { kind: "index"; obj: Expr; idx: Expr }
  | { kind: "prim"; name: string; arg: Expr }
  // --- derived forms kept as first-class nodes for a friendlier AST ---
  // (the paper desugars these into `prim`/core forms at parse time — see §B.1;
  //  we keep them explicit and desugar in `desugar.ts` instead, so error
  //  messages and stack traces refer to what the programmer actually wrote)
  | { kind: "let"; name: string; value: Expr; body: Expr }
  | { kind: "if"; cond: Expr; then: Expr; else: Expr }
  | { kind: "binop"; op: BinOp; left: Expr; right: Expr };

export type BinOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">=";

/**
 * A label is any value the ambient Lattice<L> instance treats as a lattice
 * element. LabelExpr carries a lattice-parametric literal — usually just a
 * `readonly string[]` for the running {U,S}-powerset example — decoded via
 * the model's `toLabel` (§3.3, PModel.toLabel).
 */
export type LabelExpr = unknown;

// -------------------- runtime values --------------------

/**
 * A labeled value — §3.2's `V ::= l : v`. Generic over the label type `L`
 * so the same evaluator works for the {U,S}-powerset lattice, the
 * Sources×Readers CaMeL-style lattice (Appendix D.5), or anything else
 * satisfying the Lattice<L> interface.
 *
 * Note: we deliberately erase L to `unknown` inside record/array fields
 * (see BareValue below) rather than threading the label type parameter
 * through BareValue itself. Labels are homogeneous within a single
 * evaluation (one Model<L> per run), so this loses no real type safety
 * in practice, and avoids infecting every data-shape type with a
 * generic parameter it doesn't otherwise need.
 */
export interface Labeled<L> {
  readonly label: L;
  readonly value: BareValue;
}

/** A labeled sub-value as stored inside records/arrays — see note above. */
export type Value = Labeled<unknown>;

/** Bare (unlabeled) runtime values — §3.2's `v` grammar. */
export type BareValue =
  | Scalar
  | { kind: "closure"; param: string; body: Expr; env: Env }
  | { kind: "record"; fields: ReadonlyMap<string, Value> }
  | { kind: "array"; items: ReadonlyArray<Value> };

export type Env = ReadonlyMap<string, Labeled<unknown>>;

// -------------------- constructor helpers --------------------
// Small builder functions so you can write ASTs in plain TypeScript
// instead of hand-rolling object literals everywhere. This is the
// "skip the custom parser" surface syntax option discussed in the plan.

export const v = (name: string): Expr => ({ kind: "var", name });
export const lam = (param: string, body: Expr): Expr => ({ kind: "lam", param, body });
export const app = (fn: Expr, arg: Expr): Expr => ({ kind: "app", fn, arg });
export const appN = (fn: Expr, ...args: Expr[]): Expr =>
  args.reduce((acc, a) => app(acc, a), fn);
export const send = (prompt: Expr): Expr => ({ kind: "send", prompt });
export const recv: Expr = { kind: "recv" };
export const fork = (body: Expr): Expr => ({ kind: "fork", body });
export const clear: Expr = { kind: "clear" };
export const prompt = (e: Expr): Expr => app(lam("_", recv), send(e)); // @e sugar, §3.1

export const labelLit = (label: LabelExpr, expr: Expr): Expr => ({
  kind: "labelLit",
  label,
  expr,
});
export const labelDyn = (labelExpr: Expr, expr: Expr): Expr => ({
  kind: "labelDyn",
  labelExpr,
  expr,
});
export const labelTest = (policy: Expr, expr: Expr): Expr => ({
  kind: "labelTest",
  policy,
  expr,
});
export const labelAssert = (policy: Expr, expr: Expr): Expr => ({
  kind: "labelAssert",
  policy,
  expr,
});
export const endorse = (target: Expr, expr: Expr): Expr => ({
  kind: "endorse",
  target,
  expr,
});

export const num = (value: number): Expr => ({ kind: "scalar", value: { kind: "number", value } });
export const str = (value: string): Expr => ({ kind: "scalar", value: { kind: "string", value } });
export const bool = (value: boolean): Expr => ({ kind: "scalar", value: { kind: "bool", value } });
export const nullLit: Expr = { kind: "scalar", value: { kind: "null" } };

export const record = (fields: ReadonlyArray<readonly [string, Expr]>): Expr => ({
  kind: "record",
  fields,
});
export const array = (items: ReadonlyArray<Expr>): Expr => ({ kind: "array", items });
export const field = (obj: Expr, name: string): Expr => ({ kind: "field", obj, name });
export const index = (obj: Expr, idx: Expr): Expr => ({ kind: "index", obj, idx });
export const prim = (name: string, arg: Expr): Expr => ({ kind: "prim", name, arg });

export const letIn = (name: string, value: Expr, body: Expr): Expr => ({
  kind: "let",
  name,
  value,
  body,
});
export const ifThenElse = (cond: Expr, then: Expr, else_: Expr): Expr => ({
  kind: "if",
  cond,
  then,
  else: else_,
});
export const binop = (op: BinOp, left: Expr, right: Expr): Expr => ({
  kind: "binop",
  op,
  left,
  right,
});

/** fix — call-by-value Y-combinator, per the paper's prelude (§C.5). */
export const fix = (f: Expr): Expr =>
  app(
    lam("x", app(f, lam("v_", app(app(v("x"), v("x")), v("v_"))))),
    lam("x", app(f, lam("v_", app(app(v("x"), v("x")), v("v_"))))),
  );
