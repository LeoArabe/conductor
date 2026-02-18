// test-loader.ts
// Quick validation: loads and prints system prompts to verify disk reads + constraints assembly.

import type { AgentRole } from './src/core/types';
import { loadSystemPrompt } from './src/core/llm';

const roles: AgentRole[] = ['coordinator', 'product', 'dev', 'qa'];

for (const role of roles) {
  const prompt = loadSystemPrompt(role);
  const lineCount = prompt.split('\n').length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${role.toUpperCase()} — ${prompt.length} chars, ${lineCount} lines`);
  console.log('='.repeat(60));

  if (role === 'coordinator') {
    // Print full prompt for coordinator as the user requested
    console.log(prompt);
  } else {
    // Print only the constraints block for other roles (last section after ---)
    const lastSeparator = prompt.lastIndexOf('\n---\n');
    if (lastSeparator !== -1) {
      console.log('  [MD content omitted — showing RUNTIME CONSTRAINTS only]\n');
      console.log(prompt.slice(lastSeparator));
    } else {
      console.log(prompt);
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log('  All 4 roles loaded successfully.');
console.log('='.repeat(60));
