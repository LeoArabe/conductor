# CLAUDE.md

## Project: Conductor

Conductor is an orchestrator for disposable AI agents with structural isolation, explicit hierarchy, and full auditability. Agents are ephemeral, stateless, and operate under strict scope contracts.

## Before You Do Anything

1. Read `ROADMAP.md` to understand the current milestone and find the next uncompleted issue.
2. Read the relevant docs in `docs/` before writing any code — they are the system's constitution.
3. Never implement something that violates `docs/principles.md` or `docs/security.md`.

## Current State

- **Phase:** Foundation (Milestone 0)
- **Code status:** TypeScript project initialized. Core types, manifests, and runtime spawn logic exist in `src/core/`. No working end-to-end flow yet.
- **Documentation:** Complete. Vision, principles, security, architecture, and all 4 agent contracts (coordinator, product, dev, qa) are defined in `docs/`.

## Project Structure

```
conductor/
├── docs/                    # System constitution (READ FIRST)
│   ├── vision.md
│   ├── principles.md
│   ├── security.md
│   ├── architecture.md
│   ├── agents/
│   │   ├── coordinator.md   # Policy engine contract
│   │   ├── product.md       # Disambiguator contract
│   │   ├── dev.md           # Executor contract
│   │   └── qa.md            # Auditor contract
│   └── memory/
│       └── doctrine.md      # Operational doctrine
├── src/                     # Implementation
│   └── core/
│       ├── types.ts         # All shared interfaces
│       ├── manifests.ts     # Agent manifests + tool capability map
│       └── runtime.ts       # Agent spawn logic
├── logs/                    # Audit trail output (gitignored)
├── workspace/               # Agent sandbox (gitignored)
├── ROADMAP.md               # Milestones and issues (CHECK THIS)
└── CLAUDE.md                # You are here
```

## Rules for Development

1. **Check ROADMAP.md first.** Find the current milestone. Find the next issue marked `[ ]`. Implement that. Nothing else.
2. **One issue at a time.** Do not jump ahead. Do not combine issues.
3. **Tests exist before features.** If an issue says "implement X", write a test for X first.
4. **No external dependencies unless justified.** The project uses zero runtime dependencies by design. TypeScript and Node.js built-ins only. If you need a dependency, explain why.
5. **Fail explicitly.** Use discriminated unions (`{ success: true } | { success: false, error }`) instead of throwing exceptions. This aligns with `docs/principles.md` §7.
6. **Log everything.** Every function that does I/O or makes a decision should produce an audit-compatible log entry.
7. **Never hardcode paths.** Use `projectRoot` parameter or config. No `process.cwd()` assumptions.
8. **After completing an issue**, update ROADMAP.md to mark it `[x]` and add any notes.

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict mode)
- **Dependencies:** Zero runtime deps. Only devDependencies (typescript, @types/node).
- **LLM:** Not integrated yet. Will use Anthropic API when Milestone 1 begins.
- **Isolation:** Not implemented yet. Will use Docker when Milestone 2+ begins.
- **Storage:** Filesystem only. SQLite for audit logs in later milestones.

## Key Design Decisions

- Agents are **untrusted by default**. Security comes from capability removal, not prompt instructions.
- Context is **injected, never discovered**. Agents receive exactly what the Coordinator selects. Nothing more.
- Errors are **structural or semantic**. Structural = retry. Semantic = kill + escalate. No exceptions.
- All inter-agent communication passes through the Orchestrator. No lateral connections. Ever.

## Commands

```bash
npm run build        # Compile TypeScript
npm run typecheck    # Type-check without emitting
npm test             # Run tests (when they exist)
npm start            # Run CLI (when implemented)
```