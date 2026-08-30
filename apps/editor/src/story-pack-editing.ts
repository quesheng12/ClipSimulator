import type { ExpireOutcome, StoryEffects, StoryPack } from '@clip/story-core/types';

function renameRecordKey(
  record: Record<string, number> | undefined,
  previousId: string,
  nextId: string,
): Record<string, number> | undefined {
  if (!record || !Object.hasOwn(record, previousId)) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === previousId ? nextId : key, value]),
  );
}

function renameEffectFanId<T extends StoryEffects | ExpireOutcome>(
  effects: T,
  previousId: string,
  nextId: string,
): T {
  return {
    ...effects,
    affinity: renameRecordKey(effects.affinity, previousId, nextId),
    voteBonus: renameRecordKey(effects.voteBonus, previousId, nextId),
  };
}

export function renameFanReferences(
  pack: StoryPack,
  previousId: string,
  nextId: string,
): StoryPack {
  return {
    ...pack,
    fans: pack.fans.map((fan) => (fan.id === previousId ? { ...fan, id: nextId } : fan)),
    nodes: pack.nodes.map((node) => ({
      ...node,
      fanId: node.fanId === previousId ? nextId : node.fanId,
      trigger: node.trigger
        ? {
            ...node.trigger,
            conditions: node.trigger.conditions.map((condition) =>
              (condition.type === 'consecutive-replies-delayed-at-least' ||
                condition.type === 'first-nodes-replied-on-time') &&
              condition.fanId === previousId
                ? { ...condition, fanId: nextId }
                : condition,
            ),
          }
        : undefined,
      choices: node.choices.map((choice) => ({
        ...choice,
        effects: renameEffectFanId(choice.effects, previousId, nextId),
      })),
      onExpire: node.onExpire ? renameEffectFanId(node.onExpire, previousId, nextId) : undefined,
    })),
  };
}
