// src/core/llm/prompt-loader.ts
// Loads and assembles system prompts for LLM API calls.
// Reads the role's markdown contract from docs/agents/{role}.md
// and appends runtime constraints derived from the manifest permissions.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { AgentManifest, AgentRole } from '../types';
import { MANIFEST_REGISTRY, TOOL_CAPABILITY_MAP } from '../manifests';

// -----------------------------------------------------------------------------
// Internal: Tool Filtering
// -----------------------------------------------------------------------------

/**
 * Returns the subset of manifest tools permitted under the role's permissions.
 * Same filtering logic as runtime.ts — permissions can only reduce the tool set.
 */
function getEffectiveTools(manifest: AgentManifest): string[] {
  return manifest.tools.filter((tool) => {
    const capabilities = TOOL_CAPABILITY_MAP[tool] ?? [];

    if (manifest.permissions.allowNetwork === false && capabilities.includes('network')) {
      return false;
    }

    if (!manifest.permissions.allowFilesystem && capabilities.includes('filesystem')) {
      return false;
    }

    return true;
  });
}

// -----------------------------------------------------------------------------
// Internal: Constraints Block
// -----------------------------------------------------------------------------

/**
 * Builds the RUNTIME CONSTRAINTS text block from manifest permissions.
 * Appended to the markdown content to make constraints explicit to the LLM.
 * This block describes what is enforced — it does not grant permissions.
 */
function buildConstraintsBlock(manifest: AgentManifest, effectiveTools: string[]): string {
  const { permissions } = manifest;

  // Network policy
  let networkLine: string;
  if (Array.isArray(permissions.allowNetwork)) {
    networkLine = `RESTRICTED. Permitted domains: ${permissions.allowNetwork.join(', ')}.`;
  } else {
    networkLine = 'DENIED. No outbound network access is permitted.';
  }

  // Filesystem policy
  const filesystemLine = permissions.allowFilesystem
    ? 'RESTRICTED. Read/write permitted within ./workspace only.'
    : 'DENIED. No filesystem access is permitted.';

  // Effective tools list
  const toolsList = effectiveTools.length > 0
    ? effectiveTools.map((t) => `  - ${t}`).join('\n')
    : '  (none)';

  return [
    '---',
    '',
    '## RUNTIME CONSTRAINTS',
    '',
    'These constraints are enforced structurally by the runtime.',
    'They are not guidelines. Violations will be denied and logged.',
    '',
    `**Network access:** ${networkLine}`,
    '',
    `**Filesystem access:** ${filesystemLine}`,
    '',
    '**Permitted tools:**',
    toolsList,
    '',
    `**Execution time limit:** ${permissions.maxExecutionTime}ms`,
    '',
    `**Cost cap:** ${permissions.maxCostCap} tokens`,
  ].join('\n');
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Loads the system prompt for a given agent role.
 *
 * Assembly:
 * 1. Reads docs/agents/{role}.md from disk.
 * 2. Filters manifest tools by permissions to get effective tool set.
 * 3. Appends RUNTIME CONSTRAINTS block derived from manifest.
 * 4. Returns the complete prompt string ready for LLM systemPrompt field.
 *
 * Throws if the markdown file cannot be read (configuration error, not runtime condition).
 */
export function loadSystemPrompt(role: AgentRole, projectRoot?: string): string {
  const root = projectRoot ?? process.cwd();
  const manifest = MANIFEST_REGISTRY[role];
  const mdPath = path.resolve(root, manifest.systemPromptPath);

  let content: string;
  try {
    content = fs.readFileSync(mdPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load system prompt for role '${role}' at ${mdPath}: ${message}`,
    );
  }

  const effectiveTools = getEffectiveTools(manifest);
  const constraintsBlock = buildConstraintsBlock(manifest, effectiveTools);

  return `${content.trimEnd()}\n\n${constraintsBlock}\n`;
}
