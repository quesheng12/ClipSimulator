import { describe, expect, it } from 'vitest';
import { defaultStoryPack } from './content';
import { renameFanReferences } from './story-pack-editing';

describe('renameFanReferences', () => {
  it('renames every fan reference while preserving stable node and chat IDs', () => {
    const source = structuredClone(defaultStoryPack);
    const firstNode = source.nodes.find((node) => node.fanId === 'yuzu');
    if (!firstNode) throw new Error('Expected a yuzu story node');

    firstNode.trigger = {
      match: 'all',
      conditions: [
        {
          type: 'consecutive-replies-delayed-at-least',
          fanId: 'yuzu',
          count: 2,
          turns: 2,
        },
        {
          type: 'first-nodes-replied-on-time',
          fanId: 'yuzu',
          count: 3,
        },
      ],
    };
    const firstChoice = firstNode.choices[0];
    if (!firstChoice) throw new Error('Expected the first yuzu story choice');
    firstChoice.effects = {
      ...firstChoice.effects,
      affinity: { yuzu: 10 },
      voteBonus: { yuzu: 3 },
    };
    firstNode.onExpire = {
      affinity: { yuzu: -2 },
      voteBonus: { yuzu: -1 },
    };

    const renamed = renameFanReferences(source, 'yuzu', 'daydream');
    const renamedFan = renamed.fans.find((fan) => fan.id === 'daydream');
    const renamedNode = renamed.nodes.find((node) => node.id === firstNode.id);
    const renamedChoice = renamedNode?.choices[0];

    expect(renamedFan?.pastChats.map((chat) => chat.id)).toEqual(
      source.fans.find((fan) => fan.id === 'yuzu')?.pastChats.map((chat) => chat.id),
    );
    expect(renamedNode?.fanId).toBe('daydream');
    expect(renamedNode?.id).toBe(firstNode.id);
    expect(renamedNode?.trigger?.conditions[0]).toMatchObject({ fanId: 'daydream' });
    expect(renamedNode?.trigger?.conditions[1]).toMatchObject({ fanId: 'daydream' });
    expect(renamedChoice?.effects.affinity).toEqual({ daydream: 10 });
    expect(renamedChoice?.effects.voteBonus).toEqual({ daydream: 3 });
    expect(renamedNode?.onExpire?.affinity).toEqual({ daydream: -2 });
    expect(renamedNode?.onExpire?.voteBonus).toEqual({ daydream: -1 });
    expect(renamed.nodes.some((node) => node.fanId === 'yuzu')).toBe(false);
  });
});
