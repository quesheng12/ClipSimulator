/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advanceTurn,
  canAfford,
  createInitialGame,
  getPendingNodes,
  orderTakeout,
  replyToNode,
} from '@clip/story-core/engine';
import { storyPack } from './content';
import {
  readStatisticsFile,
  recordGameTransition,
  recordRunAbandoned,
  recordRunStarted,
  STATISTICS_STORAGE_KEY,
} from './statistics';

const currentPackStatistics = () =>
  readStatisticsFile().packs[`${storyPack.id}@${storyPack.contentVersion}`]!;

describe('hidden local statistics', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('aggregates replies, expirations, takeout, and the final election without profile data', () => {
    let state = createInitialGame(storyPack, 'standard');
    recordRunStarted(storyPack, 'standard');

    const node = getPendingNodes(state, storyPack)[0]!;
    const choice = node.choices.find((candidate) => canAfford(state.resources, candidate.cost))!;
    const replied = replyToNode(state, storyPack, node.id, choice.id);
    recordGameTransition(storyPack, state, replied, {
      type: 'reply',
      nodeId: node.id,
      choiceId: choice.id,
    });
    state = replied;

    const afterTakeout = orderTakeout(state, storyPack);
    recordGameTransition(storyPack, state, afterTakeout, { type: 'takeout' });
    state = afterTakeout;

    while (state.status === 'playing') {
      const advanced = advanceTurn(state, storyPack);
      recordGameTransition(storyPack, state, advanced, { type: 'advance' });
      state = advanced;
    }

    const statistics = currentPackStatistics();
    expect(statistics.totals).toMatchObject({
      runsStarted: 1,
      runsFinished: 1,
      electionFinishes: 1,
      replies: 1,
      takeoutOrders: 1,
    });
    expect(statistics.totals.expiredReplies).toBeGreaterThan(0);
    expect(statistics.nodes[node.id]).toMatchObject({
      fanId: node.fanId,
      replies: 1,
      choices: { [choice.id]: 1 },
    });
    expect(statistics.elections.count).toBe(1);
    expect(statistics.elections.totalVotes).toBe(state.electionResult?.totalVotes);
    expect(statistics.endings[state.electionResult!.endingId]).toBe(1);

    const raw = window.localStorage.getItem(STATISTICS_STORAGE_KEY)!;
    expect(raw).not.toContain('idolName');
    expect(raw).not.toContain('fanMessage');

    const requests = vi.mocked(fetch).mock.calls;
    expect(requests).toHaveLength(2);
    const started = JSON.parse(String(requests[0]?.[1]?.body));
    const finished = JSON.parse(String(requests[1]?.[1]?.body));
    expect(started).toMatchObject({ event: 'run_started' });
    expect(finished).toMatchObject({
      event: 'run_finished',
      run: { id: started.run.id },
      result: {
        outcome: 'election',
        totalVotes: state.electionResult?.totalVotes,
      },
    });
    expect(JSON.stringify(finished)).not.toContain('idolName');
    expect(requests[1]?.[1]).toMatchObject({
      credentials: 'omit',
      keepalive: true,
      referrerPolicy: 'no-referrer',
    });
  });

  it('counts an active run as abandoned without treating it as an ending', () => {
    const state = createInitialGame(storyPack, 'realistic');
    recordRunStarted(storyPack, 'realistic');
    recordRunAbandoned(storyPack, state);

    expect(currentPackStatistics()).toMatchObject({
      totals: {
        runsStarted: 1,
        runsAbandoned: 1,
        runsFinished: 0,
      },
      startedModes: { standard: 0, realistic: 1 },
    });
    const finished = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body));
    expect(finished).toMatchObject({
      event: 'run_finished',
      result: { outcome: 'abandoned' },
    });
  });

  it('records a recoverable special ending without finishing the active run', () => {
    const endingPack = structuredClone(storyPack);
    const node = endingPack.nodes.find((candidate) => candidate.id === 'yuzu-01')!;
    node.choices[0]!.nextNodeId = undefined;
    node.choices[0]!.endingId = 'takeout-idol';
    const state = createInitialGame(endingPack, 'standard');
    recordRunStarted(endingPack, 'standard');

    const ended = replyToNode(state, endingPack, node.id, node.choices[0]!.id);
    recordGameTransition(endingPack, state, ended, {
      type: 'reply',
      nodeId: node.id,
      choiceId: node.choices[0]!.id,
    });

    expect(currentPackStatistics()).toMatchObject({
      totals: { runsStarted: 1, runsFinished: 0, earlyFinishes: 0 },
      endings: { 'takeout-idol': 1 },
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('keeps the local fallback when the remote endpoint rejects both events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const state = createInitialGame(storyPack, 'standard');

    expect(() => recordRunStarted(storyPack, 'standard')).not.toThrow();
    expect(() => recordRunAbandoned(storyPack, state)).not.toThrow();
    await Promise.resolve();

    expect(currentPackStatistics()).toMatchObject({
      totals: {
        runsStarted: 1,
        runsAbandoned: 1,
        runsFinished: 0,
      },
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});
