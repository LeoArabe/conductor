# Parallel Work Protocol

## Active Sessions

When multiple Claude Code instances work in parallel, each session registers here.
Before editing any file, check this section. If another session owns that file, DO NOT EDIT IT.

| Session | Working On | Owned Files | Status |
|---------|-----------|-------------|--------|
| (empty) | — | — | — |

## Rules

1. **Before starting work:** Add your session to the table above with the files you will touch.
2. **Before editing a file:** Check if another session owns it. If yes, STOP and ask the operator.
3. **Shared files (types.ts, index.ts):** Only ONE session can edit these at a time. Coordinate with operator.
4. **When done:** Remove your session from the table.
5. **Conflicts:** If you need a file owned by another session, tell the operator. Never edit it yourself.

## File Ownership by Module

These modules are independent and safe for parallel work:

- `src/core/llm/*` — LLM provider, parser, validators
- `src/agents/*` — Individual agent implementations
- `src/core/gatekeeper/*` — Gatekeeper module (future)
- `docs/agents/*` — Agent contract documents
- `tests/*` — Test files (match the module being tested)

These files are shared and require exclusive access:

- `src/core/types.ts` — Central type definitions
- `src/core/orchestrator.ts` — Pipeline backbone
- `src/core/runtime.ts` — Agent spawn logic
- `src/cli.ts` — CLI entry point
- `ROADMAP.md` — Single source of truth
- `CLAUDE.md` — This file
