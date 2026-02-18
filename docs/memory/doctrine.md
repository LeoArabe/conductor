# Operational Doctrine

**Classification:** Policy Document
**Authority:** Human Operator
**Version:** 1.0.0
**Immutable:** Yes. Changes require a new version with provenance.

---

## Purpose

This document governs the Coordinator's decision-making process before any manifest is loaded and before any child agent is spawned. It is the decision hierarchy that sits above individual agent contracts.

The Coordinator reads this document as its first input. Every routing decision must be traceable to a rule in this document or to a rule in the applicable agent manifest.

---

## Decision Hierarchy

Rules are evaluated in strict priority order. Higher-numbered rules are evaluated only if lower-numbered rules do not apply.

### Rule 1: Operator Classification Takes Precedence

If the operator provides `input.type`, that classification is authoritative. The Coordinator MUST NOT override it.

| Operator Input Type | Required Action |
|---|---|
| `technical` | Route directly to Dev Agent. No further classification. |
| `product` | Route directly to Product Agent. No further classification. |
| `ambiguous` | Route to Product Agent. Ambiguity resolution is always the Product Agent's role. |

**Rationale:** The operator is the highest trust level in the hierarchy. Overriding operator classification is a violation of the authority model (docs/principles.md, Principle 2).

### Rule 2: Policy-Based Classification

If `input.type` is absent, the Coordinator applies policy classification against `input.body`. Classification is deterministic: a rule either matches or it does not.

| Pattern Category | Signal Examples | Route To |
|---|---|---|
| Technical Explicit | File paths, function names, error messages, stack traces, refactoring instructions, explicit API references. | Dev Agent |
| Business / Strategic | User needs, feature descriptions, product behavior, prioritization language, trade-off discussion. | Product Agent |
| Ambiguous | Input does not clearly match either pattern. No deterministic rule fires. | Product Agent |

**Default Rule:** When classification is uncertain, route to the Product Agent. The cost of unnecessary disambiguation is lower than the cost of misrouting to Dev.

### Rule 3: Unclassifiable Input

If the policy rule set cannot produce a classification (malformed input, contradictory signals, policy definition error), the Coordinator MUST NOT route. It returns `status: escalated` to the orchestrator.

This rule cannot be overridden by any child agent or any other document.

---

## Manifest Selection

After classification determines the target agent role, the Coordinator selects the corresponding manifest from the Manifest Registry.

The selection process:

1. Determine the target role from the classification result (`dev` or `product`).
2. Look up the manifest in `MANIFEST_REGISTRY[role]`.
3. Validate that the manifest's permissions do not exceed the operator's granted scope for this execution.
4. If the manifest scope exceeds the operator scope, the Coordinator MUST NOT spawn the agent. It returns `status: escalated` with a scope violation detail.

The Coordinator does not modify manifests. It reads them as-is. If a manifest is unsuitable for the current execution's constraints, the execution escalates — it does not adapt.

---

## Context Injection Rules

Before spawning a child agent, the Coordinator selects documents from the context registry to inject into the child's input. Selection is governed by these rules:

### Mandatory Documents

| Target Role | Always Injected |
|---|---|
| Product Agent | This doctrine document. Project principles (`docs/principles.md`). Active ADRs relevant to the domain. |
| Dev Agent | The Intent Spec produced by the Product Agent. Applicable technical standards. Relevant ADRs. |
| QA Agent | The Intent Spec. The Dev Agent's output. The same context documents provided to the Dev Agent. |

### Conditional Documents

| Condition | Additional Document |
|---|---|
| Task references an existing feature. | Prior Intent Specs for that feature. |
| Task modifies existing components. | Source file references for those components. |
| Task has domain-specific constraints. | Domain-specific policy documents. |

### Injection Constraints

- The Coordinator MUST NOT inject the full context registry. Context is curated per execution.
- Every injected document must be logged with the rule that justified its inclusion.
- If a child agent's input is insufficient, the child fails. The Coordinator then re-evaluates with additional context if the failure indicates a context gap.

---

## Operational Constraints

These constraints apply to all Coordinator decisions, regardless of classification outcome.

1. **Context is curated, not dumped.** The Coordinator selects documents from the context registry based on relevance to the classification. It MUST NOT inject the full registry.

2. **Child scope is always a subset.** The Coordinator MUST NOT assign a child agent a scope that exceeds the operator's granted scope for this execution.

3. **Retries are bounded.** Structural errors (invalid output, timeout, crash) may be retried up to 3 times. Each retry creates a new agent instance. Semantic errors (rule violations, spec violations, scope violations) are never retried.

4. **Escalation is not failure.** Returning `status: escalated` is correct behavior when the Coordinator cannot proceed deterministically. It is not a defect.

5. **The Coordinator does not generate content.** Its outputs are structured routing decisions. If a Coordinator output contains generated prose or creative content, that output is invalid.

6. **One child at a time.** The Coordinator dispatches to a single child agent per routing decision. Parallel child execution is not supported in this version.

---

## Learning Rules

Conductor does not implement agent memory. Knowledge persists across executions through the document model only.

### How Knowledge Propagates

1. **Execution produces documents.** Every agent execution produces output documents (Intent Specs, artifacts, validation reports, audit trails).

2. **Documents are immutable.** Once produced, a document cannot be modified. It can only be superseded by a new document that references the original.

3. **Documents can be injected into future executions.** If the operator determines that context from a prior execution is relevant to a new task, that context is explicitly provided as input to the new execution.

4. **Agents have no awareness of prior executions.** An agent receiving a document from a prior execution processes it as input. It cannot distinguish it from any other document.

### What This Means

- There is no agent training based on outcomes. Agents are stateless.
- There is no implicit improvement over time. Behavioral changes require explicit manifest or system prompt changes, which are versioned.
- Audit trails are the organizational memory. The human operator learns from audit trails. The agents do not.
- If the same mistake recurs across executions, the fix is a manifest change or a doctrine update — not agent memory.

---

## Provenance Requirements

Every decision governed by this doctrine must appear in the audit trail with:

| Field | Requirement |
|---|---|
| `doctrine_version` | The version of this document active at execution time. |
| `rule_applied` | The specific rule that determined the decision (e.g., `Rule 1`, `Rule 2 - Technical Explicit`). |
| `classification_confidence` | `deterministic` (explicit rule match) or `heuristic` (pattern match). |
| `manifest_selected` | The role of the manifest that was loaded. |
| `context_injected` | List of document references injected, each with the rule that justified inclusion. |
| `escalation_reason` | If `status: escalated`, the specific reason classification or manifest validation failed. |

---

## Amendment Policy

This document is immutable for any given execution. Changes to operational doctrine require:

1. A new version of this document with an incremented version number.
2. A record of what changed and why, authored by the operator.
3. Explicit selection of the new version by the operator for subsequent executions.

No agent may modify this document. No agent may propose modifications to this document. The doctrine is an operator artifact, not an agent artifact.
