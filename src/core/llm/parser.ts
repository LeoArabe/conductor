// src/core/llm/parser.ts
// Robust JSON parser for LLM responses.
// Handles raw JSON, markdown code fences, and embedded JSON blocks.
// Never throws. Returns structured ParseResult.

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type ParseErrorKind = 'invalid_json' | 'schema_mismatch';

export interface ParseError {
  readonly raw: string;
  readonly message: string;
  readonly kind: ParseErrorKind;
}

export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ParseError };

// -----------------------------------------------------------------------------
// JSON extraction strategies
// -----------------------------------------------------------------------------

/**
 * Strategy 1: Direct JSON.parse.
 */
function tryDirectParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Strategy 2: Extract from markdown code fences.
 * Matches ```json ... ``` or ``` ... ```
 */
function tryCodeFenceParse(raw: string): unknown | null {
  const match = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(raw);
  if (!match?.[1]) return null;
  return tryDirectParse(match[1].trim());
}

/**
 * Strategy 3: Extract first { ... } or [ ... ] block via bracket matching.
 */
function tryBracketExtract(raw: string): unknown | null {
  const startObj = raw.indexOf('{');
  const startArr = raw.indexOf('[');

  let start: number;
  let open: string;
  let close: string;

  if (startObj === -1 && startArr === -1) return null;

  if (startArr === -1 || (startObj !== -1 && startObj < startArr)) {
    start = startObj;
    open = '{';
    close = '}';
  } else {
    start = startArr;
    open = '[';
    close = ']';
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === open) depth++;
    if (ch === close) depth--;

    if (depth === 0) {
      return tryDirectParse(raw.slice(start, i + 1));
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Parses a raw LLM response string into a validated typed object.
 *
 * Strategy order:
 * 1. Direct JSON.parse
 * 2. Extract from markdown code fences (```json ... ```)
 * 3. Extract first balanced { } or [ ] block
 * 4. If all fail: ParseError with kind 'invalid_json'
 * 5. If JSON parses but validate() fails: ParseError with kind 'schema_mismatch'
 */
export function parseJSON<T>(
  raw: string,
  validate: (obj: unknown) => obj is T,
): ParseResult<T> {
  const trimmed = raw.trim();

  const parsed =
    tryDirectParse(trimmed) ??
    tryCodeFenceParse(trimmed) ??
    tryBracketExtract(trimmed);

  if (parsed === null) {
    return {
      success: false,
      error: {
        raw,
        message: 'Failed to extract valid JSON from LLM response.',
        kind: 'invalid_json',
      },
    };
  }

  if (!validate(parsed)) {
    return {
      success: false,
      error: {
        raw,
        message: 'JSON parsed successfully but does not match expected schema.',
        kind: 'schema_mismatch',
      },
    };
  }

  return { success: true, data: parsed };
}
