// src/agents/mock-product.ts
// Mock Product Agent — stub disambiguator.
// Returns a hardcoded Intent Spec regardless of input.
// Logs execution start and end via the audit logger.

import * as crypto from 'node:crypto';

import { logEvent } from '../core/logger';
import type { ClassificationResult, IntentSpec, Task } from '../core/types';

/**
 * Generates a unique spec ID.
 */
function generateSpecId(): string {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `spec-${Date.now()}-${suffix}`;
}

/**
 * Mock Product Agent execution.
 * Receives the task and classification, returns a hardcoded Intent Spec.
 *
 * In the real implementation, this agent would disambiguate the task body
 * against injected context and produce a rigorous specification.
 * Here it always returns the same spec — proving the pipeline works.
 */
export function execute(
  task: Task,
  _classification: ClassificationResult,
  agentId: string,
  projectRoot: string,
): IntentSpec {
  logEvent({
    timestamp: new Date().toISOString(),
    taskId: task.taskId,
    eventType: 'agent_execution_start',
    agentId,
    data: { role: 'product' },
  }, projectRoot);

  const spec: IntentSpec = {
    specId: generateSpecId(),
    taskId: task.taskId,
    objective: 'Create a TypeScript function that returns a greeting string.',
    requirements: [
      {
        id: 'REQ-001',
        description: 'A function named "greet" must exist and accept a single string parameter "name".',
        verification: 'File contains an exported function with signature: greet(name: string): string.',
      },
      {
        id: 'REQ-002',
        description: 'The function must return a string in the format "Hello, {name}!".',
        verification: 'Calling greet("World") returns exactly "Hello, World!".',
      },
    ],
    constraints: [
      {
        id: 'CON-001',
        description: 'The function must not perform I/O, network calls, or access the filesystem.',
      },
    ],
    outOfScope: [
      'Internationalization or locale-specific greetings.',
      'Input validation beyond what TypeScript types enforce.',
      'Unit test files — testing is a separate task.',
    ],
    assumptions: [
      {
        id: 'ASM-001',
        statement: 'The target runtime supports ES2022 or later.',
        source: 'operator_input',
      },
    ],
    contextRefs: [],
  };

  logEvent({
    timestamp: new Date().toISOString(),
    taskId: task.taskId,
    eventType: 'agent_execution_end',
    agentId,
    data: { role: 'product', specId: spec.specId },
  }, projectRoot);

  return spec;
}
