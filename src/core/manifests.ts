// src/core/manifests.ts
// Pre-configured agent manifests aligned with docs/agents/ contracts.
// These are read-only definitions. They are not configurable at runtime.
//
// MIGRATION NOTE (M9 - Team Domains):
// This entire file is replaced by a manifest loader that reads from:
//   config/teams/{team}/manifests/{role}.yaml
//
// The MANIFEST_REGISTRY becomes a dynamic registry populated at startup
// by scanning team config directories. The interface (AgentManifest) stays
// the same — only the source changes from code constants to YAML files.
//
// The TOOL_CAPABILITY_MAP also migrates to a loadable config file,
// allowing teams to register custom tools (e.g., 'cms_publish', 'analytics_query',
// 'email_send') with their capability categories, without modifying core code.

import type { AgentManifest, AgentRole } from './types';

// -----------------------------------------------------------------------------
// Tool Capability Map
// -----------------------------------------------------------------------------

/**
 * Maps tool names to capability categories.
 * Used by the runtime to determine which tools are affected by permission restrictions.
 *
 * CURRENT: Hardcoded map with development-oriented tools.
 * TARGET (M9): Loaded from config/tool-capabilities.yaml.
 *   Teams can register domain-specific tools:
 *     - Marketing: cms_publish (network), analytics_query (network)
 *     - Support: ticket_read (network), kb_search (network)
 *     - CX: survey_send (network), feedback_read (network)
 *   All custom tools that access external services are tagged with 'network'
 *   capability, ensuring they go through the Gatekeeper.
 *
 * Convention: tool names are lowercase, matching the strings in manifest.tools arrays.
 * If a tool name is not in this map, it is treated as having no restricted capabilities.
 */
export const TOOL_CAPABILITY_MAP: Readonly<Record<string, readonly ('network' | 'filesystem')[]>> = {
  // Network-capable tools
  fetch:   ['network'],
  curl:    ['network'],
  wget:    ['network'],
  http:    ['network'],
  npm:     ['network', 'filesystem'],
  pip:     ['network', 'filesystem'],

  // Filesystem tools
  read:    ['filesystem'],
  write:   ['filesystem'],
  fs:      ['filesystem'],
  cat:     ['filesystem'],
  cp:      ['filesystem'],
  mv:      ['filesystem'],
  rm:      ['filesystem'],
  mkdir:   ['filesystem'],

  // Tools with no restricted capabilities
  grep:       [],
  git:        [],
  'npm test': [],
  eslint:     [],
  tsc:        [],
  echo:       [],
};

// -----------------------------------------------------------------------------
// Manifest Definitions
// -----------------------------------------------------------------------------

export const COORDINATOR_MANIFEST: AgentManifest = {
  role: 'coordinator',
  image: 'node:20-alpine',
  systemPromptPath: 'docs/agents/coordinator.md',
  permissions: {
    allowNetwork: false,
    allowFilesystem: false,
    maxExecutionTime: 30_000,
    maxCostCap: 5_000,
  },
  tools: ['grep'],
};

export const PRODUCT_MANIFEST: AgentManifest = {
  role: 'product',
  image: 'node:20-alpine',
  systemPromptPath: 'docs/agents/product.md',
  permissions: {
    allowNetwork: false,
    allowFilesystem: false,
    maxExecutionTime: 120_000,
    maxCostCap: 20_000,
  },
  tools: ['grep'],
};

export const DEV_MANIFEST: AgentManifest = {
  role: 'dev',
  image: 'node:20-alpine',
  systemPromptPath: 'docs/agents/dev.md',
  permissions: {
    allowNetwork: false,
    allowFilesystem: true,
    maxExecutionTime: 600_000,
    maxCostCap: 100_000,
  },
  tools: ['read', 'write', 'grep', 'git', 'npm test', 'eslint', 'tsc'],
};

export const QA_MANIFEST: AgentManifest = {
  role: 'qa',
  image: 'node:20-alpine',
  systemPromptPath: 'docs/agents/qa.md',
  permissions: {
    allowNetwork: false,
    allowFilesystem: false,
    maxExecutionTime: 300_000,
    maxCostCap: 30_000,
  },
  tools: ['read', 'grep'],
};

// -----------------------------------------------------------------------------
// Manifest Registry
// -----------------------------------------------------------------------------

/**
 * Authoritative lookup table for all agent manifests.
 * The Coordinator reads from this registry to determine which manifest to load.
 * Keyed by AgentRole for O(1) lookup and exhaustive type coverage.
 *
 * CURRENT: Fixed record with four engineering roles.
 * TARGET (M9): Dynamic registry type changes to:
 *   Record<string, AgentManifest>  (keyed by "{domain}:{role}")
 *   Example keys: "engineering:dev", "marketing:copywriter", "support:responder"
 *
 * Populated at startup by scanning config/teams/*/manifests/*.yaml.
 * The orchestrator receives the domain from the task and looks up
 * "{domain}:{role}" to find the correct manifest.
 */
export const MANIFEST_REGISTRY: Readonly<Record<AgentRole, AgentManifest>> = {
  coordinator: COORDINATOR_MANIFEST,
  product: PRODUCT_MANIFEST,
  dev: DEV_MANIFEST,
  qa: QA_MANIFEST,
};
