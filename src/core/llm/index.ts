// src/core/llm/index.ts
// Barrel export + provider factory.
// Agents import from 'src/core/llm', never from a specific provider file.

export type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMResult,
  LLMError,
  LLMErrorKind,
  TokenUsage,
  ProviderConfig,
} from './types';

export { parseJSON } from './parser';
export type { ParseResult, ParseError, ParseErrorKind } from './parser';

export {
  isClassificationResult,
  isIntentSpec,
  isDevOutput,
  isValidationReport,
} from './validators';

export { loadSystemPrompt } from './prompt-loader';

import type { LLMProvider, ProviderConfig } from './types';
import { GeminiProvider } from './gemini';

/**
 * Creates an LLM provider instance from configuration.
 * Future providers are added as new cases here.
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config.apiKey);
  }
}
