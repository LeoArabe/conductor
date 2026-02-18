// src/cli.ts
// CLI entry point for Conductor.
// Accepts a task string, runs the full orchestration pipeline, prints results.

import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { run } from './core/orchestrator';
import { getLogPath } from './core/logger';

function generateTaskId(): string {
  const timestamp = Date.now();
  const suffix = crypto.randomBytes(4).toString('hex');
  return `task-${timestamp}-${suffix}`;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === undefined) {
    console.error('Usage: conductor <task description>');
    console.error('Example: node dist/cli.js "Create a hello world function"');
    process.exit(1);
  }

  const taskBody = args.join(' ');
  const taskId = generateTaskId();
  const projectRoot = path.resolve(__dirname, '..');

  console.log(`task_id:     ${taskId}`);
  console.log(`task:        ${taskBody}`);
  console.log();

  try {
    const result = run(
      { taskId, body: taskBody, contextRegistry: [] },
      projectRoot,
    );

    console.log('--- Classification ---');
    console.log(`  category:   ${result.classification.category}`);
    console.log(`  routed_to:  ${result.classification.routedTo}`);
    console.log(`  confidence: ${result.classification.confidence}`);
    console.log(`  rule:       ${result.classification.ruleApplied}`);
    console.log();

    console.log('--- Intent Spec ---');
    console.log(`  spec_id:    ${result.intentSpec.specId}`);
    console.log(`  objective:  ${result.intentSpec.objective}`);
    console.log(`  reqs:       ${result.intentSpec.requirements.length}`);
    console.log(`  constraints:${result.intentSpec.constraints.length}`);
    console.log();

    console.log('--- Dev Output ---');
    console.log(`  status:     ${result.devOutput.status}`);
    if (result.devOutput.status === 'completed') {
      console.log(`  artifacts:  ${result.devOutput.artifacts.length}`);
    }
    console.log();

    console.log('--- QA Verdict ---');
    console.log(`  verdict:    ${result.validation.verdict.toUpperCase()}`);
    const s = result.validation.summary;
    console.log(`  reqs:       ${s.passedRequirements}/${s.totalRequirements} passed`);
    console.log(`  constraints:${s.violatedConstraints}/${s.totalConstraints} violated`);
    console.log(`  scope:      ${s.scopeViolationCount} violations`);
    console.log();

    console.log(`audit_log:   ${getLogPath(taskId, projectRoot)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[conductor] execution failed: ${message}`);
    process.exit(2);
  }
}

main();
