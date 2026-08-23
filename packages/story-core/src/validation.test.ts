import { describe, expect, it } from 'vitest';
import testStoryJson from '../../../content/test-story.json';
import type { StoryPack } from './types';
import { hasValidationErrors, validateStoryPack } from './validation';

const pack = testStoryJson as unknown as StoryPack;
const currentSnhRoster = [
  // Team SII
  '曹可甜',
  '蒋夏羽',
  '刘婧阳',
  '刘诗彤',
  '李婷',
  '芦馨怡',
  '柳雨呈',
  '刘增艳',
  '宁轲',
  '盛乐',
  '田姝丽',
  '由淼',
  '闫明筠',
  '杨心渝',
  '张雷雷',
  '张倩',
  '周童玥',
  // Team NII
  '柏欣妤',
  '胡晓慧',
  '黄紫怡',
  '金莹玥',
  '李继醇',
  '雷宇霄',
  '潘瑛琪',
  '青钰雯',
  '沈馨',
  '唐程成',
  '徐佳琳',
  '叶凡',
  '杨宇馨',
  '周湘',
  '钟亚男',
  '朱怡欣',
  '郑照暄',
  // Team HII
  '陈嘉仪',
  '陈俞希',
  '龚晨美',
  '郭晓盈',
  '蒋舒婷',
  '康楚翊',
  '李佳恩',
  '林舒晴',
  '刘思雨',
  '阙佳慧',
  '覃柯蒙',
  '谭思慧',
  '温若其',
  '应籽言',
  '郑柯炜',
  // Team X
  '陈琳',
  '金泓言',
  '蒋欣洳',
  '林佳怡',
  '刘小涵',
  '李子忻',
  '马欣宇',
  '宋昕冉',
  '武博涵',
  '王睿琦',
  '熊紫轶',
  '杨冰怡',
  '禹佳蔚',
  '闫娜',
  '杨秋野',
  '杨晔',
  '钟郭菲杨',
  '朱虹蓉',
  '张琼予',
  '朱瑞缘',
  '曾昕妍',
];

describe('story validation', () => {
  it('accepts the canonical test story', () => {
    const issues = validateStoryPack(pack);
    expect(issues).toEqual([]);
    expect(hasValidationErrors(issues)).toBe(false);
    expect(pack.profileSetup.namePools.adapted).toHaveLength(70);
    expect(pack.profileSetup.namePools.original).toHaveLength(0);
  });

  it('keeps every four-team roster adaptation recognizable but fictionalized', () => {
    const adapted = pack.profileSetup.namePools.adapted;
    const realNames = new Set(currentSnhRoster);

    expect(currentSnhRoster).toHaveLength(70);
    expect(new Set(adapted).size).toBe(70);
    expect(adapted.every((name) => !realNames.has(name))).toBe(true);
    currentSnhRoster.forEach((realName, index) => {
      const fictionalName = adapted[index]!;
      expect(fictionalName[0]).toBe(realName[0]);
      expect(fictionalName.slice(1)).not.toBe(realName.slice(1));
    });
  });

  it('accepts an optional stable contact id for ordinary fan conversations', () => {
    const withContactId = structuredClone(pack);
    withContactId.backgroundFlips[0]!.contactId = 'milk-tea-fan';

    expect(validateStoryPack(withContactId)).toEqual([]);
  });

  it('reports missing targets and graph cycles', () => {
    const broken = structuredClone(pack);
    broken.nodes[0]!.choices[0]!.nextNodeId = 'not-a-node';
    broken.nodes[1]!.choices[0]!.nextNodeId = broken.nodes[0]!.id;
    broken.nodes[0]!.choices[1]!.nextNodeId = broken.nodes[1]!.id;

    const issues = validateStoryPack(broken);
    expect(issues.some((issue) => issue.code === 'missing-node')).toBe(true);
    expect(issues.some((issue) => issue.code === 'cycle')).toBe(true);
  });

  it('requires profile setup choices and unique team ids', () => {
    const empty = structuredClone(pack);
    empty.profileSetup.namePools.adapted = [];
    empty.profileSetup.namePools.original = [];
    empty.profileSetup.teams = [];

    const emptyIssues = validateStoryPack(empty);
    expect(emptyIssues.some((issue) => issue.code === 'insufficient-adapted-name-pool')).toBe(true);
    expect(emptyIssues.some((issue) => issue.code === 'empty-team-list')).toBe(true);

    const duplicate = structuredClone(pack);
    duplicate.profileSetup.teams[1]!.id = duplicate.profileSetup.teams[0]!.id;
    expect(
      validateStoryPack(duplicate).some(
        (issue) => issue.code === 'duplicate-id' && issue.path === 'profileSetup.teams',
      ),
    ).toBe(true);
  });

  it('rejects invalid team visuals and node trigger values', () => {
    const invalidTeam = structuredClone(pack);
    invalidTeam.profileSetup.teams[0]!.color = 'blue';
    expect(
      validateStoryPack(invalidTeam).some(
        (issue) => issue.code === 'schema' && issue.path === 'profileSetup.teams.0.color',
      ),
    ).toBe(true);

    const invalidTrigger = structuredClone(pack);
    invalidTrigger.nodes[0]!.trigger = {
      match: 'all',
      conditions: [{ type: 'expired-flips-at-least', count: 0 }],
    };
    expect(
      validateStoryPack(invalidTrigger).some(
        (issue) =>
          issue.code === 'schema' && issue.path?.endsWith('trigger.conditions.0.count') === true,
      ),
    ).toBe(true);

    const missingTriggerFan = structuredClone(pack);
    missingTriggerFan.nodes[0]!.trigger = {
      match: 'all',
      conditions: [
        {
          type: 'consecutive-replies-delayed-at-least',
          fanId: 'missing-fan',
          count: 2,
          turns: 2,
        },
      ],
    };
    expect(
      validateStoryPack(missingTriggerFan).some(
        (issue) => issue.code === 'missing-trigger-fan' && issue.nodeId === 'yuzu-01',
      ),
    ).toBe(true);
  });

  it('requires schema v4 and rejects duplicate or invalid profile names', () => {
    const wrongVersion = structuredClone(pack) as StoryPack & { schemaVersion: number };
    wrongVersion.schemaVersion = 2;
    expect(
      validateStoryPack(wrongVersion).some(
        (issue) => issue.code === 'schema' && issue.path === 'schemaVersion',
      ),
    ).toBe(true);

    const duplicate = structuredClone(pack);
    duplicate.profileSetup.namePools.original = [duplicate.profileSetup.namePools.adapted[0]!];
    expect(
      validateStoryPack(duplicate).some((issue) => issue.code === 'duplicate-profile-name'),
    ).toBe(true);

    const invalid = structuredClone(pack);
    invalid.profileSetup.namePools.original = [
      '   ',
      '这是一个明显超过十六个字符限制的虚构成员姓名',
    ];
    const invalidIssues = validateStoryPack(invalid);
    expect(invalidIssues.filter((issue) => issue.code === 'schema')).toHaveLength(2);
  });

  it('rejects invalid custom variables, reserved overrides, and unknown placeholders', () => {
    const broken = structuredClone(pack);
    broken.globalVariables['bad-key'] = '非法键';
    broken.globalVariables.idolName = '不能覆盖';
    broken.nodes[0]!.content.context = '{{missingVariable}} / {{bad-key}}';

    const issues = validateStoryPack(broken);
    expect(issues.some((issue) => issue.code === 'invalid-template-variable')).toBe(true);
    expect(issues.some((issue) => issue.code === 'reserved-template-variable')).toBe(true);
    expect(issues.some((issue) => issue.code === 'unknown-template-variable')).toBe(true);
    expect(issues.some((issue) => issue.code === 'invalid-template-reference')).toBe(true);
  });
});
