// src/agents/mock-coordinator.ts
// Mock Coordinator — classifier only.
// Applies routing rules from docs/agents/coordinator.md using keyword matching.
// No LLM. Deterministic for explicit type, heuristic for body analysis.

import { logEvent } from '../core/logger';
import type { ClassificationResult, Task } from '../core/types';

// -----------------------------------------------------------------------------
// Technical keyword patterns
// -----------------------------------------------------------------------------

// File extensions, paths, code references
const TECHNICAL_PATTERNS: readonly RegExp[] = [
  /\.\w{1,4}$/m,                      // file extensions (.ts, .js, .md, etc.)
  /\b(src|dist|lib|node_modules)\//i,  // path segments
  /\b(refactor|refatore)\b/i,
  /\b(endpoint|route|api)\b/i,
  /\b(function|method|class|interface|module)\b/i,
  /\b(bug|fix|error|exception|stack\s*trace)\b/i,
  /\b(implement|create|add|remove|delete|rename|move)\s+(a\s+)?(function|file|endpoint|route|class|component|test)/i,
  /\b(migrate|migration)\b/i,
  /\b(import|export|require)\b/i,
  /\b(npm|yarn|pnpm)\s+(install|test|run|build)\b/i,
  /\b(git)\s+(commit|push|pull|merge|rebase|checkout)\b/i,
  /\b(docker|container)\b/i,
  /\b(TypeScript|JavaScript|Python|Rust|Go)\b/i,
];

// Business / strategic keywords
const BUSINESS_PATTERNS: readonly RegExp[] = [
  /\b(user|customer|client)\s+(need|want|experience|story|feedback)/i,
  /\b(feature|functionality)\s+(request|description|proposal)/i,
  /\b(priorit|roadmap|strategy|vision)\b/i,
  /\b(trade-?off|cost-?benefit|ROI)\b/i,
  /\b(stakeholder|requirement|acceptance\s+criteria)\b/i,
  /\b(product)\s+(decision|direction|behavior|specification)/i,
  /\b(should\s+we|do\s+we\s+need|what\s+if)\b/i,
  /\b(market|competitor|business\s+value)\b/i,
];

// -----------------------------------------------------------------------------
// Classification logic
// -----------------------------------------------------------------------------

function countMatches(body: string, patterns: readonly RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(body)) {
      count++;
    }
  }
  return count;
}

/**
 * Classifies a task using keyword matching against the routing rules
 * defined in docs/agents/coordinator.md.
 *
 * Step 1: If task.type is set, route deterministically (operator override).
 * Step 2: If absent, match body against technical and business patterns.
 * Critical rule: when uncertain, route to Product Agent.
 */
export function classify(task: Task, projectRoot: string): ClassificationResult {
  // Step 1: Explicit classification (operator-provided type)
  if (task.type !== undefined) {
    const result: ClassificationResult =
      task.type === 'technical'
        ? { category: 'technical_explicit', routedTo: 'dev', confidence: 'deterministic', ruleApplied: 'Rule 1 - Operator type: technical' }
        : { category: task.type === 'product' ? 'business' : 'ambiguous', routedTo: 'product', confidence: 'deterministic', ruleApplied: `Rule 1 - Operator type: ${task.type}` };

    logEvent({
      timestamp: new Date().toISOString(),
      taskId: task.taskId,
      eventType: 'classification',
      data: { ...result, source: 'operator_type' },
    }, projectRoot);

    return result;
  }

  // Step 2: Policy-based classification via keyword matching
  const technicalScore = countMatches(task.body, TECHNICAL_PATTERNS);
  const businessScore = countMatches(task.body, BUSINESS_PATTERNS);

  let result: ClassificationResult;

  if (technicalScore > 0 && technicalScore > businessScore) {
    result = {
      category: 'technical_explicit',
      routedTo: 'dev',
      confidence: 'heuristic',
      ruleApplied: 'Rule 2 - Technical Explicit',
    };
  } else if (businessScore > 0 && businessScore >= technicalScore) {
    result = {
      category: 'business',
      routedTo: 'product',
      confidence: 'heuristic',
      ruleApplied: 'Rule 2 - Business / Strategic',
    };
  } else {
    // No patterns matched — ambiguous. Route to Product per critical rule.
    result = {
      category: 'ambiguous',
      routedTo: 'product',
      confidence: 'heuristic',
      ruleApplied: 'Rule 2 - Ambiguous (default to Product)',
    };
  }

  logEvent({
    timestamp: new Date().toISOString(),
    taskId: task.taskId,
    eventType: 'classification',
    data: {
      ...result,
      source: 'keyword_matching',
      technicalScore,
      businessScore,
    },
  }, projectRoot);

  return result;
}
