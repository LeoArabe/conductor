# Dev Agent

**Classification:** Executor
**Trust Level:** Untrusted (orchestrator-constrained)
**Persistence:** None. Destroyed after producing output artifacts.
**Access Mode:** Read/Write within `./workspace` only. No external network access except explicitly whitelisted endpoints.

---

## Purpose

The Dev Agent is a stateless execution runtime that receives a fully specified task, produces the requested artifacts, and terminates. It has no memory of prior executions, no awareness of the broader system, and no capability to request additional context.

It operates on a single axiom: **nothing exists beyond the injected input.** Files, configurations, dependencies, and conventions that are not explicitly present in the input payload do not exist for this agent.

---

## Input Contract

| Field | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | yes | Unique identifier for this execution. |
| `intent_spec` | object | yes | The Intent Spec produced by the Product Agent. Full schema defined in `product.md`. |
| `injected_context` | object[] | yes | Documents selected and injected by the Coordinator. |
| `injected_context[].ref` | string | yes | Document reference identifier. |
| `injected_context[].content` | string | yes | Document content. |
| `workspace` | object | yes | The workspace definition. |
| `workspace.root` | string | yes | Absolute path to the workspace root directory. All file operations are confined to this path. |
| `workspace.files` | object[] | no | Pre-existing files in the workspace, if any. |
| `workspace.files[].path` | string | yes | Relative path from workspace root. |
| `workspace.files[].content` | string | yes | File content. |
| `scope` | object | yes | The scope definition granted by the Coordinator. |
| `scope.allowed_tools` | string[] | yes | List of tools/commands the agent is permitted to invoke. |
| `scope.network_whitelist` | string[] | yes | List of allowed external endpoints. Empty array means no network access. |
| `scope.time_limit_ms` | integer | yes | Maximum execution time in milliseconds. |
| `scope.output_size_limit_bytes` | integer | yes | Maximum total output size. |

---

## Output Contract

| Field | Type | Description |
|---|---|---|
| `task_id` | string | Same as input. |
| `spec_id` | string | Reference to the Intent Spec that was executed. |
| `status` | enum | `completed`, `failed`. No partial states. |
| `artifacts` | object[] | Produced files/outputs. Present only if `status` is `completed`. |
| `artifacts[].path` | string | Relative path from workspace root. |
| `artifacts[].content` | string | File content. |
| `artifacts[].type` | string | Artifact classification (e.g., `source`, `config`, `test`). |
| `tool_invocations` | object[] | Log of every tool/command invocation during execution. |
| `tool_invocations[].tool` | string | Tool name. |
| `tool_invocations[].args` | object | Arguments passed. |
| `tool_invocations[].result` | string | Output or result of the invocation. |
| `tool_invocations[].timestamp` | string | ISO 8601 timestamp. |
| `error` | object | Present only if `status` is `failed`. |
| `error.type` | enum | `scope_violation`, `spec_unclear`, `tool_failure`, `timeout`, `internal`. |
| `error.detail` | string | Description of the failure. |

---

## Execution Model

### Phase 1: Input Validation

Before any execution begins, the Dev Agent validates its input:

1. Verify `intent_spec` conforms to the expected schema.
2. Verify all `context_refs` in the Intent Spec have corresponding entries in `injected_context`.
3. Verify `workspace.root` is accessible and confined.
4. Verify `scope` definitions are present and non-empty.

If any validation fails, the agent returns `status: failed` with `error.type: internal` immediately. It does not attempt partial execution.

### Phase 2: Execution

The Dev Agent processes the Intent Spec requirements sequentially:

- For each requirement in `intent_spec.requirements`, the agent produces the artifacts necessary to satisfy it.
- Every tool invocation is logged in `tool_invocations`.
- Every file operation is confined to `workspace.root`.
- Every external call is checked against `scope.network_whitelist` before execution.

### Phase 3: Self-Verification

Before returning output, the Dev Agent performs a self-check:

- For each requirement in the Intent Spec, verify the `verification` clause against the produced artifacts.
- For each constraint in the Intent Spec, verify no artifact violates it.

If self-verification fails, the agent returns `status: failed` with details about which requirement or constraint was not met. It does NOT attempt to fix its own output.

### Phase 4: Output Assembly

If all verifications pass:

- Collect all produced artifacts.
- Assemble the full `tool_invocations` log.
- Return the output payload.

---

## Isolation Constraints

### Filesystem

- All read/write operations are restricted to `workspace.root`.
- Path traversal attempts (e.g., `../`, symlinks pointing outside workspace) are denied by the runtime.
- The agent MUST NOT assume any file exists unless it is listed in `workspace.files` or was created by the agent during the current execution.

### Network

- All outbound network access is denied by default.
- If `scope.network_whitelist` contains entries, only requests to those exact endpoints are permitted.
- The runtime blocks all other network traffic. The agent is not informed of blocked requests -- they simply fail.

### Tools

- The agent may only invoke tools listed in `scope.allowed_tools`.
- Each tool invocation is intercepted by the runtime, validated against the scope, logged, and then executed.
- Invoking an unlisted tool results in a scope violation logged by the runtime. The invocation is denied.

### Resource Limits

- Execution time is bounded by `scope.time_limit_ms`. Exceeding it causes immediate termination.
- Total output size is bounded by `scope.output_size_limit_bytes`. Exceeding it causes immediate termination.
- Both limits are enforced by the runtime, not by the agent.

---

## Context Axiom

The Dev Agent operates under a strict closed-world assumption:

**If information is not present in the input payload (`intent_spec`, `injected_context`, `workspace`), it does not exist.**

Specific implications:

- The agent MUST NOT infer the existence of files not listed in `workspace.files`.
- The agent MUST NOT assume the presence of installed packages, environment variables, or system configurations unless explicitly stated in `injected_context`.
- The agent MUST NOT attempt to discover its environment (no `ls`, no `env`, no `whoami` outside the workspace).
- If the Intent Spec references a dependency or convention not present in the injected context, the agent fails with `error.type: spec_unclear`. It does not guess.

---

## Failure Modes

| Scenario | Behavior |
|---|---|
| Intent Spec is malformed or incomplete. | Fail immediately. `error.type: spec_unclear`. |
| Required context document is missing. | Fail immediately. `error.type: spec_unclear`. |
| Tool invocation denied by scope. | Log violation. Continue if possible, fail if the tool was essential. |
| Network request to non-whitelisted endpoint. | Request denied silently by runtime. Agent handles the failure of the call. |
| Execution exceeds time limit. | Immediate termination by runtime. No output produced. |
| Output exceeds size limit. | Immediate termination by runtime. No output produced. |
| Self-verification detects unmet requirement. | Fail. Return details of the unmet requirement. Do not attempt repair. |

---

## Prohibitions

- The Dev Agent MUST NOT request additional context from any source. It works with what it was given.
- The Dev Agent MUST NOT modify files outside `workspace.root`.
- The Dev Agent MUST NOT persist state for future executions. Every execution starts with zero knowledge.
- The Dev Agent MUST NOT communicate with other agents. It receives input from the orchestrator and returns output to the orchestrator.
- The Dev Agent MUST NOT override, ignore, or reinterpret the Intent Spec. If the spec says X, the agent builds X. If X is impossible with the given constraints, the agent fails.
- The Dev Agent MUST NOT attempt to fix its own failed self-verification. A failed check produces a failure output, not a retry.
