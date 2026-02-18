// src/core/logger.ts
// Append-only audit logger. Writes JSON lines to logs/{task_id}.jsonl.
// One file per task. Each line is a self-contained JSON object.
// This module never throws on write failure — it reports to stderr and continues.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { AuditEvent } from './types';

const LOGS_DIR = 'logs';

/**
 * Ensures the logs directory exists. Creates it if missing.
 * Called once per task_id, not per event.
 */
function ensureLogsDir(projectRoot: string): void {
  const logsPath = path.resolve(projectRoot, LOGS_DIR);
  if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath, { recursive: true });
  }
}

/**
 * Returns the absolute path to the log file for a given task_id.
 */
export function getLogPath(taskId: string, projectRoot: string): string {
  return path.resolve(projectRoot, LOGS_DIR, `${taskId}.jsonl`);
}

/**
 * Appends a single audit event as a JSON line to the task's log file.
 *
 * Guarantees:
 * - Append-only. Never truncates or overwrites existing content.
 * - Each call writes exactly one line (JSON + newline).
 * - Creates the logs/ directory if it does not exist.
 * - Timestamps are set at call time if not already present.
 *
 * On write failure: logs to stderr. Does not throw.
 */
export function logEvent(event: AuditEvent, projectRoot: string): void {
  ensureLogsDir(projectRoot);

  const record: AuditEvent = {
    timestamp: event.timestamp || new Date().toISOString(),
    taskId: event.taskId,
    eventType: event.eventType,
    ...(event.agentId !== undefined ? { agentId: event.agentId } : {}),
    data: event.data,
  };

  const line = JSON.stringify(record) + '\n';
  const filePath = getLogPath(event.taskId, projectRoot);

  try {
    fs.appendFileSync(filePath, line, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[conductor] audit write failed: ${message}\n`);
  }
}
