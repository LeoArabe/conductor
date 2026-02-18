// src/core/runtime.ts
// Agent spawn logic. This module is the enforcement boundary between
// the manifest definition and the agent's actual runtime configuration.
//
// spawnAgent() is the only public API. All other functions are internal.
// This module never throws. All errors are returned as SpawnError values.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { TOOL_CAPABILITY_MAP } from './manifests';
import type {
  AgentManifest,
  AgentPermissions,
  ResolvedScope,
  SpawnError,
  SpawnResult,
  Task,
} from './types';

// -----------------------------------------------------------------------------
// Internal: Tool Filtering
// -----------------------------------------------------------------------------

/**
 * Returns the subset of manifest tools permitted under the given permissions.
 *
 * Rules:
 * - If allowNetwork is false: remove all tools with 'network' capability.
 * - If allowFilesystem is false: remove all tools with 'filesystem' capability.
 * - Tools not in TOOL_CAPABILITY_MAP are passed through (treated as safe).
 * - The manifest tools list is the ceiling. Permissions can only reduce it.
 */
function filterTools(tools: readonly string[], permissions: AgentPermissions): string[] {
  return tools.filter((tool) => {
    const capabilities = TOOL_CAPABILITY_MAP[tool] ?? [];

    if (permissions.allowNetwork === false && capabilities.includes('network')) {
      return false;
    }

    if (!permissions.allowFilesystem && capabilities.includes('filesystem')) {
      return false;
    }

    return true;
  });
}

// -----------------------------------------------------------------------------
// Internal: Scope Resolution
// -----------------------------------------------------------------------------

/**
 * Converts a manifest's raw permissions into the enforcement-ready ResolvedScope.
 * This is what the runtime enforces — not the manifest permissions directly.
 */
function resolveScope(manifest: AgentManifest, effectiveTools: string[]): ResolvedScope {
  const { permissions, role } = manifest;

  let networkPolicy: ResolvedScope['networkPolicy'];
  if (Array.isArray(permissions.allowNetwork)) {
    networkPolicy = permissions.allowNetwork;
  } else {
    // Both false and true resolve to 'none'.
    // true (open network) is not a valid policy — no ambient authority.
    networkPolicy = 'none';
  }

  const filesystemPolicy: ResolvedScope['filesystemPolicy'] =
    permissions.allowFilesystem ? 'workspace' : 'none';

  return {
    role,
    effectiveTools,
    networkPolicy,
    filesystemPolicy,
    maxExecutionTime: permissions.maxExecutionTime,
    maxCostCap: permissions.maxCostCap,
  };
}

// -----------------------------------------------------------------------------
// Internal: System Prompt Assembly
// -----------------------------------------------------------------------------

/**
 * Reads the markdown contract file for an agent role.
 * Returns the raw content, or null if the file cannot be read.
 */
function loadSystemPromptContent(systemPromptPath: string, projectRoot: string): string | null {
  const absolutePath = path.resolve(projectRoot, systemPromptPath);
  try {
    return fs.readFileSync(absolutePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Generates the structured permissions section appended to the agent's system prompt.
 * This block makes permissions explicit to the agent in plain text.
 * It does not grant permissions — it describes what has already been enforced structurally.
 */
function buildPermissionsBlock(scope: ResolvedScope): string {
  const networkLine =
    scope.networkPolicy === 'none'
      ? 'DENIED. No outbound network access is permitted.'
      : `RESTRICTED. Permitted domains: ${scope.networkPolicy.join(', ')}.`;

  const filesystemLine =
    scope.filesystemPolicy === 'workspace'
      ? 'RESTRICTED. Read/write is permitted within ./workspace only. All other paths are denied.'
      : 'DENIED. No filesystem access is permitted.';

  const toolsList =
    scope.effectiveTools.length > 0
      ? scope.effectiveTools.map((t) => `  - ${t}`).join('\n')
      : '  (none)';

  return [
    '---',
    '',
    '## Runtime Permissions',
    '',
    'The following permissions are enforced structurally by the runtime.',
    'They are not guidelines. Attempting to exceed them will be denied and logged.',
    '',
    `**Network access:** ${networkLine}`,
    '',
    `**Filesystem access:** ${filesystemLine}`,
    '',
    '**Permitted tools:**',
    toolsList,
    '',
    `**Execution time limit:** ${scope.maxExecutionTime}ms`,
    '',
    `**Cost cap:** ${scope.maxCostCap} tokens`,
    '',
    '---',
    '',
    '## Enforcement Notice',
    '',
    'You are an untrusted, disposable runtime. Your capabilities are enforced externally.',
    'You have no memory of prior executions. You have no access to resources not listed above.',
    'Your output will be validated against the task specification before acceptance.',
    'If your task cannot be completed within these constraints, return a structured failure.',
    'Do not attempt workarounds. Do not escalate your own permissions. Fail explicitly.',
  ].join('\n');
}

/**
 * Combines the role contract (markdown file content) with the resolved permissions block.
 *
 * Assembly order (intentional):
 * 1. Role contract (behavioral definition from the MD file)
 * 2. Permissions block (runtime constraints + enforcement notice)
 */
function assembleSystemPrompt(roleContent: string, scope: ResolvedScope): string {
  const permissionsBlock = buildPermissionsBlock(scope);
  return `${roleContent.trimEnd()}\n\n${permissionsBlock}\n`;
}

// -----------------------------------------------------------------------------
// Internal: Agent ID Generation
// -----------------------------------------------------------------------------

/**
 * Creates a unique, human-readable identifier for an agent instance.
 * Format: {role}-{unix-timestamp-ms}-{4-random-hex-chars}
 * Example: dev-1708276800000-a3f2
 */
function generateAgentId(role: string): string {
  const timestamp = Date.now();
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${role}-${timestamp}-${suffix}`;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Creates a fully resolved, ready-to-execute agent instance record
 * from a manifest and a task.
 *
 * Steps:
 * 1. Load system prompt markdown from manifest.systemPromptPath.
 * 2. Filter tools based on manifest permissions.
 * 3. Resolve the enforcement-ready scope.
 * 4. Assemble the final system prompt (role MD + permissions block).
 * 5. Generate unique agent ID and workspace path.
 * 6. Return the SpawnedAgent record.
 *
 * This function never throws. All errors are returned as SpawnError values.
 * The SpawnResult discriminated union forces callers to handle both cases.
 */
export function spawnAgent(
  manifest: AgentManifest,
  task: Task,
  projectRoot: string,
): SpawnResult {
  // Step 1: Load system prompt
  const roleContent = loadSystemPromptContent(manifest.systemPromptPath, projectRoot);

  if (roleContent === null) {
    const error: SpawnError = {
      kind: 'system_prompt_missing',
      detail: `Cannot read system prompt at path: ${manifest.systemPromptPath} (resolved from: ${projectRoot})`,
      manifestRole: manifest.role,
    };
    return { success: false, error };
  }

  // Step 2: Filter tools by permissions
  const effectiveTools = filterTools(manifest.tools, manifest.permissions);

  // Step 3: Resolve scope
  const scope = resolveScope(manifest, effectiveTools);

  // Step 4: Assemble system prompt
  const systemPrompt = assembleSystemPrompt(roleContent, scope);

  // Step 5: Generate agent ID
  const agentId = generateAgentId(manifest.role);

  // Step 6: Resolve workspace path (isolated per agent instance)
  const workspacePath = path.resolve(projectRoot, 'workspace', agentId);

  return {
    success: true,
    agent: {
      agentId,
      manifest,
      task,
      systemPrompt,
      scope,
      workspacePath,
      createdAt: new Date().toISOString(),
      status: 'ready',
    },
  };
}
