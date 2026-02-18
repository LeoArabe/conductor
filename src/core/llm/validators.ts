// src/core/llm/validators.ts
// Type guards for validating LLM response JSON against agent output schemas.
// Each guard checks required fields, types, and structural constraints.

import type {
  ClassificationResult,
  DevOutput,
  IntentSpec,
  ValidationReport,
} from '../types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number';
}

function isArrayOf<T>(v: unknown, check: (item: unknown) => item is T): v is T[] {
  return Array.isArray(v) && v.every(check);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

// -----------------------------------------------------------------------------
// ClassificationResult
// -----------------------------------------------------------------------------

const VALID_CATEGORIES = ['technical_explicit', 'business', 'ambiguous'] as const;
const VALID_ROUTES = ['product', 'dev'] as const;
const VALID_CONFIDENCES = ['deterministic', 'heuristic'] as const;

export function isClassificationResult(obj: unknown): obj is ClassificationResult {
  if (!isObject(obj)) return false;
  if (!isString(obj['category']) || !(VALID_CATEGORIES as readonly string[]).includes(obj['category'])) return false;
  if (!isString(obj['routedTo']) || !(VALID_ROUTES as readonly string[]).includes(obj['routedTo'])) return false;
  if (!isString(obj['confidence']) || !(VALID_CONFIDENCES as readonly string[]).includes(obj['confidence'])) return false;
  if (!isString(obj['ruleApplied'])) return false;
  return true;
}

// -----------------------------------------------------------------------------
// IntentSpec
// -----------------------------------------------------------------------------

function isIntentRequirement(v: unknown): v is { id: string; description: string; verification: string } {
  if (!isObject(v)) return false;
  return isString(v['id']) && isString(v['description']) && isString(v['verification']);
}

function isIntentConstraint(v: unknown): v is { id: string; description: string } {
  if (!isObject(v)) return false;
  return isString(v['id']) && isString(v['description']);
}

function isIntentAssumption(v: unknown): v is { id: string; statement: string; source: string } {
  if (!isObject(v)) return false;
  return isString(v['id']) && isString(v['statement']) && isString(v['source']);
}

export function isIntentSpec(obj: unknown): obj is IntentSpec {
  if (!isObject(obj)) return false;
  if (!isString(obj['specId']) && !isString(obj['spec_id'])) return false;
  if (!isString(obj['taskId']) && !isString(obj['task_id'])) return false;
  if (!isString(obj['objective'])) return false;

  const reqs = obj['requirements'];
  if (!isArrayOf(reqs, isIntentRequirement)) return false;
  if (reqs.length === 0) return false;

  const cons = obj['constraints'];
  if (!Array.isArray(cons)) return false;
  if (!cons.every(isIntentConstraint)) return false;

  const oos = obj['outOfScope'] ?? obj['out_of_scope'];
  if (!isStringArray(oos)) return false;
  if (oos.length === 0) return false;

  const asms = obj['assumptions'];
  if (!Array.isArray(asms)) return false;
  if (!asms.every(isIntentAssumption)) return false;

  return true;
}

// -----------------------------------------------------------------------------
// DevOutput
// -----------------------------------------------------------------------------

function isDevArtifact(v: unknown): v is { path: string; content: string; type: string } {
  if (!isObject(v)) return false;
  return isString(v['path']) && isString(v['content']) && isString(v['type']);
}

function isToolInvocation(v: unknown): v is { tool: string; args: unknown; result: string; timestamp: string } {
  if (!isObject(v)) return false;
  return isString(v['tool']) && isString(v['result']) && isString(v['timestamp']);
}

export function isDevOutput(obj: unknown): obj is DevOutput {
  if (!isObject(obj)) return false;
  if (!isString(obj['taskId']) && !isString(obj['task_id'])) return false;
  if (!isString(obj['specId']) && !isString(obj['spec_id'])) return false;

  const status = obj['status'];
  if (status !== 'completed' && status !== 'failed') return false;

  const invocations = obj['toolInvocations'] ?? obj['tool_invocations'] ?? [];
  if (!Array.isArray(invocations)) return false;
  if (!invocations.every(isToolInvocation)) return false;

  if (status === 'completed') {
    const artifacts = obj['artifacts'];
    if (!isArrayOf(artifacts, isDevArtifact)) return false;
  }

  if (status === 'failed') {
    const err = obj['error'];
    if (!isObject(err)) return false;
    if (!isString(err['type']) || !isString(err['detail'])) return false;
  }

  return true;
}

// -----------------------------------------------------------------------------
// ValidationReport
// -----------------------------------------------------------------------------

function isRequirementResult(v: unknown): v is { requirementId: string; status: string; evidence: string; verificationMethod: string } {
  if (!isObject(v)) return false;
  const id = v['requirementId'] ?? v['requirement_id'];
  const method = v['verificationMethod'] ?? v['verification_method'];
  if (!isString(id)) return false;
  if (v['status'] !== 'pass' && v['status'] !== 'fail') return false;
  if (!isString(v['evidence'])) return false;
  if (!isString(method)) return false;
  return true;
}

function isConstraintResult(v: unknown): v is { constraintId: string; status: string; evidence: string } {
  if (!isObject(v)) return false;
  const id = v['constraintId'] ?? v['constraint_id'];
  if (!isString(id)) return false;
  if (v['status'] !== 'pass' && v['status'] !== 'fail') return false;
  if (!isString(v['evidence'])) return false;
  return true;
}

function isValidationSummary(v: unknown): v is Record<string, number> {
  if (!isObject(v)) return false;
  const totalReqs = v['totalRequirements'] ?? v['total_requirements'];
  const passedReqs = v['passedRequirements'] ?? v['passed_requirements'];
  const failedReqs = v['failedRequirements'] ?? v['failed_requirements'];
  const totalCons = v['totalConstraints'] ?? v['total_constraints'];
  const violatedCons = v['violatedConstraints'] ?? v['violated_constraints'];
  const scopeCount = v['scopeViolationCount'] ?? v['scope_violation_count'];
  return isNumber(totalReqs) && isNumber(passedReqs) && isNumber(failedReqs) &&
         isNumber(totalCons) && isNumber(violatedCons) && isNumber(scopeCount);
}

export function isValidationReport(obj: unknown): obj is ValidationReport {
  if (!isObject(obj)) return false;
  if (!isString(obj['taskId']) && !isString(obj['task_id'])) return false;
  if (!isString(obj['specId']) && !isString(obj['spec_id'])) return false;
  if (obj['verdict'] !== 'pass' && obj['verdict'] !== 'fail') return false;

  const reqResults = obj['requirementResults'] ?? obj['requirement_results'];
  if (!Array.isArray(reqResults)) return false;
  if (!reqResults.every(isRequirementResult)) return false;

  const conResults = obj['constraintResults'] ?? obj['constraint_results'];
  if (!Array.isArray(conResults)) return false;
  if (!conResults.every(isConstraintResult)) return false;

  const scopeViols = obj['scopeViolations'] ?? obj['scope_violations'];
  if (!Array.isArray(scopeViols)) return false;

  const summary = obj['summary'];
  if (!isValidationSummary(summary)) return false;

  return true;
}
