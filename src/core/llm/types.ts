// src/core/llm/types.ts
// Provider-agnostic LLM interfaces.
// Any provider (Gemini, Anthropic, OpenAI, local) implements LLMProvider.
// Agents and orchestrator import from here — never from a specific provider.

// -----------------------------------------------------------------------------
// Request / Response
// -----------------------------------------------------------------------------

export interface LLMRequest {
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly responseFormat?: 'json' | 'text';
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface LLMResponse {
  readonly content: string;
  readonly usage: TokenUsage;
  readonly model: string;
  readonly provider: string;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export type LLMErrorKind =
  | 'api_error'
  | 'rate_limit'
  | 'auth_error'
  | 'timeout'
  | 'parse_error';

export interface LLMError {
  readonly kind: LLMErrorKind;
  readonly message: string;
  readonly statusCode?: number;
}

// -----------------------------------------------------------------------------
// Result (discriminated union — never throws)
// -----------------------------------------------------------------------------

export type LLMResult =
  | { readonly success: true; readonly response: LLMResponse }
  | { readonly success: false; readonly error: LLMError };

// -----------------------------------------------------------------------------
// Provider interface
// -----------------------------------------------------------------------------

export interface LLMProvider {
  complete(request: LLMRequest): Promise<LLMResult>;
}

// -----------------------------------------------------------------------------
// Provider config
// -----------------------------------------------------------------------------

export type ProviderConfig =
  | { readonly provider: 'gemini'; readonly apiKey: string };
