# Security Model

Security in Conductor is not a feature. It is a structural property of the system. The design assumes agents are untrusted by default and enforces constraints through architecture, not through agent cooperation.

---

## Threat Model

Conductor assumes the following:

- **Agents are untrusted.** Any agent may attempt to exceed its scope, exfiltrate data, or manipulate its parent's decisions through crafted outputs.
- **Inputs may be adversarial.** Documents provided to agents may contain prompt injection, misleading instructions, or payloads designed to alter agent behavior.
- **The orchestrator is the trust boundary.** Only the orchestrator and the human operator are trusted. Everything below the orchestrator in the hierarchy is treated as potentially hostile.

### What Is NOT in Scope

- Attacks against the underlying LLM provider (model poisoning, training data extraction).
- Compromise of the host system outside the orchestrator's runtime.
- Social engineering of the human operator.

---

## Isolation Guarantees

### Execution Isolation

Each agent runs in its own isolated context. Isolation means:

- No shared memory between agents.
- No shared filesystem access beyond explicitly granted documents.
- No network access unless explicitly scoped.
- No inter-agent communication outside the parent-child hierarchy.

Isolation is enforced at the system level. It does not rely on the agent respecting boundaries.

### Scope Enforcement

At creation time, each agent receives a **scope definition** that specifies:

- Which input documents it may read.
- Which output locations it may write to.
- Which external tools or APIs it may invoke (if any).
- Time and resource limits for the execution.

Any operation outside the declared scope is denied by the runtime, not by the agent.

### Hierarchical Containment

- A child agent's scope is always a **subset** of its parent's scope.
- A parent cannot grant permissions it does not itself hold.
- Scope reduction is enforced at agent creation time and cannot be modified during execution.

---

## Data Flow Controls

### Input Sanitization

All documents provided to agents pass through the orchestrator. The orchestrator is responsible for:

- Validating document format and structure.
- Enforcing size limits.
- Tagging documents with provenance metadata.

The orchestrator does not sanitize content semantically (it cannot prevent prompt injection within valid text), but it ensures that documents conform to declared schemas.

### Output Validation

Agent outputs are treated as untrusted data. Before an output is passed to a parent or stored in the audit trail:

- It is validated against the expected output schema.
- It is tagged with the producing agent's identity and scope.
- Outputs that exceed declared size or format constraints are rejected.

### No Ambient Authority

Agents do not inherit capabilities from the environment. There are no implicit credentials, API keys, or access tokens available to agents. Every external resource requires an explicit grant in the scope definition.

---

## Audit and Forensics

### Immutable Audit Trail

All execution records are append-only. Once written, an audit entry cannot be modified or deleted by any agent or by the orchestrator during execution.

The audit trail includes:

- Full input documents (or references to them).
- Scope definitions.
- Complete agent outputs.
- Execution timing and resource usage.
- Any denied operations (scope violations).

### Scope Violation Logging

When an agent attempts an operation outside its scope, the attempt is:

1. Denied.
2. Logged with full context (what was attempted, by which agent, at what time).
3. Reported to the parent agent as part of the execution result.

Repeated scope violations may trigger early termination of the agent, depending on operator-defined policy.

---

## Failure Modes

| Scenario | System Behavior |
|---|---|
| Agent attempts to read a document outside its scope | Operation denied. Violation logged. Execution continues. |
| Agent attempts to write to an unauthorized location | Operation denied. Violation logged. Execution continues. |
| Agent produces output that does not match expected schema | Output rejected. Parent receives failure signal. |
| Agent exceeds time or resource limits | Execution terminated. Partial results discarded. Parent receives timeout signal. |
| Agent attempts to spawn a child with broader scope than its own | Child creation denied. Violation logged. |

---

## Trust Boundaries Summary

```
Human Operator       [trusted]
  └── Orchestrator   [trusted]
        └── Agent    [untrusted]
              └── Child Agent  [untrusted, further constrained]
```

Trust decreases as depth increases. Constraints accumulate. No entity in the hierarchy can expand its own trust level.
