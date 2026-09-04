import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * AI 味启发式自检（advisory，不改内容、不挡构建）。
 * 扫描 content/test-story.json 的玩家可见文案，报告常见 AI 腔模式。
 * 用法：npm run check:flavor              仅报告
 *       npm run check:flavor -- --strict  发现任何命中时以退出码 1 失败
 */

const contentPath = resolve(process.cwd(), 'content', 'test-story.json');
const source = await readFile(contentPath, 'utf8');
const pack = JSON.parse(source) as Record<string, unknown>;

interface TextItem {
  scope: string;
  location: string;
  isChoice: boolean;
  text: string;
}

/** 玩家可见、值得检查的文本字段。制作层字段（context、id 等）跳过。 */
const scopeKeys = new Set([
  'message',
  'reply',
  'text',
  'bio',
  'tag',
  'tags',
  'description',
  'title',
  'timeLabel',
  'handle',
  'name',
  'fanName',
  'continuations',
  'rankLabel',
  'alt',
]);

const items: TextItem[] = [];

function walk(node: unknown, path: string[], ctx: { id: string }): void {
  if (typeof node === 'string') {
    const key = path.length > 0 ? path[path.length - 1] : '';
    if (scopeKeys.has(key)) {
      items.push({
        scope: key,
        location: ctx.id || '(全局)',
        isChoice: path.includes('choices'),
        text: node,
      });
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, path, ctx);
    return;
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    // 节点/粉丝/结局等“容器”实体才切换定位上下文；
    // choice、pastChats 等叶子对象沿用父级（节点/粉丝）ID。
    const isContainer =
      typeof record.id === 'string' &&
      !('text' in record) &&
      !('message' in record) &&
      !('timeLabel' in record) &&
      !('cost' in record);
    const nextCtx =
      typeof record.contactId === 'string'
        ? { id: record.contactId }
        : isContainer
          ? { id: record.id as string }
          : ctx;
    for (const [k, v] of Object.entries(record)) walk(v, [...path, k], nextCtx);
  }
}

walk(pack, [], { id: '' });

interface Pattern {
  label: string;
  re: RegExp;
}

const patterns: Pattern[] = [
  { label: '「不是…而是/只是/为了」对比句', re: /不是[^。！？\n]{0,40}(而是|只是|为了)/g },
  { label: '「真正」', re: /真正/g },
  { label: '「永远」', re: /永远/g },
  { label: '「属于我们/你/她」意象复用', re: /属于(我们|你|她)/g },
  { label: '「作废」意象复用', re: /作废/g },
  { label: '「值得/情绪价值」', re: /值得|情绪价值/g },
  { label: '「这些年/这大半年/这三十天」总结腔', re: /这些年|这大半年|这三十天/g },
  { label: '「仿佛/宛如/犹如/不禁」', re: /仿佛|宛如|犹如|不禁/g },
  { label: '「微微/轻轻/缓缓/淡淡」弱化副词', re: /微微|轻轻|缓缓|淡淡/g },
  { label: '「然而/与此同时/不仅如此/值得一提」', re: /然而|与此同时|不仅如此|值得一提/g },
  { label: '破折号「——」', re: /——/g },
];

const fullStopOf = (t: string): number => t.match(/。/g)?.length ?? 0;

let totalHits = 0;
const globalCounts = new Map<string, number>();
const perNode = new Map<string, string[]>();
const completeSentenceChoices: TextItem[] = [];

for (const item of items) {
  for (const p of patterns) {
    const n = item.text.match(p.re)?.length ?? 0;
    if (n > 0) {
      globalCounts.set(p.label, (globalCounts.get(p.label) ?? 0) + n);
      totalHits += n;
      const line = `${p.label} ×${n}`;
      const list = perNode.get(item.location) ?? [];
      if (!list.includes(line)) list.push(line);
      perNode.set(item.location, list);
    }
  }
  // 连续完整句式复核：真人长回复很常见，感叹号和问号也承担情绪节拍；
  // 只把 60 字以上且至少使用 3 个句号的 choice 交给人工检查。
  if (item.isChoice && fullStopOf(item.text) >= 3 && item.text.length >= 60) {
    completeSentenceChoices.push(item);
  }
}

console.log('AI 味自检报告（启发式，仅供改写参考）\n');
console.log('全局计数：');
if (globalCounts.size === 0) console.log('  （无命中）');
for (const [label, n] of globalCounts) console.log(`  ${label}: ${n}`);

console.log('\n命中分布（按节点/粉丝，前 20）：');
const top = [...perNode.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 20);
for (const [loc, hits] of top) console.log(`  ${loc}: ${hits.join('、')}`);

if (completeSentenceChoices.length > 0) {
  console.log('\n连续完整句式复核（≥60 字且句号 ≥3，不代表一定有 AI 味）：');
  for (const e of completeSentenceChoices) {
    console.log(
      `  [${e.location}] ${e.text.slice(0, 42)}…（${e.text.length} 字 / ${fullStopOf(e.text)} 个句号）`,
    );
  }
}

console.log('\n备注：对比句并非全错——说话人真会那么说的（如饭头说「不是因为我是饭头」）应保留。');
console.log(
  `共 ${totalHits} 处命中${completeSentenceChoices.length > 0 ? `、${completeSentenceChoices.length} 条连续完整句式待复核` : ''}。`,
);

if (process.argv.includes('--strict') && (totalHits > 0 || completeSentenceChoices.length > 0)) {
  process.exit(1);
}
