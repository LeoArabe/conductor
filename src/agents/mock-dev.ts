// src/agents/mock-dev.ts
// Mock Dev Agent — stub executor.
// Returns a hardcoded artifact and tool invocation log regardless of input.
// Logs execution start and end via the audit logger.

import { logEvent } from '../core/logger';
import type { DevOutput, IntentSpec } from '../core/types';

/**
 * Mock Dev Agent execution.
 * Receives an Intent Spec, returns a hardcoded completed output
 * with 1 artifact (a simple .ts file) and a mock tool_invocations log.
 *
 * In the real implementation, this agent would execute against the spec
 * within an isolated workspace. Here it always returns the same artifact.
 */
export function execute(
  spec: IntentSpec,
  agentId: string,
  projectRoot: string,
): DevOutput {
  const now = new Date().toISOString();

  logEvent({
    timestamp: now,
    taskId: spec.taskId,
    eventType: 'agent_execution_start',
    agentId,
    data: { role: 'dev', specId: spec.specId },
  }, projectRoot);

  const output: DevOutput = {
    taskId: spec.taskId,
    specId: spec.specId,
    status: 'completed',
    artifacts: [
      {
        path: 'src/greet.ts',
        content: [
          'export function greet(name: string): string {',
          '  return `Hello, ${name}!`;',
          '}',
          '',
        ].join('\n'),
        type: 'source',
      },
    ],
    toolInvocations: [
      {
        tool: 'write',
        args: { path: 'src/greet.ts' },
        result: 'File written successfully.',
        timestamp: now,
      },
      {
        tool: 'tsc',
        args: { flags: ['--noEmit', 'src/greet.ts'] },
        result: 'No errors found.',
        timestamp: now,
      },
    ],
  };

  logEvent({
    timestamp: new Date().toISOString(),
    taskId: spec.taskId,
    eventType: 'agent_execution_end',
    agentId,
    data: {
      role: 'dev',
      specId: spec.specId,
      status: output.status,
      artifactCount: output.artifacts.length,
    },
  }, projectRoot);

  return output;
}
