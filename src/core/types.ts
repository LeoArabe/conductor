// src/core/types.ts
// Authoritative type definitions for Conductor.
// These types are contracts. A change here is a breaking change to agent behavior.

// -----------------------------------------------------------------------------
// Agent Role
// -----------------------------------------------------------------------------

/**
 * Agent role identifier.
 *
 * CURRENT: Union type with four fixed engineering roles.
 * TARGET (M9 - Team Domains): Migrates to `string` validated against a
 * dynamic RoleRegistry loaded from team config files. This allows teams
 * to define custom roles (e.g., 'copywriter', 'analyst', 'responder')
 * without modifying core type definitions.
 *
 * Migration path:
 *   M0–M3: AgentRole = 'coordinator' | 'product' | 'dev' | 'qa'
 *   M9:    AgentRole = string (validated at runtime via RoleRegistry)
 *
 * All code consuming AgentRole should avoid switch/case exhaustiveness
 * checks that assume a fixed set of roles. Use if/else or registry
 * lookups instead to ease the future migration.
 */
export type AgentRole = 'coordinator' | 'product' | 'dev' | 'qa';

// -----------------------------------------------------------------------------
// Task
// -----------------------------------------------------------------------------

export type TaskType = 'technical' | 'product' | 'ambiguous';

/**
 * A Task is the unit of work supplied by the operator.
 * Immutable after creation. Fields are readonly by design.
 */
export interface Task {
  readonly taskId: string;
  readonly type?: TaskType;
  readonly body: string;
  readonly contextRegistry: readonly string[];
}

// -----------------------------------------------------------------------------
// Agent Permissions
// -----------------------------------------------------------------------------

/**
 * Defines the exact boundary of what an agent instance is permitted to do.
 * This is the operator-defined ceiling. Runtime enforcement is structural.
 */
export interface AgentPermissions {
  readonly allowNetwork: boolean | readonly string[];
  readonly allowFilesystem: boolean;
  readonly maxExecutionTime: number;
  readonly maxCostCap: number;
}

// -----------------------------------------------------------------------------
// Agent Manifest
// -----------------------------------------------------------------------------

/**
 * The complete, static definition of an agent type.
 * A manifest is the recipe for creating an agent runtime instance.
 * Manifests are immutable. The Coordinator reads a manifest; it does not write one.
 *
 * CURRENT: Defined as constants in manifests.ts with hardcoded engineering roles.
 * TARGET (M9 - Team Domains): Loaded from config/teams/{team}/manifests/{role}.yaml.
 * The interface remains the same — only the source changes from code to config files.
 *
 * Future fields (not yet added, to avoid premature abstraction):
 *   - domain?: string          // Team domain this manifest belongs to
 *   - externalServices?: []    // Gatekeeper service access declarations (M4)
 *   - canSpawn?: boolean       // Whether this role can create sub-agents (M5)
 *   - canSpawnRoles?: string[] // Which roles this agent can spawn (M5)
 */
export interface AgentManifest {
  readonly role: AgentRole;
  readonly image: string;
  readonly systemPromptPath: string;
  readonly permissions: AgentPermissions;
  readonly tools: readonly string[];
}

// -----------------------------------------------------------------------------
// Resolved Scope
// -----------------------------------------------------------------------------

/**
 * Post-filtering, runtime-ready scope definition.
 * Derived from a manifest after permissions are applied.
 * This is what the runtime enforces — not the manifest directly.
 */
export interface ResolvedScope {
  readonly role: AgentRole;
  readonly effectiveTools: readonly string[];
  readonly networkPolicy: 'none' | readonly string[];
  readonly filesystemPolicy: 'workspace' | 'none';
  readonly maxExecutionTime: number;
  readonly maxCostCap: number;
}

// -----------------------------------------------------------------------------
// Spawned Agent
// -----------------------------------------------------------------------------

/**
 * Fully resolved, ready-to-execute agent instance record.
 * Contains everything a real container runtime would need to start execution.
 * At this phase, no process is started — this is the configuration artifact.
 */
export interface SpawnedAgent {
  readonly agentId: string;
  readonly manifest: AgentManifest;
  readonly task: Task;
  readonly systemPrompt: string;
  readonly scope: ResolvedScope;
  readonly workspacePath: string;
  readonly createdAt: string;
  readonly status: 'ready';
}

// -----------------------------------------------------------------------------
// Spawn Errors
// -----------------------------------------------------------------------------

export type SpawnErrorKind =
  | 'manifest_invalid'
  | 'system_prompt_missing'
  | 'permission_conflict'
  | 'scope_violation';

export interface SpawnError {
  readonly kind: SpawnErrorKind;
  readonly detail: string;
  readonly manifestRole: AgentRole;
}

/**
 * Discriminated union result. spawnAgent() never throws.
 * Callers must handle both cases explicitly.
 */
export type SpawnResult =
  | { readonly success: true; readonly agent: SpawnedAgent }
  | { readonly success: false; readonly error: SpawnError };

// -----------------------------------------------------------------------------
// Classification
// -----------------------------------------------------------------------------

export type ClassificationCategory =
  | 'technical_explicit'
  | 'business'
  | 'ambiguous';

export type ClassificationConfidence = 'deterministic' | 'heuristic';

/**
 * The result of the Coordinator's routing decision.
 * Determines which child agent receives the task.
 */
export interface ClassificationResult {
  readonly category: ClassificationCategory;
  readonly routedTo: 'product' | 'dev';
  readonly confidence: ClassificationConfidence;
  readonly ruleApplied: string;
}

// -----------------------------------------------------------------------------
// Intent Spec
// -----------------------------------------------------------------------------

export interface IntentRequirement {
  readonly id: string;
  readonly description: string;
  readonly verification: string;
}

export interface IntentConstraint {
  readonly id: string;
  readonly description: string;
}

export interface IntentAssumption {
  readonly id: string;
  readonly statement: string;
  readonly source: string;
}

/**
 * The Intent Spec is the immutable contract produced by the Product Agent.
 * It fully defines what must be built. The Dev Agent executes against it.
 * The QA Agent validates against it. Schema matches docs/agents/product.md.
 */
export interface IntentSpec {
  readonly specId: string;
  readonly taskId: string;
  readonly objective: string;
  readonly requirements: readonly IntentRequirement[];
  readonly constraints: readonly IntentConstraint[];
  readonly outOfScope: readonly string[];
  readonly assumptions: readonly IntentAssumption[];
  readonly contextRefs: readonly string[];
}

// -----------------------------------------------------------------------------
// Dev Output
// -----------------------------------------------------------------------------

export interface DevArtifact {
  readonly path: string;
  readonly content: string;
  readonly type: string;
}

export interface ToolInvocation {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly result: string;
  readonly timestamp: string;
}

export interface DevError {
  readonly type: 'scope_violation' | 'spec_unclear' | 'tool_failure' | 'timeout' | 'internal';
  readonly detail: string;
}

/**
 * The complete output of a Dev Agent execution.
 * Status is binary: completed or failed. No partial states.
 * Schema matches docs/agents/dev.md output contract.
 */
export type DevOutput =
  | {
      readonly taskId: string;
      readonly specId: string;
      readonly status: 'completed';
      readonly artifacts: readonly DevArtifact[];
      readonly toolInvocations: readonly ToolInvocation[];
    }
  | {
      readonly taskId: string;
      readonly specId: string;
      readonly status: 'failed';
      readonly toolInvocations: readonly ToolInvocation[];
      readonly error: DevError;
    };

// -----------------------------------------------------------------------------
// Validation Report
// -----------------------------------------------------------------------------

export interface RequirementResult {
  readonly requirementId: string;
  readonly status: 'pass' | 'fail';
  readonly evidence: string;
  readonly verificationMethod: string;
}

export interface ConstraintResult {
  readonly constraintId: string;
  readonly status: 'pass' | 'fail';
  readonly evidence: string;
}

export interface ScopeViolation {
  readonly description: string;
  readonly invocationRef: string;
}

export interface ValidationSummary {
  readonly totalRequirements: number;
  readonly passedRequirements: number;
  readonly failedRequirements: number;
  readonly totalConstraints: number;
  readonly violatedConstraints: number;
  readonly scopeViolationCount: number;
}

/**
 * The Validation Report produced by the QA Agent.
 * Verdict is binary: pass or fail. No intermediate states.
 * Schema matches docs/agents/qa.md output contract.
 */
export interface ValidationReport {
  readonly taskId: string;
  readonly specId: string;
  readonly verdict: 'pass' | 'fail';
  readonly requirementResults: readonly RequirementResult[];
  readonly constraintResults: readonly ConstraintResult[];
  readonly scopeViolations: readonly ScopeViolation[];
  readonly summary: ValidationSummary;
}

// -----------------------------------------------------------------------------
// Execution Result
// -----------------------------------------------------------------------------

/**
 * The final result returned by the orchestrator to the CLI.
 * Contains all intermediate outputs for full traceability.
 */
export interface ExecutionResult {
  readonly taskId: string;
  readonly classification: ClassificationResult;
  readonly intentSpec: IntentSpec;
  readonly devOutput: DevOutput;
  readonly validation: ValidationReport;
}

// -----------------------------------------------------------------------------
// Audit Events
// -----------------------------------------------------------------------------

/**
 * Every auditable occurrence in an execution lifecycle.
 * Append-only. Once written, an audit event cannot be modified or deleted.
 */
export interface AuditEvent {
  readonly timestamp: string;
  readonly taskId: string;
  readonly eventType: string;
  readonly agentId?: string;
  readonly data: Readonly<Record<string, unknown>>;
}
