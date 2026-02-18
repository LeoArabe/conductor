# Vision

## What Conductor Is

Conductor is an orchestrator for disposable AI agents.

It coordinates the execution of autonomous agents that perform tasks within strict boundaries: each agent is ephemeral, isolated, and operates under explicit constraints defined by a human operator or a parent agent.

The system exists to solve a specific problem: **how to delegate work to AI agents without losing control, traceability, or predictability.**

## Core Problem

AI agents are powerful but inherently unpredictable. Left unconstrained, they accumulate implicit state, escalate their own privileges, and produce results that cannot be audited after the fact.

Most orchestration approaches treat agents as persistent collaborators with memory, preferences, and evolving context. This creates:

- **Opacity** -- the agent's internal state becomes a black box over time.
- **Drift** -- accumulated context causes behavior to deviate from the original intent.
- **Unauditable execution** -- there is no reliable record of why an agent made a specific decision.

## Conductor's Approach

Conductor rejects agent persistence as a default. Instead:

- Every agent is **disposable**. It is created for a task, executes within defined boundaries, and is destroyed. There is no carryover between executions.
- Every interaction follows a **strict hierarchy**. An agent only has authority explicitly granted by its parent. Authority does not propagate implicitly.
- All context is **documentary**. Agents receive input documents and produce output documents. There is no hidden state.
- Every execution is **fully auditable**. Inputs, outputs, decisions, and boundaries are recorded as immutable artifacts.

## What Conductor Is Not

- It is not an agent framework. It does not provide tools for building agents.
- It is not a prompt library. It does not manage or optimize prompts.
- It is not a memory system. Agents do not remember. That is by design.
- It is not a conversational interface. There are no sessions, threads, or chat histories between agents and users.

## Domain Independence

Conductor is not a software engineering tool. It is a general-purpose agent orchestrator.

The initial implementation uses a software engineering pipeline (coordinator → product → dev → qa) because it is a concrete, well-understood domain with clear input/output contracts. But the architecture imposes no domain-specific constraints:

- **Agent roles are not hardcoded to engineering.** A "copywriter", "analyst", "support responder", or "compliance reviewer" is structurally identical to a "dev" — it is an agent with a system prompt, a scope, and an output contract.
- **Pipelines are not hardcoded to a single sequence.** Different domains require different agent sequences. A marketing team might use: strategist → copywriter → reviewer. A customer support team might use: classifier → responder → qa. The orchestrator executes whatever pipeline it receives.
- **Tools are not limited to development tools.** An agent's tool set is defined by its manifest. A marketing agent might have access to a CMS API, an analytics dashboard, or a social media scheduler — all mediated through the Gatekeeper with the same credential isolation as any other external service.

### Team Domains

In an institutional deployment, Conductor serves multiple teams within the same organization. Each team operates as an independent **domain** with:

- Its own agent roles and manifests.
- Its own pipeline definition (the sequence of agents for a task).
- Its own system prompts and behavioral contracts.
- Its own Gatekeeper policies (which services each role can access).
- Its own audit trail, isolated from other teams.

Teams share the same Conductor infrastructure (orchestrator, Gatekeeper, container runtime) but are isolated at the configuration and data level. A marketing team's agents cannot access engineering credentials, and vice versa.

### Examples of Non-Engineering Domains

| Domain | Possible Pipeline | Agent Roles |
|---|---|---|
| Software Engineering | coordinator → product → dev → qa | coordinator, product, dev, qa |
| Content Marketing | coordinator → strategist → copywriter → editor | coordinator, strategist, copywriter, editor |
| Customer Support | coordinator → classifier → responder → qa | coordinator, classifier, responder, qa |
| Customer Experience | coordinator → analyst → designer → reviewer | coordinator, analyst, designer, reviewer |
| Compliance | coordinator → scanner → auditor → reporter | coordinator, scanner, auditor, reporter |

The pipeline and roles are configuration, not code. Adding a new domain requires:
1. Writing system prompts for each role (markdown files).
2. Creating manifests with tools and permissions per role (YAML/JSON).
3. Defining the pipeline sequence.
4. Configuring Gatekeeper policies for external service access.

No changes to Conductor's core code are needed.

## Design Goal

A human operator should be able to read the audit trail of any conductor execution and reconstruct exactly what happened, what each agent received, what it produced, and what authority it had -- without needing to inspect the agent's internals or rely on the agent's self-report.
