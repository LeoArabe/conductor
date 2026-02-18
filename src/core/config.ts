// src/core/config.ts
// Configuration loader. Reads .env file manually — no dotenv dependency.
// Fails explicitly if required values are missing.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AppConfig {
  readonly geminiApiKey: string;
}

/**
 * Parses a .env file into a key-value map.
 * Handles KEY=VALUE lines, ignores comments (#) and blank lines.
 * Strips surrounding quotes from values.
 */
function parseEnvFile(filePath: string): Map<string, string> {
  const entries = new Map<string, string>();

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return entries;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    entries.set(key, value);
  }

  return entries;
}

/**
 * Loads application configuration from .env file and environment variables.
 * Environment variables take precedence over .env file values.
 * Fails explicitly if required values are missing or empty.
 */
export function loadConfig(projectRoot: string): AppConfig {
  const envPath = path.resolve(projectRoot, '.env');
  const fileVars = parseEnvFile(envPath);

  const geminiApiKey = process.env['GEMINI_API_KEY'] ?? fileVars.get('GEMINI_API_KEY');

  if (!geminiApiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Provide it in .env or as an environment variable.',
    );
  }

  return { geminiApiKey };
}
