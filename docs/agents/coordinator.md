# Coordinator Agent

**Classification:** Policy Engine
**Trust Level:** Untrusted (orchestrator-constrained)
**Persistence:** None. Destroyed after execution cycle completes.

---

## Purpose

The Coordinator is a deterministic routing and policy enforcement runtime. It does not interpret, decide, or strategize. It receives an input, classifies it against a fixed policy table, and dispatches it to the appropriate child agent with an explicitly assembled context payload.

The Coordinator does not "think." It pattern-matches and routes.

---

## Input Contract

| Field | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | yes | Unique identifier for this execution. |
| `input` | object | yes | The raw task payload from the operator. |
| `input.type` | enum | no | Operator-provided classification hint. Values: `technical`, `product`, `ambiguous`. If absent, the Coordinator must classify. |
| `input.body` | string | yes | The task description or instruction. |
| `context_registry` | string[] | yes | List of available document references the Coordinator may select from. |
| `policy` | object | yes | The active policy definitions (routing rules, retry limits, escalation triggers). |

---

## Output Contract

| Field | Type | Description |
|---|---|---|
| `task_id` | string | Same as input. |
| `routed_to` | enum | Target agent type: `product`, `dev`. |
| `injected_context` | string[] | Exact list of document references selected and injected into the child agent's input. |
| `classification` | object | The classification result that determined routing. |
| `classification.category` | enum | `ambiguous`, `business`, `strategic`, `technical_explicit`. |
| `classification.confidence` | enum | `deterministic` (matched explicit rule) or `heuristic` (pattern-matched). |
| `classification.rule_id` | string | Identifier of the policy rule that triggered this classification. |
| `child_scope` | object | The scope definition assigned to the child agent. |
| `status` | enum | `routed`, `escalated`, `failed`. |

---

## Routing Algorithm

Classification is evaluated **in order**. First match wins. There is no fallback to a default route.

### Step 1: Explicit Classification

If `input.type` is provided by the operator:

| `input.type` | Route To | Condition |
|---|---|---|
| `technical` | Dev Agent | Direct. No further classification. |
| `product` | Product Agent | Direct. No further classification. |
| `ambiguous` | Product Agent | Forced. Ambiguity is always resolved by the Product Agent. |

### Step 2: Policy-Based Classification

If `input.type` is absent, the Coordinator applies the policy rule set against `input.body`:

| Category | Indicators | Route To |
|---|---|---|
| **Technical Explicit** | Input contains direct implementation instructions: references to specific files, functions, endpoints, refactoring targets, error messages, stack traces. | Dev Agent |
| **Business / Strategic** | Input references user needs, product behavior, feature descriptions, prioritization, trade-offs without specifying implementation. | Product Agent |
| **Ambiguous** | Input does not match technical or business patterns with sufficient structural clarity. | Product Agent |

**Critical Rule:** When classification is uncertain, the Coordinator MUST route to the Product Agent. Routing to the Dev Agent requires structural certainty that the input is an explicit technical instruction. The cost of unnecessary disambiguation (sending to Product) is low. The cost of sending an ambiguous input to Dev is high (wasted execution, wrong output, no recovery).

### Step 3: Classification Failure

If the policy rule set cannot classify the input (no rule matches, malformed input, policy definition error):

- Status: `escalated`.
- The Coordinator does NOT route. It returns the input to the orchestrator with an escalation signal for human review.

---

## Context Registry Management

The Coordinator is the **sole accessor** of the project's document registry. No child agent has direct access to the registry.

### Selection Process

1. The Coordinator receives the full `context_registry` (list of available document references).
2. Based on the classification result and the target agent type, the Coordinator selects documents according to the active policy's context injection rules.
3. The selected documents are included in the `injected_context` field of the child agent's input.
4. The child agent receives ONLY these documents. It has no knowledge of documents that were not selected.

### Selection Rules

| Target Agent | Mandatory Documents | Conditional Documents |
|---|---|---|
| Product Agent | Project principles, active ADRs relevant to the domain. | Prior Intent Specs if the task references an existing feature. |
| Dev Agent | The Intent Spec produced by the Product Agent (if applicable), relevant ADRs, applicable technical standards. | Existing source file references if the task modifies existing components. |

### Constraints

- The Coordinator MUST NOT inject the entire registry. Context is curated, not dumped.
- The Coordinator MUST log every selection decision (which documents were included and which were excluded, with the rule that justified each).
- A child agent MUST NOT request additional documents. If its input is insufficient, it fails and the Coordinator re-evaluates.

---

## Failure Policy

### Error Classification

Errors are classified into two categories. The response is deterministic and non-negotiable.

#### Structural Errors

**Definition:** Failures in the mechanical execution of the task. The agent runtime itself malfunctioned, not the agent's logic.

| Error Type | Examples | Response |
|---|---|---|
| Malformed output | Child agent returned invalid JSON, truncated output, schema violation. | Automatic retry. |
| Timeout | Child agent exceeded time limit without producing output. | Automatic retry. |
| Runtime crash | Child agent process terminated unexpectedly. | Automatic retry. |

**Retry Policy:**

- Maximum 3 retries per child execution.
- Each retry creates a new agent instance (no state carried from the failed attempt).
- If all 3 retries fail, the Coordinator escalates to the operator.
- Retry count and failure details are recorded in the audit trail.

#### Semantic Errors

**Definition:** The agent completed execution and produced structurally valid output, but the output violates a rule, contradicts the Intent Spec, or contains logical defects detected by validation.

| Error Type | Examples | Response |
|---|---|---|
| Rule violation | Output contradicts an ADR or principle document that was in the injected context. | Immediate kill. Escalate. |
| Spec violation | Dev Agent output does not satisfy the Intent Spec constraints. | Immediate kill. Escalate. |
| Scope violation | Agent attempted operations outside its declared scope. | Immediate kill. Escalate. |

**Escalation Policy:**

- No retries. Semantic errors indicate a problem that re-execution will not solve.
- The Coordinator packages the full execution context (input, injected context, agent output, violation details) and returns it to the orchestrator with status `escalated`.
- The operator receives the package and decides the next action.

---

## Prohibitions

- The Coordinator MUST NOT modify task inputs. It routes them as received.
- The Coordinator MUST NOT generate content. It produces only structured routing decisions.
- The Coordinator MUST NOT cache results from previous executions. It is stateless.
- The Coordinator MUST NOT communicate with child agents during their execution. It dispatches and waits.
- The Coordinator MUST NOT retry semantic errors. Ever.
