import { z } from 'zod';
import {
  collectTemplateVariableReferences,
  isValidTemplateVariableName,
  RESERVED_TEMPLATE_VARIABLES,
} from './templates';
import type { StoryPack, ValidationIssue } from './types';

const resourcesSchema = z.object({
  energy: z.number().int().min(0),
  mindset: z.number().int().min(0),
});

const resourceDeltaSchema = z.object({
  energy: z.number().int().optional(),
  mindset: z.number().int().optional(),
});

const profileNameSchema = z
  .string()
  .refine((value) => value.trim().length > 0, '姓名去除首尾空格后不能为空')
  .refine((value) => value.trim().length <= 16, '姓名最多 16 个字符');

const fanTagsSchema = z
  .array(
    z
      .string()
      .refine((value) => value.trim().length > 0, '粉丝标签去除首尾空格后不能为空')
      .refine((value) => value.trim().length <= 12, '粉丝标签最多 12 个字符'),
  )
  .min(1, '每名核心粉丝至少需要一个标签')
  .max(4, '每名核心粉丝最多使用四个标签')
  .refine(
    (tags) => new Set(tags.map((tag) => tag.trim())).size === tags.length,
    '同一名核心粉丝不能使用重复标签',
  );

const coreFanPastChatSchema = z.object({
  id: z.string().min(1),
  timeLabel: z.string().min(1).max(24),
  message: z.string().min(1),
  reply: z.string().min(1),
});

const storyTriggerConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('flag-set'), flag: z.string().min(1) }),
  z.object({ type: z.literal('flag-unset'), flag: z.string().min(1) }),
  z.object({ type: z.literal('expired-flips-at-least'), count: z.number().int().min(1) }),
  z.object({ type: z.literal('takeout-orders-at-least'), count: z.number().int().min(1) }),
  z.object({
    type: z.literal('consecutive-replies-delayed-at-least'),
    fanId: z.string().min(1),
    count: z.number().int().min(1),
    turns: z.number().int().min(1),
  }),
  z.object({
    type: z.literal('first-nodes-replied-on-time'),
    fanId: z.string().min(1),
    count: z.number().int().min(1),
    maxDelayTurns: z.number().int().min(0).optional(),
  }),
]);

const storyTriggerSchema = z
  .object({
    match: z.enum(['all', 'any']),
    conditions: z.array(storyTriggerConditionSchema).min(1),
  })
  .optional();

const effectsSchema = z.object({
  affinity: z.record(z.string(), z.number().int()).optional(),
  popularity: z.number().int().optional(),
  resources: resourceDeltaSchema.optional(),
  setFlags: z.array(z.string().min(1)).optional(),
  unsetFlags: z.array(z.string().min(1)).optional(),
  voteBonus: z.record(z.string(), z.number().int()).optional(),
});

const storyNodeSchema = z.object({
  id: z.string().min(1),
  fanId: z.string().min(1),
  title: z.string().min(1),
  postedDay: z.number().int().min(1),
  replyWindowDays: z.number().int().min(1),
  trigger: storyTriggerSchema,
  content: z.object({
    text: z.string().min(1),
    context: z.string().optional(),
    public: z.boolean().optional(),
  }),
  choices: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        cost: resourcesSchema.refine((value) => value.energy >= 1 && value.mindset >= 1, {
          message: '每个回复必须至少消耗 1 点精力和 1 点心情',
        }),
        effects: effectsSchema.extend({ popularity: z.number().int() }),
        nextNodeId: z.string().min(1).optional(),
        nextNodeTiming: z.enum(['day-start', 'immediate']).optional(),
        endingId: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(4),
  onExpire: effectsSchema
    .extend({
      nextNodeId: z.string().min(1).optional(),
    })
    .optional(),
  editor: z
    .object({
      y: z.number(),
    })
    .optional(),
});

const backgroundFlipSchema = z
  .object({
    id: z.string().min(1),
    contactId: z.string().min(1).optional(),
    day: z.number().int().min(1),
    fanName: z.string().min(1),
    avatar: z.string().min(1).optional(),
    tag: z.string().min(1),
    message: z.string().min(1),
    reply: z.string().min(1).optional(),
    continuations: z.array(z.string().min(1)).min(1).max(4).optional(),
  })
  .superRefine((flip, context) => {
    if (flip.reply && flip.continuations?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '普通翻牌不能同时使用成员自动回复 reply 和 NPC 连续消息 continuations',
        path: ['reply'],
      });
    }
  });

export const storyPackSchema: z.ZodType<StoryPack> = z.object({
  schemaVersion: z.literal(14),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  contentVersion: z.string().min(1),
  profileSetup: z.object({
    namePools: z.object({
      adapted: z.array(profileNameSchema),
      original: z.array(profileNameSchema),
    }),
    teams: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        shortName: z.string().min(1),
        mark: z.string().min(1).max(3),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '队伍主题色必须是六位十六进制颜色'),
      }),
    ),
  }),
  globalVariables: z.record(z.string(), z.string()),
  config: z.object({
    totalDays: z.number().int().min(1),
    turnDays: z.number().int().min(1),
    maxTurns: z.number().int().min(1),
    resources: z.object({
      max: resourcesSchema,
      initial: resourcesSchema,
      recoveryPerTurn: resourcesSchema,
    }),
    takeout: z.object({
      recovery: resourcesSchema,
      maxPerTurn: z.number().int().min(1),
      triggerCount: z.number().int().min(1),
      endingId: z.string().min(1),
    }),
    popularity: z.object({
      initial: z.number().int(),
      min: z.number().int(),
      max: z.number().int(),
      voteTiers: z
        .array(
          z.object({
            minPopularity: z.number().int(),
            votes: z.number().int().min(0),
            label: z.string().min(1),
          }),
        )
        .min(1),
    }),
  }),
  fans: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        handle: z.string().min(1),
        bio: z.string(),
        tags: fanTagsSchema,
        pastChats: z.array(coreFanPastChatSchema).max(8),
        avatar: z.string().min(1),
        accent: z.string().min(1),
        initialAffinity: z.number().int().min(0).max(100),
        maxVotePower: z.number().int().min(0),
        voteTiers: z
          .array(
            z.object({
              minAffinity: z.number().int().min(0).max(100),
              votes: z.number().int().min(0),
              label: z.string().min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  nodes: z.array(storyNodeSchema),
  turnEvents: z.array(
    z.object({
      id: z.string().min(1),
      turn: z.number().int().min(1),
      title: z.string().min(1),
      description: z.string(),
      recoveryDelta: resourceDeltaSchema.optional(),
      popularityDelta: z.number().int().optional(),
    }),
  ),
  backgroundFlips: z.array(backgroundFlipSchema),
  electionEndings: z
    .array(
      z.object({
        id: z.string().min(1),
        minVotes: z.number().int().min(0),
        rankLabel: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
  earlyEndings: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      image: z
        .object({
          src: z.string().min(1),
          alt: z.string().min(1),
        })
        .optional(),
      trigger: z.object({
        takeoutCountAtLeast: z.number().int().min(1).optional(),
        allFlags: z.array(z.string().min(1)).optional(),
      }),
    }),
  ),
  achievements: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      condition: z.object({
        takeoutCountAtMost: z.number().int().min(0).optional(),
        takeoutCountAtLeast: z.number().int().min(0).optional(),
        popularityAtLeast: z.number().int().optional(),
        allFansAffinityAtLeast: z.number().int().min(0).max(100).optional(),
        allFlags: z.array(z.string().min(1)).optional(),
      }),
    }),
  ),
});

function duplicateIssues(values: string[], label: string, path: string): ValidationIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].map((value) => ({
    severity: 'error',
    code: 'duplicate-id',
    message: `${label} ID 重复：${value}`,
    path,
  }));
}

export function parseStoryPack(value: unknown): StoryPack {
  return storyPackSchema.parse(value);
}

export function validateStoryPack(value: unknown): ValidationIssue[] {
  const parsed = storyPackSchema.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      severity: 'error' as const,
      code: 'schema',
      message: issue.message,
      path: issue.path.join('.'),
    }));
  }

  const pack = parsed.data;
  const issues: ValidationIssue[] = [
    ...duplicateIssues(
      pack.fans.map((fan) => fan.id),
      '粉丝',
      'fans',
    ),
    ...duplicateIssues(
      pack.nodes.map((node) => node.id),
      '节点',
      'nodes',
    ),
    ...duplicateIssues(
      pack.backgroundFlips.map((flip) => flip.id),
      '普通翻牌',
      'backgroundFlips',
    ),
    ...duplicateIssues(
      pack.profileSetup.teams.map((team) => team.id),
      '队伍',
      'profileSetup.teams',
    ),
  ];

  if (pack.profileSetup.namePools.adapted.length < 3) {
    issues.push({
      severity: 'error',
      code: 'insufficient-adapted-name-pool',
      message: '改编姓名库至少需要 3 个姓名，以支持前三次改编姓名建议',
      path: 'profileSetup.namePools.adapted',
    });
  }

  const normalizedProfileNames = new Map<string, string>();
  const profileNamePoolEntries = [
    ['adapted', pack.profileSetup.namePools.adapted],
    ['original', pack.profileSetup.namePools.original],
  ] as const;
  for (const [kind, names] of profileNamePoolEntries) {
    names.forEach((name, index) => {
      const normalized = name.trim();
      const path = `profileSetup.namePools.${kind}.${index}`;
      const previousPath = normalizedProfileNames.get(normalized);
      if (previousPath) {
        issues.push({
          severity: 'error',
          code: 'duplicate-profile-name',
          message: `姓名库中存在重复姓名：${normalized}`,
          path: `${previousPath}, ${path}`,
        });
        return;
      }
      normalizedProfileNames.set(normalized, path);
    });
  }

  if (pack.profileSetup.teams.length === 0) {
    issues.push({
      severity: 'error',
      code: 'empty-team-list',
      message: '初始队伍列表不能为空',
      path: 'profileSetup.teams',
    });
  }

  const reservedTemplateVariables = new Set<string>(RESERVED_TEMPLATE_VARIABLES);
  const knownTemplateVariables = new Set<string>(RESERVED_TEMPLATE_VARIABLES);
  for (const name of Object.keys(pack.globalVariables)) {
    if (!isValidTemplateVariableName(name)) {
      issues.push({
        severity: 'error',
        code: 'invalid-template-variable',
        message: `模板变量名不合法：${name}`,
        path: `globalVariables.${name}`,
      });
      continue;
    }
    if (reservedTemplateVariables.has(name)) {
      issues.push({
        severity: 'error',
        code: 'reserved-template-variable',
        message: `自定义变量不能覆盖保留变量：${name}`,
        path: `globalVariables.${name}`,
      });
      continue;
    }
    knownTemplateVariables.add(name);
  }

  for (const reference of collectTemplateVariableReferences(pack)) {
    if (!isValidTemplateVariableName(reference.name)) {
      issues.push({
        severity: 'error',
        code: 'invalid-template-reference',
        message: `模板占位符不合法：{{${reference.name}}}`,
        path: reference.path,
        ...(reference.nodeId ? { nodeId: reference.nodeId } : {}),
      });
      continue;
    }
    if (!knownTemplateVariables.has(reference.name)) {
      issues.push({
        severity: 'error',
        code: 'unknown-template-variable',
        message: `模板占位符引用了未知变量：{{${reference.name}}}`,
        path: reference.path,
        ...(reference.nodeId ? { nodeId: reference.nodeId } : {}),
      });
    }
  }

  const fanIds = new Set(pack.fans.map((fan) => fan.id));
  const nodeMap = new Map(pack.nodes.map((node) => [node.id, node]));
  const endingIds = new Set(pack.earlyEndings.map((ending) => ending.id));
  const edges = new Map<string, string[]>();
  const incoming = new Set<string>();

  if (!endingIds.has(pack.config.takeout.endingId)) {
    issues.push({
      severity: 'error',
      code: 'missing-takeout-ending',
      message: `外卖结局不存在：${pack.config.takeout.endingId}`,
      path: 'config.takeout.endingId',
    });
  }

  for (const fan of pack.fans) {
    issues.push(
      ...duplicateIssues(
        fan.pastChats.map((chat) => chat.id),
        `${fan.name} 的过往聊天`,
        `fans.${fan.id}.pastChats`,
      ),
    );
    const maxConfiguredVotes = Math.max(...fan.voteTiers.map((tier) => tier.votes));
    if (maxConfiguredVotes > fan.maxVotePower) {
      issues.push({
        severity: 'error',
        code: 'vote-over-cap',
        message: `${fan.name} 的票力档位超过上限 ${fan.maxVotePower}`,
        path: `fans.${fan.id}.voteTiers`,
      });
    }
  }

  for (const node of pack.nodes) {
    if (!fanIds.has(node.fanId)) {
      issues.push({
        severity: 'error',
        code: 'missing-fan',
        message: `节点引用了不存在的粉丝：${node.fanId}`,
        nodeId: node.id,
      });
    }
    if (node.postedDay > pack.config.totalDays) {
      issues.push({
        severity: 'error',
        code: 'day-out-of-range',
        message: `发布日期超出周目范围：第 ${node.postedDay} 日`,
        nodeId: node.id,
      });
    }
    for (const condition of node.trigger?.conditions ?? []) {
      if (
        (condition.type === 'consecutive-replies-delayed-at-least' ||
          condition.type === 'first-nodes-replied-on-time') &&
        !fanIds.has(condition.fanId)
      ) {
        issues.push({
          severity: 'error',
          code: 'missing-trigger-fan',
          message: `触发条件引用了不存在的粉丝：${condition.fanId}`,
          nodeId: node.id,
        });
      }
    }
    const choiceIds = node.choices.map((choice) => choice.id);
    issues.push(
      ...duplicateIssues(choiceIds, `节点 ${node.id} 的选项`, `nodes.${node.id}.choices`),
    );

    const targets = [
      ...node.choices.map((choice) => choice.nextNodeId).filter((id): id is string => Boolean(id)),
      ...(node.onExpire?.nextNodeId ? [node.onExpire.nextNodeId] : []),
    ];
    edges.set(node.id, targets);
    for (const target of targets) {
      incoming.add(target);
      if (!nodeMap.has(target)) {
        issues.push({
          severity: 'error',
          code: 'missing-node',
          message: `后续节点不存在：${target}`,
          nodeId: node.id,
        });
      }
    }

    const effectFanIds = new Set<string>();
    for (const choice of node.choices) {
      if (choice.effects.affinity?.[node.fanId] === undefined) {
        issues.push({
          severity: 'error',
          code: 'choice-missing-own-affinity',
          message: `回复选项缺少当前粉丝 ${node.fanId} 的好感度结算数值`,
          path: `nodes.${node.id}.choices.${choice.id}.effects.affinity.${node.fanId}`,
          nodeId: node.id,
        });
      }
      if (choice.endingId && !endingIds.has(choice.endingId)) {
        issues.push({
          severity: 'error',
          code: 'missing-choice-ending',
          message: `回复选项引用了不存在的特殊结局：${choice.endingId}`,
          path: `nodes.${node.id}.choices.${choice.id}.endingId`,
          nodeId: node.id,
        });
      }
      if (choice.endingId && choice.nextNodeId) {
        issues.push({
          severity: 'error',
          code: 'choice-ending-with-next-node',
          message: '触发特殊结局的回复不能同时连接后续节点',
          path: `nodes.${node.id}.choices.${choice.id}`,
          nodeId: node.id,
        });
      }
      if (choice.nextNodeTiming && !choice.nextNodeId) {
        issues.push({
          severity: 'error',
          code: 'choice-timing-without-next-node',
          message: '配置后续节点出现时机前，必须先连接一个后续节点',
          path: `nodes.${node.id}.choices.${choice.id}.nextNodeTiming`,
          nodeId: node.id,
        });
      }
      Object.keys(choice.effects.affinity ?? {}).forEach((id) => effectFanIds.add(id));
      Object.keys(choice.effects.voteBonus ?? {}).forEach((id) => effectFanIds.add(id));
    }
    Object.keys(node.onExpire?.affinity ?? {}).forEach((id) => effectFanIds.add(id));
    for (const effectFanId of effectFanIds) {
      if (!fanIds.has(effectFanId)) {
        issues.push({
          severity: 'error',
          code: 'missing-effect-fan',
          message: `效果引用了不存在的粉丝：${effectFanId}`,
          nodeId: node.id,
        });
      }
    }
  }

  for (const flip of pack.backgroundFlips) {
    if (flip.day > pack.config.totalDays) {
      issues.push({
        severity: 'error',
        code: 'background-day-out-of-range',
        message: `普通翻牌发布日期超出周目范围：第 ${flip.day} 日`,
        path: `backgroundFlips.${flip.id}.day`,
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      cycleNodes.add(id);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of edges.get(id) ?? []) {
      if (nodeMap.has(target)) visit(target);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of pack.nodes) visit(node.id);
  for (const nodeId of cycleNodes) {
    issues.push({
      severity: 'error',
      code: 'cycle',
      message: '剧情图中存在循环连接',
      nodeId,
    });
  }

  const roots = pack.nodes.filter((node) => !incoming.has(node.id));
  if (roots.length === 0 && pack.nodes.length > 0) {
    issues.push({
      severity: 'error',
      code: 'no-root',
      message: '剧情图没有可启动的根节点',
      path: 'nodes',
    });
  }

  const reachable = new Set<string>();
  const markReachable = (id: string): void => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const target of edges.get(id) ?? []) markReachable(target);
  };
  roots.forEach((root) => markReachable(root.id));
  for (const node of pack.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        severity: 'warning',
        code: 'unreachable',
        message: '节点无法从任何根节点到达',
        nodeId: node.id,
      });
    }
  }

  // 节奏警告只统计无触发条件的基线节点；条件节点按支线/旗帜出现，不拉长单周目基线。
  const decisions = pack.nodes.filter((node) => !node.trigger).length;
  if (decisions > 28) {
    issues.push({
      severity: 'warning',
      code: 'pacing-heavy',
      message: `当前共有 ${decisions} 个翻牌节点，可能超过 20 分钟单周目目标`,
      path: 'nodes',
    });
  }

  return issues;
}

export function hasValidationErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
