# Architecture

This document describes the structural organization of Conductor. It covers components, their responsibilities, and how they interact. It does not prescribe implementation details.

---

## System Overview

Conductor is composed of four structural layers:

```
┌─────────────────────────────────┐
│         Human Operator          │
├─────────────────────────────────┤
│         Orchestrator            │
├─────────────────────────────────┤
│        Agent Runtime            │
├─────────────────────────────────┤
│        Audit Subsystem          │
└─────────────────────────────────┘
```

Each layer has a single responsibility and communicates with adjacent layers through defined interfaces.

---

## Components

### Human Operator Interface

The entry point for all execution. The human operator:

- Defines the task to be performed.
- Specifies the scope and constraints for the top-level agent.
- Reviews audit trails after execution.
- Approves or denies escalation requests.

The operator interface does not participate in agent execution. Once a task is dispatched, the operator is an observer until execution completes or an escalation occurs.

### Orchestrator

The central coordination component. Responsibilities:

- **Agent lifecycle management.** Creates agents, assigns scopes, and destroys agents upon task completion or failure.
- **Scope enforcement.** Validates that scope definitions are valid and that child scopes are subsets of parent scopes.
- **Document routing.** Receives input documents from the operator, delivers them to agents, collects outputs, and routes them to parent agents or to the audit subsystem.
- **Hierarchy management.** Maintains the parent-child tree of active agents. Enforces that communication only flows along hierarchy edges.

The orchestrator is stateless between executions. It does not retain information about previous task runs.

### Agent Runtime

The execution environment for individual agents. Each agent runtime instance provides:

- **Isolated execution context.** The agent can only access resources explicitly provided in its scope.
- **Input/output channels.** The agent reads from its input documents and writes to its output channel. There are no side channels.
- **Resource limits.** CPU time, memory, output size, and execution duration are bounded by the scope definition.
- **Tool access.** If the scope grants access to external tools, the runtime mediates all tool invocations, logging each call and its result.

The runtime enforces isolation. The agent has no mechanism to bypass runtime constraints.

### Audit Subsystem

Records all execution activity. Characteristics:

- **Append-only storage.** Records are written once and cannot be modified.
- **Comprehensive capture.** Every input, output, scope definition, tool invocation, and scope violation is recorded.
- **Execution reconstruction.** The audit trail for any execution is sufficient to reconstruct the full sequence of events without access to the agent.
- **Independent operation.** The audit subsystem operates independently from the orchestrator. Agent failure or orchestrator failure does not corrupt existing audit records.

---

## Execution Flow

A typical execution follows this sequence:

```
1. Operator defines task + scope
         │
         ▼
2. Orchestrator creates top-level agent
         │
         ▼
3. Agent receives input documents
         │
         ▼
4. Agent executes task
    ├── May produce outputs
    ├── May request child agents (orchestrator creates them)
    └── May invoke tools (if scope permits)
         │
         ▼
5. Agent returns result to orchestrator
         │
         ▼
6. Orchestrator destroys agent
         │
         ▼
7. Orchestrator returns result to operator
         │
         ▼
8. Audit trail is finalized
```

At every step, the audit subsystem records the relevant data.

### Child Agent Execution

When an agent needs to delegate work:

1. The agent sends a child creation request to the orchestrator, specifying the child's task and proposed scope.
2. The orchestrator validates that the proposed scope is a subset of the parent's scope.
3. If valid, the orchestrator creates the child agent and routes the specified documents to it.
4. The child executes independently. The parent is suspended or continues with other work, depending on the execution model.
5. The child's result is returned to the parent through the orchestrator.
6. The child is destroyed.

The parent never communicates directly with the child. All interaction passes through the orchestrator.

---

## Document Model

All data exchanged between components takes the form of **documents**. A document is:

- An immutable unit of data with a defined schema.
- Tagged with provenance metadata (who created it, when, under what scope).
- Referenced by a unique identifier.

Documents are the only mechanism for passing information between agents. There are no shared variables, message queues, or event buses between agents.

### Document Lifecycle

1. **Created** by an operator, an agent output, or an external source.
2. **Registered** in the audit subsystem with provenance metadata.
3. **Delivered** to an agent as part of its input set.
4. **Referenced** in audit records whenever accessed or produced.

Documents are never modified after creation. If an agent's output needs to amend a previous document, a new document is created with a reference to the original.

---

## Hierarchy Model

The agent hierarchy is a **tree**, not a graph.

- Each agent has exactly one parent (except the root agent, whose parent is the orchestrator).
- Each agent may have zero or more children.
- There are no lateral connections between agents at the same level.
- There are no connections between agents in different subtrees.

```
        Orchestrator
             │
        Root Agent
        ┌────┼────┐
     Agent  Agent  Agent
      │
    Agent
```

Communication is strictly vertical: parent to child (task delegation) and child to parent (result delivery). Both directions pass through the orchestrator.

---

## Failure Handling

Failures propagate upward through the hierarchy:

1. An agent fails or times out.
2. The runtime captures available context about the failure.
3. The orchestrator destroys the agent.
4. The parent receives a failure signal with the captured context.
5. The parent decides how to proceed (retry with different parameters, fail itself, or return a partial result -- depending on its own logic).

The orchestrator does not implement automatic retries. Retry logic, if any, is the parent agent's responsibility within its granted scope.

If the root agent fails, the operator receives the failure signal directly.

---

## Pipeline Model

> **Current state:** The orchestrator executes a hardcoded sequence (classify → product → dev → qa). This section describes the target architecture for configurable pipelines.

### Pipeline Template

A pipeline template defines the sequence of agent roles for a given domain. The orchestrator does not know what "software engineering" or "marketing" means — it receives a pipeline template and executes it.

```
PipelineTemplate {
  domain: string              // "engineering", "marketing", "support"
  stages: [
    {
      role: string            // "coordinator", "dev", "copywriter", etc.
      manifestRef: string     // path to manifest file
      inputFrom: string[]     // which previous stages feed into this one
      condition?: string      // optional: only run if classification matches
    }
  ]
}
```

Example — Software Engineering:
```
stages:
  - role: coordinator    # classifies task
  - role: product        # produces spec (conditional: business/ambiguous tasks)
  - role: dev            # produces artifacts
  - role: qa             # validates artifacts against spec
```

Example — Content Marketing:
```
stages:
  - role: coordinator    # classifies task type (blog, social, email)
  - role: strategist     # defines content strategy and brief
  - role: copywriter     # produces content
  - role: editor         # reviews and validates content
```

The orchestrator iterates through stages, spawning and destroying agents in order. The pipeline template is the only thing that changes between domains — the orchestrator logic is identical.

### Conditional Stages

Some stages only execute under certain conditions. In the engineering pipeline, the Product Agent is skipped for `technical_explicit` tasks. This pattern generalizes:

```
- role: product
  condition: "classification.category in ['business', 'ambiguous']"
```

Conditions are evaluated by the orchestrator using simple predicate matching, not LLM inference.

---

## Team Domain Model

> **Current state:** There is one implicit domain (engineering) with hardcoded roles. This section describes the target architecture for multi-team deployment.

A **Team Domain** is a self-contained configuration unit that defines how a team uses Conductor.

```
TeamDomain {
  id: string                        // "engineering", "marketing"
  pipeline: PipelineTemplate        // agent sequence for this team
  manifests: Record<string, path>   // role → manifest file
  prompts: Record<string, path>     // role → system prompt file
  policies: AccessPolicy[]          // Gatekeeper policies for this team's roles
  auditNamespace: string            // isolated audit trail prefix
}
```

### Directory Structure (Target)

```
config/
├── teams/
│   ├── engineering/
│   │   ├── pipeline.yaml           # coordinator → product → dev → qa
│   │   ├── manifests/
│   │   │   ├── coordinator.yaml
│   │   │   ├── product.yaml
│   │   │   ├── dev.yaml
│   │   │   └── qa.yaml
│   │   ├── prompts/
│   │   │   ├── coordinator.md
│   │   │   ├── product.md
│   │   │   ├── dev.md
│   │   │   └── qa.md
│   │   └── policies.yaml           # Gatekeeper access rules
│   │
│   ├── marketing/
│   │   ├── pipeline.yaml           # coordinator → strategist → copywriter → editor
│   │   ├── manifests/
│   │   ├── prompts/
│   │   └── policies.yaml
│   │
│   └── support/
│       ├── pipeline.yaml
│       ├── manifests/
│       ├── prompts/
│       └── policies.yaml
```

### Isolation Between Teams

- **Credential isolation:** Each team's Gatekeeper policies are independent. Marketing agents cannot use engineering credentials.
- **Audit isolation:** Each team's audit trail is namespaced. `logs/engineering/{taskId}.jsonl` vs `logs/marketing/{taskId}.jsonl`.
- **Role isolation:** A role name is scoped to its team. `engineering:dev` and `marketing:editor` are unrelated entities.
- **Pipeline isolation:** Teams cannot invoke agents from other teams' pipelines.

### Migration Path

| Phase | Agent Roles | Pipeline | Manifests | Prompts |
|---|---|---|---|---|
| M0–M3 (current) | Union type in code | Hardcoded in orchestrator | Constants in `manifests.ts` | Files in `docs/agents/` |
| M9 (Team Domains) | String validated against registry | Loaded from `pipeline.yaml` | Loaded from `manifests/*.yaml` | Loaded from `prompts/*.md` |

The internal interfaces (`AgentManifest`, `ResolvedScope`, `SpawnedAgent`) remain the same. Only the source of configuration changes.

---

## Statelessness

Conductor maintains no state between executions. Specifically:

- The orchestrator does not remember previous tasks.
- Agent runtimes are created and destroyed per execution.
- The only persistent artifact is the audit trail.

If a subsequent task needs context from a previous execution, the operator must explicitly provide the relevant audit documents as input. The system does not automate this.
