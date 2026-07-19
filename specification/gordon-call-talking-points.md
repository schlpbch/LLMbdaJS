# Talking Points — Call with Andy Gordon
### Tuesday, 30 minutes

---

## Opening (5 min)
- Starting point: "Typing a Multi-Language Intermediate Code" (with
  Don Syme, POPL '01) — read it in 2003 and cited it in my own
  master's thesis on JPicolla. 
  
- A formal type-safety spec explicitly tied to the
  real .NET CIL, not just a model of it. LLMbda makes the same move:
  the interpreter that's proved is the interpreter that runs. Worth
  asking if he sees that as a deliberate throughline in how he
  approaches formal work.

---

## 1. Competitive/comparative landscape (~8 min)

- The paper directly demonstrates two concrete gaps in **CaMeL**: an
  untaken-branch implicit-flow leak, and an untracked retry-loop
  bit-leak channel. Ask how confident he is those hold up under
  scrutiny/pushback from the **CaMeL** authors.

- FIDES deliberately doesn't track control-flow-carried secrets.
  Ask if he sees that as a reasonable engineering trade-off or a real
  weakness.

- LBAC/TypeGuard and tacit take a static-typing/capability route
  instead of dynamic IFC. Ask whether he sees these as competitors,
  or as solving a genuinely different problem that could combine with
  LLMbda later.


## 2. `endorse` misuse (~8 min)

- Insulated TIPNI proves the override stays scoped to one axis — but
  nothing stops an agent plan from calling `endorse` when it shouldn't.

- Both of Randori's successful attacks trace back to this.

- **Ask:** Is there a design pattern (plan-time-only endorsement,
  harness-level restriction) they'd actually recommend, or is this
  still open?

---

## 3. Where the calculus goes next (~9 min)

- Tool I/O modeling is the paper's own stated gap (NFR-2) — ask what
  the plan is for extending TIPNI's guarantee to real external tools
  and data sources, not just in-program functions.

- Ask how they see LLMbda relating to the static-typing camp (LBAC/
  TypeGuard, tacit) — genuinely complementary, or is one discipline
  going to subsume the other over time?

- Ask what Randori's error-handling gap (NFR-3) looks like in practice
  — is that a near-term fix or a deeper tension with the IFC design?

---

## Close (2 min)

- Would you kindly provide me access to the LEAN test set. I just finished
  a PoC of a VM in JS/TS that tries to run the LLMBda calculus as specified
  in  the paper by Andy Gordon. I now have 100% test coverage, thus the 
  implementation in it self is sound. However I do not know whether it
  implements your test set.

- Looking for a mentor and affiliation. Lack of bo

---
