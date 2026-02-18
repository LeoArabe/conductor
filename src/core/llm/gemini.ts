// src/core/llm/gemini.ts
// Gemini Flash implementation of LLMProvider.
// Calls the Gemini REST API via fetch. No dependencies.
// No retry logic — retries are the orchestrator's responsibility.

import type { LLMError, LLMProvider, LLMRequest, LLMResult } from './types';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.2;
const REQUEST_TIMEOUT_MS = 60_000;

interface GeminiResponseBody {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
    code?: number;
  };
}

function buildRequestBody(request: LLMRequest): object {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: request.temperature ?? DEFAULT_TEMPERATURE,
  };

  if (request.responseFormat === 'json') {
    generationConfig['responseMimeType'] = 'application/json';
  }

  return {
    system_instruction: {
      parts: [{ text: request.systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: request.userMessage }],
      },
    ],
    generationConfig,
  };
}

function classifyHttpError(status: number, body: string): LLMError {
  if (status === 429) {
    return { kind: 'rate_limit', message: `Rate limited (429): ${body}`, statusCode: status };
  }
  if (status === 401 || status === 403) {
    return { kind: 'auth_error', message: `Authentication failed (${status}): ${body}`, statusCode: status };
  }
  return { kind: 'api_error', message: `HTTP ${status}: ${body}`, statusCode: status };
}

function extractContent(body: GeminiResponseBody): string | null {
  const candidate = body.candidates?.[0];
  if (!candidate) return null;
  const part = candidate.content?.parts?.[0];
  if (!part) return null;
  return part.text ?? null;
}

export class GeminiProvider implements LLMProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(request: LLMRequest): Promise<LLMResult> {
    const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`;
    const body = JSON.stringify(buildRequestBody(request));

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('abort') || message.includes('timeout') || message.includes('TimeoutError')) {
        return { success: false, error: { kind: 'timeout', message: `Request timed out after ${REQUEST_TIMEOUT_MS}ms` } };
      }
      return { success: false, error: { kind: 'api_error', message: `Network error: ${message}` } };
    }

    const rawBody = await response.text();

    if (!response.ok) {
      return { success: false, error: classifyHttpError(response.status, rawBody) };
    }

    let parsed: GeminiResponseBody;
    try {
      parsed = JSON.parse(rawBody) as GeminiResponseBody;
    } catch {
      return { success: false, error: { kind: 'parse_error', message: `Failed to parse response JSON: ${rawBody.slice(0, 500)}` } };
    }

    if (parsed.error) {
      const error: LLMError = {
        kind: 'api_error',
        message: parsed.error.message ?? 'Unknown Gemini API error',
        ...(parsed.error.code !== undefined ? { statusCode: parsed.error.code } : {}),
      };
      return { success: false, error };
    }

    const content = extractContent(parsed);
    if (content === null) {
      return { success: false, error: { kind: 'parse_error', message: 'No content in Gemini response candidates' } };
    }

    const usage = parsed.usageMetadata;

    return {
      success: true,
      response: {
        content,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
        model: GEMINI_MODEL,
        provider: 'gemini',
      },
    };
  }
}
