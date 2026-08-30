import { describe, expect, it } from 'vitest';
import testStoryJson from '../../../content/test-story.json';
import type { GameState, StoryPack } from './types';
import {
  advanceTurn,
  createInitialGame,
  finalizeElection,
  getPendingNodes,
  orderTakeout,
  replyToNode,
} from './engine';

const pack = testStoryJson as unknown as StoryPack;

describe('story engine', () => {
  it('starts both display modes with identical underlying state', () => {
    const standard = createInitialGame(pack, 'standard');
    const realistic = createInitialGame(pack, 'realistic');

    expect(standard.mode).toBe('standard');
    expect(realistic.mode).toBe('realistic');
    expect({ ...standard, mode: 'realistic' }).toEqual(realistic);
    expect(getPendingNodes(standard, pack).map((node) => node.id)).toEqual([
      'yuzu-01',
      'salt-01',
      'lighthouse-01',
    ]);
  });

  it('keeps concurrent flips from the same fan independently actionable', () => {
    const source = pack.nodes.find((node) => node.id === 'yuzu-01')!;
    const parallelNode = {
      ...source,
      id: 'yuzu-parallel',
      title: '同日追加翻牌',
      replyWindowDays: 3,
      choices: source.choices.map((choice) => ({
        ...choice,
        id: `parallel-${choice.id}`,
        nextNodeId: undefined,
      })),
      onExpire: undefined,
    };
    const concurrentPack: StoryPack = { ...pack, nodes: [...pack.nodes, parallelNode] };
    const initial = createInitialGame(concurrentPack, 'standard');

    expect(getPendingNodes(initial, concurrentPack).map((node) => node.id)).toEqual([
      'yuzu-parallel',
      'yuzu-01',
      'salt-01',
      'lighthouse-01',
    ]);

    const replied = replyToNode(initial, concurrentPack, 'yuzu-parallel', 'parallel-play-along');
    expect(replied.pendingNodeIds).toContain('yuzu-01');
    expect(replied.pendingNodeIds).not.toContain('yuzu-parallel');
  });

  it('spends both resources, applies affection, and unlocks a dated follow-up', () => {
    const initial = createInitialGame(pack, 'standard');
    const replied = replyToNode(initial, pack, 'yuzu-01', 'play-along');

    expect(replied.resources).toEqual({ energy: 6, mindset: 5 });
    expect(replied.affinity.yuzu).toBe(72);
    expect(replied.resolvedNodes['yuzu-01']).toBe('play-along');
    expect(replied.unlockedNodeIds).toContain('yuzu-02');
    expect(replied.pendingNodeIds).not.toContain('yuzu-02');
    expect(replied.replyHistory.at(-1)).toMatchObject({
      nodeId: 'yuzu-01',
      fanId: 'yuzu',
      repliedTurn: 1,
      delayTurns: 0,
    });

    const dayTen = advanceTurn(advanceTurn(advanceTurn(replied, pack), pack), pack);
    expect(dayTen.currentDay).toBe(10);
    expect(dayTen.pendingNodeIds).toContain('yuzu-02');
  });

  it('applies a manually authored popularity delta from any reply choice', () => {
    const popularityPack = structuredClone(pack);
    popularityPack.nodes.find((node) => node.id === 'yuzu-01')!.choices[0]!.effects.popularity = 7;
    const initial = createInitialGame(popularityPack, 'standard');

    const replied = replyToNode(initial, popularityPack, 'yuzu-01', 'play-along');

    expect(replied.popularity).toBe(initial.popularity + 7);
    expect(replied.lastFeedback?.popularityDelta).toBe(7);
  });

  it('can surface an eligible downstream flip immediately after its reply', () => {
    const immediatePack = structuredClone(pack);
    const choice = immediatePack.nodes.find((node) => node.id === 'yuzu-01')!.choices[0]!;
    const followUp = immediatePack.nodes.find((node) => node.id === 'yuzu-02')!;
    choice.nextNodeTiming = 'immediate';
    followUp.postedDay = 1;
    followUp.trigger = {
      match: 'all',
      conditions: [{ type: 'flag-set', flag: 'yuzu-life-noticed' }],
    };

    const initial = createInitialGame(immediatePack, 'standard');
    expect(initial.pendingNodeIds).not.toContain('yuzu-02');

    const replied = replyToNode(initial, immediatePack, 'yuzu-01', 'play-along');
    expect(replied.pendingNodeIds).toContain('yuzu-02');
    expect(replied.activatedTurnByNodeId['yuzu-02']).toBe(replied.turn);
  });

  it('keeps an immediate downstream flip unlocked until its authored date arrives', () => {
    const futurePack = structuredClone(pack);
    futurePack.nodes.find((node) => node.id === 'yuzu-01')!.choices[0]!.nextNodeTiming =
      'immediate';

    const initial = createInitialGame(futurePack, 'standard');
    const replied = replyToNode(initial, futurePack, 'yuzu-01', 'play-along');

    expect(replied.unlockedNodeIds).toContain('yuzu-02');
    expect(replied.pendingNodeIds).not.toContain('yuzu-02');
  });

  it('opens a choice-authored special ending without continuing its story branch', () => {
    const endingPack = structuredClone(pack);
    const choice = endingPack.nodes.find((node) => node.id === 'yuzu-01')!.choices[0]!;
    choice.nextNodeId = undefined;
    choice.endingId = 'takeout-idol';

    const initial = createInitialGame(endingPack, 'standard');
    const ended = replyToNode(initial, endingPack, 'yuzu-01', choice.id);

    expect(ended.status).toBe('early-ending');
    expect(ended.earlyEndingId).toBe('takeout-idol');
    expect(ended.resolvedNodes['yuzu-01']).toBe(choice.id);
    expect(ended.pendingNodeIds).toEqual([]);
  });

  it('expires unanswered flips after their seven-day deadline', () => {
    const initial = createInitialGame(pack, 'standard');
    const dayTen = advanceTurn(advanceTurn(advanceTurn(initial, pack), pack), pack);

    expect(dayTen.currentDay).toBe(10);
    expect(dayTen.resolvedNodes['yuzu-01']).toBe('expired');
    expect(dayTen.affinity.yuzu).toBe(54);
    expect(dayTen.pendingNodeIds).toContain('yuzu-02');
    expect(dayTen.pendingNodeIds).toContain('lighthouse-02');
  });

  it('checks takeout-count node triggers only at the start of a new day', () => {
    const source = pack.nodes.find((node) => node.id === 'yuzu-01')!;
    const triggerNode = {
      ...structuredClone(source),
      id: 'takeout-trigger-test',
      postedDay: 1,
      trigger: {
        match: 'all' as const,
        conditions: [{ type: 'takeout-orders-at-least' as const, count: 1 }],
      },
      choices: source.choices.map((choice) => ({
        ...structuredClone(choice),
        id: `takeout-${choice.id}`,
        nextNodeId: undefined,
      })),
      onExpire: undefined,
    };
    const triggerPack: StoryPack = { ...pack, nodes: [...pack.nodes, triggerNode] };
    const ordered = orderTakeout(createInitialGame(triggerPack, 'standard'), triggerPack);

    expect(ordered.pendingNodeIds).not.toContain(triggerNode.id);
    expect(advanceTurn(ordered, triggerPack).pendingNodeIds).toContain(triggerNode.id);
  });

  it('can activate a node from the number of expired flips at day start', () => {
    const source = pack.nodes.find((node) => node.id === 'yuzu-01')!;
    const triggerNode = {
      ...structuredClone(source),
      id: 'expired-trigger-test',
      postedDay: 1,
      trigger: {
        match: 'all' as const,
        conditions: [{ type: 'expired-flips-at-least' as const, count: 2 }],
      },
      choices: source.choices.map((choice) => ({
        ...structuredClone(choice),
        id: `expired-${choice.id}`,
        nextNodeId: undefined,
      })),
      onExpire: undefined,
    };
    const triggerPack: StoryPack = { ...pack, nodes: [...pack.nodes, triggerNode] };
    const dayTen = advanceTurn(
      advanceTurn(
        advanceTurn(createInitialGame(triggerPack, 'standard'), triggerPack),
        triggerPack,
      ),
      triggerPack,
    );

    // 第 10 天过期的翻牌：yuzu-01、salt-01、lighthouse-01、battery-01
    expect(Object.values(dayTen.resolvedNodes).filter((value) => value === 'expired')).toHaveLength(
      4,
    );
    expect(dayTen.pendingNodeIds).toContain('expired-trigger-test');
  });

  it('surfaces cross-fan echo nodes when the referenced flags are set', () => {
    let state = createInitialGame(pack, 'standard');
    state = { ...state, flags: ['organizer-overloaded', 'stalker-blocked'] };

    for (let step = 0; step < 9; step += 1) state = advanceTurn(state, pack);

    expect(state.currentDay).toBe(28);
    expect(state.pendingNodeIds).toContain('patron-lighthouse-warn');
    expect(state.pendingNodeIds).toContain('yuzu-smear-worry');
    expect(state.pendingNodeIds).not.toContain('patron-lighthouse-praise');
  });

  it('activates a node when the first n nodes of a fan line are replied on time', () => {
    const source = pack.nodes.find((node) => node.id === 'yuzu-01')!;
    const triggerNode = {
      ...structuredClone(source),
      id: 'prompt-trigger-test',
      postedDay: 4,
      trigger: {
        match: 'all' as const,
        conditions: [
          {
            type: 'first-nodes-replied-on-time' as const,
            fanId: 'yuzu',
            count: 1,
            maxDelayTurns: 0,
          },
        ],
      },
      choices: source.choices.map((choice) => ({
        ...structuredClone(choice),
        id: `prompt-${choice.id}`,
        nextNodeId: undefined,
      })),
      onExpire: undefined,
    };
    const triggerPack: StoryPack = { ...pack, nodes: [...pack.nodes, triggerNode] };

    // 当回合回复：delayTurns 0 → 触发
    const prompt = replyToNode(
      createInitialGame(triggerPack, 'standard'),
      triggerPack,
      'yuzu-01',
      'play-along',
    );
    expect(prompt.replyHistory.at(-1)?.delayTurns).toBe(0);
    expect(advanceTurn(prompt, triggerPack).pendingNodeIds).toContain('prompt-trigger-test');

    // 延迟一个回合回复：delayTurns 1 → 不触发
    const delayed = replyToNode(
      advanceTurn(createInitialGame(triggerPack, 'standard'), triggerPack),
      triggerPack,
      'yuzu-01',
      'play-along',
    );
    expect(delayed.replyHistory.at(-1)?.delayTurns).toBe(1);
    const delayedDaySeven = advanceTurn(advanceTurn(delayed, triggerPack), triggerPack);
    expect(delayedDaySeven.pendingNodeIds).not.toContain('prompt-trigger-test');
  });

  it('triggers the patron goodbye after two consecutive replies delayed by two turns', () => {
    let state = createInitialGame(pack, 'standard');
    state = advanceTurn(advanceTurn(state, pack), pack);

    expect(state.turn).toBe(3);
    expect(state.pendingNodeIds).toContain('patron-01');
    expect(state.activatedTurnByNodeId['patron-01']).toBe(3);

    state = advanceTurn(advanceTurn(state, pack), pack);
    state = replyToNode(state, pack, 'patron-01', 'specific');
    expect(state.replyHistory.at(-1)?.delayTurns).toBe(2);

    state = advanceTurn(advanceTurn(state, pack), pack);
    expect(state.turn).toBe(7);
    expect(state.pendingNodeIds).toContain('patron-02');
    expect(state.activatedTurnByNodeId['patron-02']).toBe(7);

    state = advanceTurn(advanceTurn(state, pack), pack);
    state = replyToNode(state, pack, 'patron-02', 'calm-honesty');
    expect(state.replyHistory.at(-1)?.delayTurns).toBe(2);
    expect(state.pendingNodeIds).not.toContain('patron-goodbye');

    state = advanceTurn(state, pack);
    expect(state.turn).toBe(10);
    expect(state.pendingNodeIds).toContain('patron-goodbye');
  });

  it('uses the current turn event to modify fixed recovery', () => {
    let state = createInitialGame(pack, 'standard');
    state = advanceTurn(advanceTurn(advanceTurn(state, pack), pack), pack);
    const depleted: GameState = { ...state, resources: { energy: 0, mindset: 0 } };
    const turnFive = advanceTurn(depleted, pack);

    expect(turnFive.turn).toBe(5);
    expect(turnFive.resources).toEqual({ energy: 4, mindset: 3 });
    expect(turnFive.seenTurnEventIds).toContain('rehearsal-night');
  });

  it('allows one takeout per turn and ends the run on the fourth order', () => {
    let state = createInitialGame(pack, 'standard');
    for (let order = 1; order <= 4; order += 1) {
      state = orderTakeout(state, pack);
      if (order < 4) state = advanceTurn(state, pack);
    }

    expect(state.takeoutCount).toBe(4);
    expect(state.status).toBe('early-ending');
    expect(state.earlyEndingId).toBe('takeout-idol');
  });

  it('converts each fan cap and general popularity into election votes', () => {
    const initial = createInitialGame(pack, 'standard');
    const maxed: GameState = {
      ...initial,
      affinity: Object.fromEntries(pack.fans.map((fan) => [fan.id, 100])),
      popularity: 100,
    };
    const result = finalizeElection(maxed, pack).electionResult!;

    expect(result.fanVotes.map((fan) => fan.votes)).toEqual([20, 80, 900, 1800, 3000]);
    expect(result.popularityVotes).toBe(420);
    expect(result.totalVotes).toBe(6220);
    expect(result.endingId).toBe('rank-rookie');
    expect(result.achievementIds).toContain('everyone-stays');
  });
});
