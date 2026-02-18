// src/core/orchestrator.ts
// Orchestrator loop. The backbone of the execution pipeline.
// Receives a task, runs the full agent sequence, returns the result.
//
// CURRENT FLOW (hardcoded engineering pipeline):
//   classify → product (if routed) OR inline spec (if technical) → dev → qa → done.
//
// TARGET FLOW (M9 - Team Domains):
//   The orchestrator receives a PipelineTemplate from the team domain config.
//   It iterates through the template stages, spawning and destroying agents
//   in order. The orchestrator does not know what domain it's serving —
//   it executes whatever pipeline it receives.
//
//   The run() function signature changes from:
//     run(task: Task, projectRoot: string): ExecutionResult
//   To:
//     run(task: Task, pipeline: PipelineTemplate, projectRoot: string): ExecutionResult
//
//   The hardcoded classify → product → dev → qa becomes one specific
//   PipelineTemplate ("engineering") loaded from config/teams/engineering/pipeline.yaml.
//   Other teams have their own templates with different stage sequences.
//
//   Conditional stages (e.g., skip product for technical tasks) are expressed
//   in the template as predicates, not as if/else in orchestrator code.
//
// Each agent is "spawned" and "destroyed" — logged in the audit trail.

import * as crypto from 'node:crypto';

import { classify } from '../agents/mock-coordinator';
import { execute as executeProduct } from '../agents/mock-product';
import { execute as executeDev } from '../agents/mock-dev';
import { execute as executeQA } from '../agents/mock-qa';
import { logEvent } from './logger';
import type { ExecutionResult, IntentSpec, Task } from './types';

function generateAgentId(role: string): string {
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${role}-${Date.now()}-${suffix}`;
}

function generateSpecId(): string {
  const suffix = crypto.randomBytes(4).toString('hex');
  return `spec-${Date.now()}-${suffix}`;
}

function logSpawn(taskId: string, agentId: string, role: string, projectRoot: string): void {
  logEvent({
    timestamp: new Date().toISOString(),
    taskId,
    eventType: 'agent_spawned',
    agentId,
    data: { role },
  }, projectRoot);
}

function logDestroy(taskId: string, agentId: string, role: string, projectRoot: string): void {
  logEvent({
    timestamp: new Date().toISOString(),
    taskId,
    eventType: 'agent_destroyed',
    agentId,
    data: { role },
  }, projectRoot);
}

/**
 * Builds a minimal Intent Spec directly from the task body.
 * Used when classification routes to Dev (technical_explicit),
 * bypassing the Product Agent per docs/agents/coordinator.md.
 */
function buildInlineSpec(task: Task): IntentSpec {
  return {
    specId: generateSpecId(),
    taskId: task.taskId,
    objective: task.body,
    requirements: [
      {
        id: 'REQ-001',
        description: task.body,
        verification: 'Implementation satisfies the task description as stated.',
      },
    ],
    constraints: [],
    outOfScope: ['Anything not explicitly stated in the task description.'],
    assumptions: [
      {
        id: 'ASM-001',
        statement: 'The task description is a complete, unambiguous technical instruction.',
        source: 'operator_input',
      },
    ],
    contextRefs: [],
  };
}

/**
 * Runs the full orchestration pipeline for a given task.
 *
 * Sequence:
 * 1. Log execution start.
 * 2. Spawn Coordinator → classify task → destroy Coordinator.
 * 3. If routed to product: spawn Product Agent → produce Intent Spec → destroy.
 *    If routed to dev: skip Product Agent, generate inline spec from task body.
 * 4. Spawn Dev Agent → produce artifacts → destroy.
 * 5. Spawn QA Agent → validate artifacts against spec → destroy.
 * 6. Log execution end.
 * 7. Return the collected ExecutionResult.
 */
export function run(task: Task, projectRoot: string): ExecutionResult {
  // --- Execution start ---
  logEvent({
    timestamp: new Date().toISOString(),
    taskId: task.taskId,
    eventType: 'execution_start',
    data: { body: task.body },
  }, projectRoot);

  // --- Step 1: Classification ---
  const coordinatorId = generateAgentId('coordinator');
  logSpawn(task.taskId, coordinatorId, 'coordinator', projectRoot);

  const classification = classify(task, projectRoot);

  logDestroy(task.taskId, coordinatorId, 'coordinator', projectRoot);

  // --- Step 2: Intent Spec (Product Agent or inline) ---
  let intentSpec: IntentSpec;

  if (classification.routedTo === 'product') {
    const productId = generateAgentId('product');
    logSpawn(task.taskId, productId, 'product', projectRoot);

    intentSpec = executeProduct(task, classification, productId, projectRoot);

    logDestroy(task.taskId, productId, 'product', projectRoot);
  } else {
    intentSpec = buildInlineSpec(task);

    logEvent({
      timestamp: new Date().toISOString(),
      taskId: task.taskId,
      eventType: 'product_skipped',
      data: {
        reason: 'Classification routed directly to dev. Technical input does not require disambiguation.',
        category: classification.category,
        ruleApplied: classification.ruleApplied,
        inlineSpecId: intentSpec.specId,
      },
    }, projectRoot);
  }

  // --- Step 3: Dev Agent (Artifacts) ---
  const devId = generateAgentId('dev');
  logSpawn(task.taskId, devId, 'dev', projectRoot);

  const devOutput = executeDev(intentSpec, devId, projectRoot);

  logDestroy(task.taskId, devId, 'dev', projectRoot);

  // --- Step 4: QA Agent (Validation) ---
  const qaId = generateAgentId('qa');
  logSpawn(task.taskId, qaId, 'qa', projectRoot);

  const validation = executeQA(intentSpec, devOutput, qaId, projectRoot);

  logDestroy(task.taskId, qaId, 'qa', projectRoot);

  // --- Execution end ---
  logEvent({
    timestamp: new Date().toISOString(),
    taskId: task.taskId,
    eventType: 'execution_end',
    data: {
      verdict: validation.verdict,
      summary: validation.summary,
    },
  }, projectRoot);

  return {
    taskId: task.taskId,
    classification,
    intentSpec,
    devOutput,
    validation,
  };
}
