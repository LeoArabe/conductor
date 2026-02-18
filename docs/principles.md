# Principles

These principles are non-negotiable constraints. They are not aspirations. Any component or behavior that violates them is a bug.

---

## 1. Agents Are Disposable

An agent exists for the duration of a single task. When the task ends, the agent is destroyed. There is no mechanism for an agent to persist state across executions.

If context from a previous execution is needed, it must be explicitly provided as an input document by the orchestrator. The agent itself has no awareness that prior executions occurred.

**Implication:** There is no agent identity beyond a single execution. Two executions of the "same" agent type are completely independent.

---

## 2. Authority Is Explicit and Downward-Only

An agent's capabilities are strictly defined by its parent at creation time. An agent cannot:

- Expand its own permissions.
- Grant permissions it does not hold.
- Communicate with agents outside its direct hierarchy.
- Access resources not explicitly listed in its scope.

Authority flows from operator to orchestrator to agent. It never flows upward or laterally.

**Implication:** If an agent needs a capability it was not granted, the execution fails. It does not degrade gracefully by finding workarounds.

---

## 3. No Implicit State

All information an agent operates on must be traceable to an explicit input. There are no environment variables, shared caches, global configurations, or ambient context that agents can access outside their declared inputs.

If it is not in the input documents, it does not exist for the agent.

**Implication:** Two agents given identical inputs and identical scopes must behave identically. Any deviation is a defect.

---

## 4. Documentary Memory Only

Conductor does not implement memory. What it implements is document passing.

When an execution produces results, those results are stored as immutable documents. A subsequent execution may receive those documents as input, but it has no mechanism to distinguish them from any other input.

There is no semantic continuity between executions. "Memory" is a human interpretation of document flow, not a system feature.

**Implication:** An agent cannot "recall" anything. It can only process the documents it was given.

---

## 5. Full Auditability

Every execution produces a complete audit record containing:

- The exact inputs received.
- The scope and permissions granted.
- The outputs produced.
- The hierarchy position (parent, children, if any).
- Timestamps and execution metadata.

This record is sufficient to reconstruct the execution without access to the agent itself.

**Implication:** If an execution cannot be fully reconstructed from its audit trail, the audit system is broken.

---

## 6. Isolation Is Structural, Not Conventional

Agent isolation is enforced by the system architecture, not by prompting or behavioral guidelines. An agent cannot access another agent's data not because it was told not to, but because the system makes it structurally impossible.

**Implication:** Security does not depend on agent compliance. A misbehaving agent is contained by design.

---

## 7. Failure Is Explicit

When an agent cannot complete its task, the execution fails explicitly. There are no silent fallbacks, partial successes disguised as completions, or retry loops hidden from the parent.

The parent receives a clear failure signal with the available context about what went wrong.

**Implication:** The system prefers a visible failure over an unreliable success.
