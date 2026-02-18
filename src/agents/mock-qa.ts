// src/agents/mock-qa.ts
// Mock QA Agent — stub auditor.
// Returns a hardcoded pass verdict with per-requirement evidence.
// Logs execution start and end via the audit logger.

import { logEvent } from '../core/logger';
import type { DevOutput, IntentSpec, ValidationReport } from '../core/types';

/**
 * Mock QA Agent execution.
 * Receives the Intent Spec and Dev output, returns a hardcoded pass report
 * with per-requirement results and mock evidence.
 *
 * In the real implementation, this agent would mechanically validate
 * artifacts against the spec. Here it always returns pass.
 */
export function execute(
  spec: IntentSpec,
  devOutput: DevOutput,
  agentId: string,
  projectRoot: string,
): ValidationReport {
  logEvent({
    timestamp: new Date().toISOString(),
    taskId: spec.taskId,
    eventType: 'agent_execution_start',
    agentId,
    data: { role: 'qa', specId: spec.specId },
  }, projectRoot);

  const requirementResults = spec.requirements.map((req) => ({
    requirementId: req.id,
    status: 'pass' as const,
    evidence: `Verified in artifact. Requirement "${req.id}" satisfied.`,
    verificationMethod: req.verification,
  }));

  const constraintResults = spec.constraints.map((con) => ({
    constraintId: con.id,
    status: 'pass' as const,
    evidence: `No violation detected. Constraint "${con.id}" respected.`,
  }));

  const passedReqs = requirementResults.length;
  const failedReqs = 0;
  const violatedCons = 0;

  const report: ValidationReport = {
    taskId: spec.taskId,
    specId: spec.specId,
    verdict: 'pass',
    requirementResults,
    constraintResults,
    scopeViolations: [],
    summary: {
      totalRequirements: requirementResults.length,
      passedRequirements: passedReqs,
      failedRequirements: failedReqs,
      totalConstraints: constraintResults.length,
      violatedConstraints: violatedCons,
      scopeViolationCount: 0,
    },
  };

  logEvent({
    timestamp: new Date().toISOString(),
    taskId: spec.taskId,
    eventType: 'agent_execution_end',
    agentId,
    data: {
      role: 'qa',
      specId: spec.specId,
      verdict: report.verdict,
      summary: report.summary,
    },
  }, projectRoot);

  return report;
}
