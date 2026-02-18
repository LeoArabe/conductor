# ROADMAP

## How to Use This File

Each milestone contains numbered issues. Issues are completed in order.
When an issue is done, mark it `[x]` and note the date.

**Current Milestone: 1 — Real LLM Integration**

---

## Foundation Layer (M0–M3): Make it work, make it isolated

## Security Layer (M4–M5): Make it safe for real credentials and delegation

## Capability Layer (M6–M8): Make it useful in production

---

## Milestone 0 — Functional Skeleton (No AI) ✅

**Goal:** A CLI that runs the full Coordinator → Agent → Result flow using mock agents (no LLM calls). Proves the orchestration mechanics work before adding complexity.

**Done when:** `npm start "Create a hello world function"` produces a complete audit trail showing: classification → routing → agent execution → result → agent destruction.

**Post-completion:** Tag `v0.1.0-skeleton` created in git to mark this stable point.

### Issues

- [x] **M0-001: CLI entry point** _(done 2026-02-18)_
- [x] **M0-002: Audit logger** _(done 2026-02-18)_
- [x] **M0-003: Mock Coordinator (classifier only)** _(done 2026-02-18)_
- [x] **M0-004: Mock Product Agent** _(done 2026-02-18)_
- [x] **M0-005: Mock Dev Agent** _(done 2026-02-18)_
- [x] **M0-006: Mock QA Agent** _(done 2026-02-18)_
- [x] **M0-007: Orchestrator loop** _(done 2026-02-18)_
- [x] **M0-008: Wire CLI to Orchestrator** _(done 2026-02-18)_
- [x] **M0-009: End-to-end validation** _(done 2026-02-18)_

---

## Milestone 1 — Real LLM Integration

**Goal:** Replace mock agents with real LLM calls using Gemini Flash via REST API. System prompts loaded from `docs/agents/*.md`. Provider-agnostic abstraction layer for future swaps.

**Prerequisite:** Milestone 0 complete.

**Provider:** Google Gemini Flash (REST). API key in `.env` as `GEMINI_API_KEY`.

**Architecture constraint:** The LLM client is abstracted behind a provider-agnostic interface. Swapping to Anthropic, OpenAI, or a local model requires implementing a single interface — no changes to agents or orchestrator.

### Issues

- [x] **M1-001: LLM provider abstraction + Gemini client** _(done 2026-02-18)_
- [x] **M1-002: Response parser with structural fallback** _(done 2026-02-18)_

- [ ] **M1-003: System prompt assembler**
  Refactor `src/core/runtime.ts` to expose the system prompt assembly logic as a reusable module:
  - Extract `assembleSystemPrompt` and `buildPermissionsBlock` into `src/core/prompt-assembler.ts`.
  - New function: `assembleAgentPrompt(role: AgentRole, projectRoot: string): string | null`
    - Reads `docs/agents/{role}.md`.
    - Reads `docs/memory/doctrine.md` (for Coordinator only — injected as preamble context).
    - Appends the permissions block from the role's manifest.
    - Appends the enforcement notice.
  - `runtime.ts` imports from `prompt-assembler.ts` instead of doing its own assembly.
  - Each agent (coordinator, product, dev, qa) gets its system prompt from this single function.

  _Done when:_ `assembleAgentPrompt('coordinator', projectRoot)` returns the full prompt including doctrine + coordinator.md + permissions block.

  > **Future-proofing note:** The system prompt path is currently read from `docs/agents/{role}.md`. In M9 (Team Domains), this path will be read from the team's manifest config at `config/teams/{domain}/prompts/{role}.md`. The `assembleAgentPrompt` function should accept the path as a parameter (from the manifest's `systemPromptPath` field), not construct it from the role name. This ensures no code change is needed when manifests become configurable.

- [ ] **M1-004: Real Coordinator**
  Create `src/agents/coordinator.ts` (replaces `mock-coordinator.ts`):
  - Calls LLM with system prompt from `assembleAgentPrompt('coordinator', ...)`.
  - User message: the task body + available context registry.
  - Instructs the LLM to respond in JSON matching `ClassificationResult` schema.
  - Parses response with `parseJSON(raw, isClassificationResult)`.
  - On `ParseError`: treat as structural error (the LLM produced garbage, not a wrong classification).
  - Logs the full LLM response (raw + parsed) in the audit trail.

  Update `src/core/orchestrator.ts`:
  - Import from `coordinator.ts` instead of `mock-coordinator.ts`.
  - Orchestrator becomes async (`run()` returns `Promise<ExecutionResult>`).
  - Update `src/cli.ts` to `await` the orchestrator.

  Keep `mock-coordinator.ts` intact — it's useful for testing without API calls.

  _Done when:_ `npm start "Refactor auth"` calls Gemini, gets a classification, and the audit log shows the raw LLM response alongside the parsed result.

- [ ] **M1-005: Real Product Agent**
  Create `src/agents/product.ts` (replaces `mock-product.ts`):
  - Calls LLM with system prompt from `assembleAgentPrompt('product', ...)`.
  - User message: the task body + classification result + injected context documents.
  - Instructs the LLM to respond in JSON matching `IntentSpec` schema.
  - Provides the IntentSpec schema definition in the user message as a structural contract.
  - Parses response with `parseJSON(raw, isIntentSpec)`.
  - Post-parse validation:
    - Every requirement has non-empty `id`, `description`, `verification`.
    - `outOfScope` is non-empty (per `docs/agents/product.md` rules).
    - Every assumption has a `source`.
  - On `ParseError` or validation failure: return structured failure (not an Intent Spec).
  - Logs raw LLM response + parsed spec (or parse error) in audit trail.

  Keep `mock-product.ts` intact.

  _Done when:_ An ambiguous input goes through Product Agent, the LLM produces a real Intent Spec, and it passes schema validation.

- [ ] **M1-006: Real Dev Agent**
  Create `src/agents/dev.ts` (replaces `mock-dev.ts`):
  - Calls LLM with system prompt from `assembleAgentPrompt('dev', ...)`.
  - User message: the full Intent Spec (as JSON) + workspace file listing (if any).
  - Instructs the LLM to respond in JSON matching `DevOutput` schema.
  - Provides the DevOutput schema in the user message.
  - Parses response with `parseJSON(raw, isDevOutput)`.
  - Post-parse: write artifacts to `workspace/{taskId}/` on disk.
  - Validate artifact paths: reject any path containing `..` or absolute paths (path traversal).
  - Logs raw LLM response + parsed output + written file paths in audit trail.

  Keep `mock-dev.ts` intact.

  _Done when:_ A task flows through the full pipeline and the Dev Agent produces real code files written to `workspace/{taskId}/`.

- [ ] **M1-007: Real QA Agent**
  Create `src/agents/qa.ts` (replaces `mock-qa.ts`):
  - Calls LLM with system prompt from `assembleAgentPrompt('qa', ...)`.
  - User message: the Intent Spec (JSON) + Dev output artifacts (file paths + content).
  - Instructs the LLM to respond in JSON matching `ValidationReport` schema.
  - Provides the ValidationReport schema in the user message.
  - Parses response with `parseJSON(raw, isValidationReport)`.
  - Post-parse validation:
    - Every requirement from the spec has a corresponding entry in `requirementResults`.
    - Verdict is consistent with results (all pass → `pass`, any fail → `fail`).
    - If verdict is inconsistent with results, override to the stricter value and log the correction.
  - Logs raw LLM response + parsed report in audit trail.

  Keep `mock-qa.ts` intact.

  _Done when:_ A full pipeline execution produces a real QA verdict with per-requirement evidence generated by the LLM.

- [ ] **M1-008: Cost tracking + token audit**
  Update `src/core/types.ts`:
  - `TokenUsage` interface is already provider-agnostic (defined in `src/core/llm/types.ts`): `{ promptTokens, completionTokens, totalTokens }`. All providers normalize to this format — Gemini's `promptTokenCount`/`candidatesTokenCount` are mapped in the provider, not here.
  - Add optional `tokenUsage?: TokenUsage` to `AuditEvent.data`.

  Update each real agent (coordinator, product, dev, qa):
  - After each LLM call, log an `llm_call` audit event with:
    `{ model, provider, promptTokens, completionTokens, totalTokens, durationMs }`.

  Update `src/core/orchestrator.ts`:
  - At `execution_end`, aggregate total tokens across all agents.
  - Log `{ totalTokens, totalPromptTokens, totalCompletionTokens, estimatedCost }` in the `execution_end` event.
  - Cost estimation: `totalTokens * rate_per_token` (hardcoded Gemini Flash rate, configurable later).
  - Cost rate stored in a `COST_RATES` map keyed by `provider:model`, making multi-provider (M9) a config change, not a code change.

  Update CLI output to show token usage summary after the QA verdict.

  _Done when:_ `npm start "Create a function"` prints total tokens used and the audit log contains per-agent token breakdowns.

- [ ] **M1-009: Error handling + retry policy**
  Update `src/core/orchestrator.ts`:
  - Implement the retry policy from `docs/agents/coordinator.md`.
  - **Transient errors** (safe to retry): network failures, HTTP 429 (rate limit), HTTP 5xx (server error), timeout, JSON parse failure, schema mismatch.
  - **Permanent errors** (never retry, escalate immediately): HTTP 401/403 (auth — retrying won't fix a bad key), LLM returned valid JSON but content violates semantic rules (e.g. QA returns pass verdict but lists failed requirements).
  - Transient errors: retry up to 3x with exponential backoff (1s, 2s, 4s).
  - Permanent errors: immediate failure, escalate to CLI with full error context.
  - Each retry creates a new LLM call (no state from the failed attempt).
  - Log each retry attempt: `{ attempt, maxAttempts, errorKind, errorDetail, isTransient }`.
  - After 3 failed retries: return `status: escalated` to the CLI.

  Error classification matrix:

  | LLM Result | Error Kind | Classification | Action |
  |---|---|---|---|
  | HTTP 429 (rate limit) | `rate_limit` | Transient | Retry with backoff |
  | HTTP 5xx | `api_error` | Transient | Retry |
  | Timeout | `timeout` | Transient | Retry |
  | JSON parse failure | `parse_error` | Transient | Retry |
  | Schema mismatch | `schema_mismatch` | Transient | Retry |
  | HTTP 401/403 | `auth_error` | **Permanent** | Immediate escalation |
  | Valid JSON, semantic violation | semantic | **Permanent** | Immediate escalation |

  _Done when:_ Simulating a malformed LLM response triggers 3 retries with exponential backoff, then escalates. Simulating a 401 error causes immediate escalation with no retries.

- [ ] **M1-010: End-to-end validation with real LLM**
  - Run the full flow 3 times with different inputs (technical, business, ambiguous).
  - Verify audit logs contain raw LLM responses, parsed outputs, and token usage.
  - Verify retry behavior by temporarily using an invalid API key (should get `auth_error`, immediate escalation — zero retries).
  - Verify the mock agents still work when called directly (regression check).
  - Document results in `docs/validation/m1-010-e2e-report.md`.
  - Tag `v0.2.0-llm` in git.

---

## Milestone 2 — Process Isolation

**Goal:** Each agent runs in a separate Node.js process with restricted permissions. Workspace isolation enforced at OS level. This is the first real security boundary.

**Prerequisite:** Milestone 1 complete.

**Design note on network isolation:** At this stage, network restriction is "soft" — enforced by code convention, not by OS-level controls. All outbound network calls are logged and audited, but not blocked. Real network blocking comes with Docker in M3. The priority here is: log everything, trust nothing, block it later.

**Design note on pipeline:** The orchestrator in M2 still executes the hardcoded engineering pipeline (classify → product → dev → qa). Pipeline configurability is deferred to M9 (Team Domains). However, the process spawner (M2-001) should accept an agent role as a string parameter, not assume a fixed set of roles. This prepares for dynamic role loading.

### Issues

- [ ] **M2-001: Agent process spawner**
  Agents run as child processes via `child_process.fork()`. Communication via structured IPC (JSON messages). Parent process controls lifecycle. Each agent process receives only the data it needs — no access to parent's environment variables.

- [ ] **M2-002: Workspace isolation**
  Each agent execution gets its own `workspace/{agent_id}/` directory. No access outside it. Enforced by the parent process — agent cannot read/write outside its workspace. Path traversal attempts (`../`) are detected and logged as scope violations.

- [ ] **M2-003: Tool execution sandbox**
  Tool invocations are intercepted and validated before execution. Denied tools logged as scope violations. Tools are executed by the parent process on behalf of the agent, not by the agent directly. The agent sends a tool request via IPC; the parent validates against the manifest and executes (or denies).

- [ ] **M2-004: Timeout enforcement**
  Hard kill of agent process if `maxExecutionTime` exceeded. No graceful shutdown — immediate termination via `SIGKILL`. Logged as `agent_timeout` audit event with elapsed time and last known state.

- [ ] **M2-005: Network call logging**
  All outbound HTTP calls from agent processes are intercepted and logged. At this stage: log-only, not blocked. Every call records: URL, method, timestamp, agent_id, response status. This audit trail becomes the baseline for defining network policies in M3. Blocking is deferred to Docker network policies.

- [ ] **M2-006: IPC protocol definition**
  Define the structured message format between parent and child processes using JSON-RPC 2.0 format:
  - Request: `{ jsonrpc: "2.0", method: string, params: object, id: string }`
  - Response: `{ jsonrpc: "2.0", result?: object, error?: { code, message, data }, id: string }`
  - Notifications (no response expected): `{ jsonrpc: "2.0", method: string, params: object }`
  Standard format simplifies debugging, enables schema validation of messages, and avoids inventing a custom protocol. This protocol becomes the basis for container communication in M3.

- [ ] **M2-007: End-to-end validation + tag**
  - Run full pipeline with process-isolated agents.
  - Verify workspace isolation (agent cannot read files outside its workspace).
  - Verify timeout kills agent process cleanly.
  - Verify IPC messages are well-formed JSON-RPC.
  - Verify network call log captures all outbound requests.
  - Tag `v0.3.0-isolated` in git.

---

## Milestone 3 — Docker Containerization

**Goal:** Each agent runs in a disposable Docker container with minimal privileges. Full OS-level isolation. Network controlled per container. This is the hard security boundary.

**Prerequisite:** Milestone 2 complete.

### Issues

- [ ] **M3-001: Base agent Docker image**
  Multistage Dockerfile:
  - **Build stage:** `node:20-alpine` with build tools. Compiles TypeScript, installs dependencies.
  - **Runtime stage:** `node:20-alpine` minimal. Only compiled JS + production deps. Non-root user (`conductor-agent`). Read-only filesystem except `/workspace`. No shell if possible (`--no-shell` or distroless variant considered).
  This reduces attack surface — even if an agent is compromised, there are fewer tools available to an attacker.

- [ ] **M3-002: Container lifecycle management**
  Orchestrator creates and destroys containers via Docker API. Each agent execution = one container. Container is destroyed after execution completes (or times out). No container reuse between tasks. Container names include `taskId` and `agentId` for traceability.

- [ ] **M3-003: Volume mounting (workspace only)**
  - Agent code mounted as `:ro` (read-only) — agent cannot modify its own code or self-modify.
  - Workspace directory (`/workspace`) mounted as `:rw` (read-write) — the only writable path.
  - No other host paths are accessible.
  - Workspace is cleaned up after task completion (configurable: retain for debug or delete).

- [ ] **M3-004: Network policies per agent type**
  Internal Docker network: `conductor-internal`.
  - Agent containers can only reach the Gatekeeper container (M4). No direct internet access.
  - Gatekeeper container is the only container with external internet access (outbound to APIs).
  - Network policies enforced via Docker network configuration and iptables/nftables rules on the host.
  - Any attempt by an agent container to reach the internet directly is blocked and logged.

- [ ] **M3-005: Resource limits (CPU, memory)**
  Per-container resource limits derived from manifest:
  - CPU: `--cpus` flag (e.g., 0.5 CPU for QA, 1.0 for Dev).
  - Memory: `--memory` flag (e.g., 256MB for QA, 512MB for Dev).
  - OOM kills logged as `agent_oom` audit events with memory usage at time of kill.
  - No swap (`--memory-swap` equals `--memory`).

- [ ] **M3-006: Container-to-container IPC**
  Migrate the M2 JSON-RPC IPC protocol from Unix IPC to network-based communication within the Docker network. Options (decide during implementation):
  - HTTP JSON-RPC server inside each container (simplest, stateless).
  - Unix socket mounted into container via shared volume (lower latency).
  Protocol remains JSON-RPC 2.0 regardless of transport.

- [ ] **M3-007: End-to-end validation + tag**
  - Run full pipeline with Docker-containerized agents.
  - Verify agent cannot access host filesystem outside `/workspace`.
  - Verify agent cannot reach external internet (only Gatekeeper).
  - Verify `:ro` mount prevents code self-modification.
  - Verify OOM kill is logged correctly.
  - Verify container is destroyed after task completion.
  - Tag `v0.4.0-containerized` in git.

---

## Milestone 4 — Gatekeeper (Credential Proxy + Auth)

**Goal:** No agent ever sees a credential. All external service access goes through a deterministic, zero-LLM intermediary that injects credentials internally and returns only results. Agents authenticate via cryptographic Spawn Tokens.

**Prerequisite:** Milestone 3 complete (containers must exist for isolation to be real).

**Principles:** Zero LLM. Zero credential in transit. Fail-closed. Full audit. Monotonic attenuation.

### Issues

- [ ] **M4-001: Gatekeeper types**
  Define in `src/core/gatekeeper/types.ts`:
  - `GatekeeperRequest`: `{ spawnToken, serviceId, operation: { method, path, headers?, body? } }`
  - `GatekeeperResponse`: `{ requestId, status: 'success' | 'denied' | 'error', denial?, httpStatus?, responseBody?, error? }`
  - `AccessPolicy`: `{ role, serviceId, allowedOperations[], maxRequestsPerExecution }`
  - `OperationPattern`: `{ method, pathPattern }`
  - `SpawnTokenPayload`: `{ agentId, role, taskId, depth, parentAgentId, lineage[], maxDepth, allowedServices[], allowedTools[], canSpawn, canSpawnRoles[], issuedAt, expiresAt, nonce }`
  Types are contracts — no implementation code in this issue.

- [ ] **M4-002: Credential Store**
  `src/core/gatekeeper/store.ts`:
  - Loads credentials from `process.env` once at initialization. Immutable after load.
  - `has(serviceId): boolean` — public, safe to call from anywhere.
  - `_resolve(serviceId): string | null` — internal only, used exclusively by Executor.
  - Never serializes. Never logs values. Never exposes via public interface.
  - Credentials loaded: `GEMINI_API_KEY` → `gemini`, future: `ANTHROPIC_API_KEY` → `anthropic`, `GITHUB_TOKEN` → `github`.

- [ ] **M4-003: Sanitizer**
  `src/core/gatekeeper/sanitizer.ts`:
  - `sanitize(input: string): string` — replaces any known credential value with `[REDACTED:{serviceId}]`.
  - Called before every log write and every response to agents.
  - Tests against all values currently in the Credential Store.
  - Handles partial matches (credential appearing as substring).
  - **Entropy-based detection:** In addition to exact credential matches, scan for high-entropy strings that match known credential patterns (e.g., `AIza[0-9A-Za-z_-]{35}` for Google API keys, `sk-[a-zA-Z0-9]{48}` for OpenAI, `ghp_[a-zA-Z0-9]{36}` for GitHub tokens). This catches credentials the Store doesn't know about — such as keys hallucinated by the LLM from training data. Detected patterns are replaced with `[SUSPICIOUS_CREDENTIAL_REDACTED]` and flagged in audit log.
  - Pattern registry is a static list of regexes, not LLM-driven. Easy to extend for new providers.

- [ ] **M4-004: Policy Engine**
  `src/core/gatekeeper/policy.ts`:
  - Static policies defined in code (not runtime configurable in M4).
  - `checkAccess(role, serviceId, operation): 'granted' | DenialReason`
  - Rate limiting: tracks request count per `agentId + serviceId` per execution.
  - Policies for M4: all LLM agent roles can POST to Gemini `/generateContent`. Nothing else.

  > **Future-proofing note:** Policies in M4 are hardcoded in TypeScript as MVP. In M9 (Team Domains), policies will be loaded from `config/teams/{domain}/policies.yaml`. The PolicyEngine interface (`checkAccess(role, serviceId, operation)`) remains the same — only the data source changes. Design the engine to accept a policy set as constructor input rather than importing a constant, so swapping from hardcoded to file-loaded is a one-line change.

- [ ] **M4-005: Spawn Token — Generation + Validation**
  `src/core/gatekeeper/token.ts`:
  - `SIGNING_SECRET`: generated once via `crypto.randomBytes(32)` at Conductor startup. Lives only in Orchestrator + Gatekeeper memory. Never logged, never serialized to disk.
  - `createSpawnToken(payload): string` — HMAC-SHA256 signature. Format: `base64url(payload).signature`.
  - `validateSpawnToken(token): SpawnTokenPayload | null` — verifies signature with `timingSafeEqual`, checks expiration, returns payload or null.
  - **Replay protection:** Gatekeeper maintains an in-memory set of recently used nonces (with TTL matching max token lifetime). A token whose nonce has been seen before is rejected. Set is pruned periodically to prevent memory leak. This prevents a compromised agent from replaying a captured token.
  - Token includes hierarchy fields: `depth`, `parentAgentId`, `lineage[]`, `maxDepth`, `canSpawn`, `canSpawnRoles[]`.
  - In M4 all agents are depth:0 (flat). Hierarchy fields are present but unused until M5.

- [ ] **M4-006: Executor**
  `src/core/gatekeeper/executor.ts`:
  - Receives `GatekeeperRequest`.
  - Validates Spawn Token → extracts role, agentId, allowed services.
  - Checks nonce for replay → rejects if seen before.
  - Calls PolicyEngine → granted or denied.
  - If granted: resolves credential via Store, injects into fetch headers internally, executes HTTP call.
  - Sanitizes response body (removes any credential that might echo back).
  - Returns `GatekeeperResponse` with only the response body — no auth headers, no credential traces.

- [ ] **M4-007: Gatekeeper barrel export**
  `src/core/gatekeeper/index.ts`:
  - Public API: `execute(request: GatekeeperRequest): Promise<GatekeeperResponse>`
  - `initialize(signingSecret: Buffer): void` — called once by Orchestrator at startup.
  - No direct access to Store, Policy, or Token internals from outside the module.

- [ ] **M4-008: Migrate GeminiProvider to Gatekeeper**
  Alter `src/core/llm/gemini.ts`:
  - Remove direct `fetch()` call and API key reference.
  - Provider receives a `gatekeeper.execute` function (injected, not imported).
  - Provider builds `GatekeeperRequest` with `serviceId: 'gemini'` and receives only the response body.
  - The API key no longer exists anywhere in the LLM module.

- [ ] **M4-009: Gatekeeper audit events**
  Extend logger for Gatekeeper-specific events:
  - `gatekeeper_request`: agent requested an operation (sanitized).
  - `gatekeeper_granted`: policy allowed the operation.
  - `gatekeeper_denied`: policy denied — includes `reason`, `agentId`, `role`.
  - `gatekeeper_executed`: HTTP call made (sanitized, no credentials).
  - `gatekeeper_result`: result returned to agent (sanitized).
  All events pass through Sanitizer before writing. Entropy-flagged strings generate additional `suspicious_credential_detected` events.

- [ ] **M4-010: Global safety limits**
  Constants enforced by Gatekeeper:
  - `MAX_GLOBAL_DEPTH`: 4 — prevents infinite spawn recursion.
  - `MAX_CHILDREN_PER_AGENT`: 5 — prevents fork bombs.
  - `MAX_TOTAL_AGENTS_PER_TASK`: 20 — global resource cap per task.
  - `MIN_CHILD_EXECUTION_TIME`: 10,000ms — child needs minimum useful time.
  These are checked at spawn time, not at request time.

- [ ] **M4-011: Gatekeeper container**
  Gatekeeper runs in its own Docker container on the `conductor-internal` network.
  - **Only container with external internet access** — configured via Docker network gateway/NAT rules. Agent containers have no route to the internet; only the Gatekeeper container does.
  - Only container with credential environment variables (`GEMINI_API_KEY`, `SIGNING_SECRET`, etc.).
  - Agent containers receive only `GATEKEEPER_TOKEN` and `GATEKEEPER_HOST`.
  - Gatekeeper container has no access to agent workspaces.

- [ ] **M4-012: Tests**
  Unit: Store loads/resolves, Policy grants/denies, Sanitizer removes credentials (exact match + entropy patterns), Token generation/validation (valid accepted, expired rejected, tampered rejected, wrong taskId rejected, replayed nonce rejected).
  Integration: real Gemini call via Gatekeeper, token-authenticated.
  Security: `grep -r` all audit logs for known credential values and high-entropy patterns — zero matches.
  Hierarchy: token with depth:0 has correct hierarchy fields, validation passes.
  Tag `v0.5.0-gatekeeper` in git.

### Acceptance Criteria

1. `GeminiProvider` contains zero references to any API key.
2. `grep -r "AIza" logs/` returns zero results after a full execution.
3. An agent with role `qa` requesting `serviceId: 'github'` (no policy) is denied and logged.
4. Rate limit works: agent exceeding `maxRequestsPerExecution` is denied on subsequent calls.
5. Spawn Token with tampered signature is rejected.
6. Replayed token (same nonce) is rejected.
7. Sanitizer catches a test string matching Google API key pattern even when not in Credential Store.

---

## Milestone 5 — Hierarchical Agent Spawning

**Goal:** Agents can create sub-agents with attenuated (reduced) permissions. Permission chains are cryptographically enforced via token delegation. No agent can escalate beyond its parent.

**Prerequisite:** Milestone 4 complete.

**Principle:** Monotonic attenuation — permissions only reduce down the tree, never amplify.

### Issues

- [ ] **M5-001: Spawn sub-agent via Gatekeeper**
  New `requestType: 'spawn_sub_agent'` in Gatekeeper.
  - Parent agent sends: spawn token + child spec (role, tools, services, maxExecutionTime, canSpawn).
  - **Payload size limit:** Child spec must be < 64KB. Requests exceeding this are rejected immediately (prevents a malicious parent from trying to OOM the Gatekeeper with a giant manifest).
  - Gatekeeper validates: child tools ⊆ parent tools, child services ⊆ parent services, child time ≤ parent remaining time, child role ∈ parent canSpawnRoles, parent depth < parent maxDepth.
  - Gatekeeper generates child token (parent never sees it), creates child container, injects token.
  - Returns `childAgentId` to parent — no token, no credentials.

- [ ] **M5-002: Delegate work / Collect result**
  Parent → child communication routed through Gatekeeper.
  - `delegate_work`: parent sends instruction + context to child via Gatekeeper. Gatekeeper validates lineage.
  - `collect_result`: parent requests child's output. Gatekeeper validates lineage + child completion status.
  - Direct container-to-container communication is blocked by network policy.

- [ ] **M5-003: Lifecycle management**
  - Parent expires/dies → all children cascade-killed.
  - Implementation: each child container is labeled with `parent_agent_id` via Docker label. A Garbage Collector goroutine in the Orchestrator periodically scans (every 5s) for containers whose parent no longer exists or whose parent token has expired. Orphaned containers are terminated and logged.
  - Task ends → entire agent tree destroyed (GC does a full sweep by `taskId` label).
  - GC events logged as `agent_orphan_collected` with lineage for debugging.

- [ ] **M5-004: Hierarchical audit trail**
  - Spawn events include full `lineage[]`.
  - Audit log enables reconstruction of the complete agent tree for any task.
  - New CLI command: `conductor tree {taskId}` — prints the agent hierarchy with depth, role, status, and lifetime.

- [ ] **M5-005: Hierarchy tests**
  - Coordinator spawns Dev, Dev spawns Sub-Dev (read-only) → Sub-Dev tries write → denied.
  - Dev tries to spawn QA → denied (not in `canSpawnRoles`).
  - Agent at `maxDepth` tries to spawn → denied.
  - Parent expires → children terminated within 10s (GC interval + buffer).
  - Full 3-level chain: Coordinator → Dev → Sub-Dev, task completes, all destroyed.
  - Oversized child spec (>64KB) → rejected immediately.
  - Tag `v0.6.0-hierarchy` in git.

---

## Milestone 6 — Learning Companion

**Goal:** Post-execution analysis that generates versioned policy documents (playbooks, known failures, risk profiles). Coordinator reads these before routing.

**Prerequisite:** Milestone 1 complete (needs real LLM outputs to analyze). Independent of M2–M5.

**Safety note:** Generated policies can affect all future executions. A bad policy can break everything. All new policies require human approval before activation.

### Issues

- [ ] **M6-001: Execution analyzer**
  Reads completed audit trails. Identifies patterns: common failures, slow agents, token waste, retry frequency. Outputs structured analysis as JSON (not freeform text).

- [ ] **M6-002: Policy document generator**
  Produces versioned markdown documents in `docs/memory/`:
  - `playbooks/{pattern}.md` — known solutions for recurring task types.
  - `failures/{pattern}.md` — known failure modes and mitigations.
  - `risk-profiles/{category}.md` — risk assessments per task category.

  **Canary release mechanism:** New policies are generated with status `draft`. They are applied only when:
  1. Operator explicitly promotes a policy from `draft` to `active` (human approval required).
  2. Alternatively, a policy can be set to `canary` — applied to a configurable percentage of tasks (default 10%) while the `active` version handles the rest. After N successful executions with the canary, operator can promote to `active`.

  Policy files include metadata: `{ version, status: 'draft' | 'canary' | 'active', createdAt, promotedAt?, basedOnTasks: [] }`.

- [ ] **M6-003: Coordinator doctrine integration**
  Coordinator's system prompt includes relevant playbooks and risk profiles for the current task type. Selected by keyword/category match, not by LLM. Only `active` policies are included — never `draft` or `canary` (unless the task was selected for canary).

- [ ] **M6-004: Failure pattern detection**
  Automated detection of degrading performance: increasing retry rates, increasing token usage for same task types, new parse errors after model updates. Generates alerts (logged as audit events) when thresholds are crossed. Does not auto-remediate — alerts are for human review.

---

## Milestone 7 — External Integrations

**Goal:** GitHub/GitLab for code, CI/CD triggers, optional Jira for human communication. All access through Gatekeeper — no agent ever holds an external credential.

**Prerequisite:** Milestone 4 complete (Gatekeeper must exist before any external credential is used).

### Issues

- [ ] **M7-001: GitHub integration (read/write repos)**
  - New Gatekeeper service: `github`. Credential: `GITHUB_TOKEN`.
  - Policies: Dev agents can read/write repos. QA agents read-only. Product/Coordinator: no access.
  - Operations: clone, read file, create branch, commit, create PR.
  - All via GitHub REST API through Gatekeeper — no `git` CLI with embedded tokens.

- [ ] **M7-002: CI/CD pipeline trigger**
  - New Gatekeeper service: `ci`. Credential: varies (GitHub Actions token, GitLab CI token).
  - Dev agent can trigger pipelines. QA agent can read pipeline status.
  - Webhook receiver for pipeline completion notifications.

- [ ] **M7-003: Jira integration (read tickets, update status)**
  - New Gatekeeper service: `jira`. Credential: `JIRA_API_TOKEN`.
  - Product agent can read/create tickets. Coordinator can update status.
  - No agent can delete tickets or modify project settings.

- [ ] **M7-004: Headless browser (research agent)**
  - New Gatekeeper service: `browser`.
  - **Implementation decision (evaluate during M7):**
    - **Option A: Self-hosted container.** Puppeteer/Playwright in a dedicated hardened container (e.g., `browserless/chrome` or `zenika/alpine-chrome`). Heavier but no external dependency. Use if cost of third-party API is prohibitive or if data sensitivity requires keeping traffic internal.
    - **Option B: Third-party API.** Firecrawl, Browserless.io, or similar service accessed via Gatekeeper. Lighter infrastructure but adds external dependency and data leaves the system.
    - Decision documented in `docs/decisions/m7-004-browser-choice.md` with tradeoffs.
  - Regardless of implementation, the agent interface is identical:
    - Agent requests: `{ url, action: 'screenshot' | 'extract_text' | 'fill_form' | 'click' }`.
    - Gatekeeper proxies to browser (container or API).
    - **URL allowlist** enforced by policy (no arbitrary browsing). Allowlist managed per task or per role.
    - Response: screenshot (base64) or extracted text. Never raw HTML (too large, potential XSS in logs).
    - Rate limited: max N page loads per task (configurable in policy).
  - If self-hosted: browser container has internet access but is isolated from agent containers. Only reachable via Gatekeeper.

- [ ] **M7-005: External service audit**
  - Every external operation logged with: service, operation, agent, timestamp, success/failure, response size.
  - Monthly cost report generator: API calls per service, per task type, per agent role.
  - Anomaly detection: agent making unusual number of external calls compared to historical baseline → flagged as `external_access_anomaly` audit event for human review.

---

## Milestone 8 — Web Interface

**Goal:** Operations console (not chat). Execution history, agent timeline, audit viewer, human approval flow.

**Prerequisite:** Milestone 4 complete (Gatekeeper provides the API security model).

### Issues

- [ ] **M8-001: HTTP API layer**
  Express or Fastify API. Authentication via API key (managed by Gatekeeper — the web API is just another "agent" with its own token and policies). CORS restricted. Rate limited. Endpoints: start task, get task status, get audit trail, get agent tree, approve/reject policy (M6).

- [ ] **M8-002: Execution dashboard**
  Real-time view of running tasks. Agent tree visualization (uses M5 hierarchy data). Token usage charts (Recharts or similar). Cost tracking per task and cumulative.

- [ ] **M8-003: Audit trail viewer**
  Searchable, filterable audit log viewer. Syntax highlighting for JSON payloads. Credential sanitization verified in UI (confirms no `[REDACTED]` values leak). Timeline view showing agent spawn/destroy lifecycle.

- [ ] **M8-004: Human approval workflow**
  Certain task types require human approval before Dev Agent executes. Coordinator flags tasks as `needs_approval`. Dashboard shows pending approvals. Approved tasks resume pipeline. Rejected tasks are logged and terminated. Also used for policy promotion (M6 canary → active).

---

## Milestone 9 — Team Domains

**Goal:** Conductor serves multiple teams within the same organization. Each team defines its own agent roles, pipeline sequence, system prompts, manifests, tools, and Gatekeeper policies. No core code changes needed to add a new team — it's pure configuration.

**Prerequisite:** Milestone 4 complete (Gatekeeper policies must exist). Milestone 5 recommended (hierarchical spawning enables complex team pipelines).

### Issues

- [ ] **M9-001: Role Registry**
  Replace `AgentRole` union type with string validated against a dynamic `RoleRegistry`. Registry loaded from team config directories at startup. All existing code using `AgentRole` is updated to use registry lookups.

- [ ] **M9-002: Manifest Loader**
  Replace hardcoded `MANIFEST_REGISTRY` in `manifests.ts` with a loader that reads from `config/teams/{domain}/manifests/{role}.yaml`. `AgentManifest` interface unchanged.

- [ ] **M9-003: Pipeline Templates**
  Define `PipelineTemplate` type. Loader reads from `config/teams/{domain}/pipeline.yaml`. Orchestrator receives template and executes stages in order. Conditional stages supported via predicate expressions.

- [ ] **M9-004: Tool Registry**
  Replace hardcoded `TOOL_CAPABILITY_MAP` with a loadable config. Teams register domain-specific tools with their capability categories.

- [ ] **M9-005: Team-scoped Gatekeeper policies**
  Policy Engine loads policies from `config/teams/{domain}/policies.yaml`. Each team's roles have independent access rules. Cross-team credential access is impossible by design.

- [ ] **M9-006: Team-scoped audit trails**
  Audit logs namespaced by team: `logs/{domain}/{taskId}.jsonl`. Query and search scoped to team.

- [ ] **M9-007: Orchestrator pipeline engine**
  Refactor `orchestrator.ts` to execute any `PipelineTemplate` instead of a hardcoded sequence. The engineering pipeline becomes `config/teams/engineering/pipeline.yaml`.

- [ ] **M9-008: First non-engineering team**
  Create a complete team config for a second domain (e.g., content marketing or customer support). Write system prompts, manifests, pipeline, and policies. Run end-to-end. Proves the system is truly domain-independent.

- [ ] **M9-009: Team management CLI**
  `conductor teams list`, `conductor teams validate {domain}` (checks config integrity), `conductor teams create {domain}` (scaffolds directory structure).

---

## Future Milestones (Not Yet Detailed)

### Milestone 10 — Multi-Provider LLM
  - Anthropic Claude provider (`src/core/llm/anthropic.ts`).
  - OpenAI provider (`src/core/llm/openai.ts`).
  - Model routing per role: team config specifies which model each role uses.
  - Cost optimization: automatic model selection based on task complexity.
  - All providers go through Gatekeeper — same credential isolation.
  - `TokenUsage` normalization already done in M1-008.

### Milestone 11 — Multi-Tenant
  - Multiple organizations sharing one Conductor instance.
  - Distinct from M9 (Team Domains = teams within one org; Multi-Tenant = separate orgs).
  - Tenant isolation: separate credential stores, separate team configs, separate audit trails.
  - Tenant-level quotas (tokens, tasks, agents, cost caps).
  - Gatekeeper policies scoped per tenant → per team → per role (three-level hierarchy).

### Milestone 12 — Self-Improvement Loop
  - Conductor analyzes its own execution patterns.
  - Proposes prompt improvements based on failure analysis.
  - A/B testing of system prompts with automated quality metrics.
  - Human approval required before any prompt change is promoted.
