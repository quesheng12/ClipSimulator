import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hasValidationErrors, validateStoryPack } from '@clip/story-core/validation';

const contentPath = resolve(process.cwd(), 'content', 'test-story.json');
const source = await readFile(contentPath, 'utf8');
const issues = validateStoryPack(JSON.parse(source));

if (issues.length === 0) {
  console.log('Content validation passed with no findings.');
  process.exit(0);
}

for (const issue of issues) {
  const location = issue.nodeId ?? issue.path ?? 'content';
  console.log(`${issue.severity.toUpperCase()} ${issue.code} [${location}] ${issue.message}`);
}

if (hasValidationErrors(issues)) process.exit(1);
