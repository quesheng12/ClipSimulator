import { describe, expect, it } from 'vitest';
import { advanceTurn, createInitialGame, replyToNode } from '@clip/story-core/engine';
import type { StoryPack } from '@clip/story-core/types';
import testStoryJson from '../../../content/test-story.json';
import {
  getBackgroundConversationHistory,
  getBackgroundParticipant,
  getCoreConversationHistory,
  getCoreParticipant,
  getRepliedConversations,
} from './conversations';

const pack = testStoryJson as unknown as StoryPack;

describe('conversation selectors', () => {
  it('never exposes an unreached branch and restores the selected reply', () => {
    const initial = createInitialGame(pack, 'standard');
    const pending = getCoreConversationHistory(initial, pack, 'yuzu', 'yuzu-01');
    const pastIds = pack.fans
      .find((fan) => fan.id === 'yuzu')!
      .pastChats.map((chat) => `past:yuzu:${chat.id}`);

    expect(pending.map((exchange) => exchange.id)).toEqual([...pastIds, 'yuzu-01']);
    expect(pending.at(-1)?.status).toBe('pending');
    expect(pending.at(-1)?.choices.map((choice) => choice.id)).toEqual([
      'play-along',
      'summer-wishes',
      'assign-data-work',
    ]);
    expect(pending[0]).toMatchObject({
      timeLabel: '出道第 18 天',
      status: 'replied',
    });
    expect(getCoreParticipant(initial, pack, 'yuzu')?.tags).toEqual(
      pack.fans.find((fan) => fan.id === 'yuzu')?.tags,
    );

    const replied = replyToNode(initial, pack, 'yuzu-01', 'play-along');
    const history = getCoreConversationHistory(replied, pack, 'yuzu');

    expect(history.map((exchange) => exchange.id)).toEqual([...pastIds, 'yuzu-01']);
    expect(history.some((exchange) => exchange.id === 'yuzu-02')).toBe(false);
    expect(history.at(-1)).toMatchObject({
      status: 'replied',
      selectedChoiceId: 'play-along',
      outgoing: pack.nodes.find((node) => node.id === 'yuzu-01')?.choices[0]?.text,
      choices: [],
    });
  });

  it('keeps every core conversation above ordinary fans and sorts each group by recency', () => {
    let state = createInitialGame(pack, 'standard');
    state = replyToNode(state, pack, 'yuzu-01', 'play-along');
    state = replyToNode(state, pack, 'lighthouse-01', 'together');
    state = advanceTurn(state, pack);
    state = replyToNode(state, pack, 'salt-01', 'gentle-boundary');

    const conversations = getRepliedConversations(state, pack);
    const firstBackgroundIndex = conversations.findIndex(
      (conversation) => conversation.participant.kind === 'background',
    );

    expect(firstBackgroundIndex).toBeGreaterThan(0);
    expect(
      conversations
        .slice(0, firstBackgroundIndex)
        .every((conversation) => conversation.participant.kind === 'core'),
    ).toBe(true);
    expect(
      conversations
        .slice(firstBackgroundIndex)
        .every((conversation) => conversation.participant.kind === 'background'),
    ).toBe(true);
    expect(conversations[0]?.participant.id).toBe('salt');
    expect(conversations[0]?.latestDay).toBe(4);
  });

  it('groups ordinary messages by contactId, tracks renamed contacts, and hides future entries', () => {
    const groupedPack = structuredClone(pack);
    groupedPack.backgroundFlips = [
      {
        id: 'tea-01',
        contactId: 'milk-tea-fan',
        day: 1,
        fanName: '奶茶去冰',
        tag: '初识',
        message: '第一条消息',
        reply: '第一条回复',
      },
      {
        id: 'tea-02',
        contactId: 'milk-tea-fan',
        day: 2,
        fanName: '奶茶半糖',
        tag: '冒泡',
        message: '第二条消息',
        reply: '第二条回复',
      },
      {
        id: 'tea-03',
        contactId: 'milk-tea-fan',
        day: 4,
        fanName: '奶茶半糖',
        tag: '铁粉',
        message: '未来消息',
        reply: '未来回复',
      },
    ];

    const state = { ...createInitialGame(groupedPack, 'standard'), currentDay: 2 };
    const history = getBackgroundConversationHistory(state, groupedPack, 'milk-tea-fan');
    const participant = getBackgroundParticipant(groupedPack, 2, 'milk-tea-fan');

    expect(history.map((exchange) => exchange.id)).toEqual(['tea-01', 'tea-02']);
    expect(history.every((exchange) => exchange.status === 'automatic')).toBe(true);
    expect(participant).toMatchObject({
      id: 'milk-tea-fan',
      kind: 'background',
      name: '奶茶半糖',
      tags: ['冒泡'],
    });
  });

  it('reveals ordinary-fan question-and-answer chatter directly in replied history as days advance', () => {
    const initial = createInitialGame(pack, 'standard');
    let state = advanceTurn(initial, pack);
    const flip = pack.backgroundFlips.find((candidate) => candidate.id === 'topic-idol-dog-01')!;
    const contactId = flip.contactId!;
    const firstHistory = getBackgroundConversationHistory(state, pack, contactId);

    expect(firstHistory.at(-1)).toMatchObject({
      id: flip.id,
      status: 'automatic',
    });
    expect(firstHistory.at(-1)?.outgoing).toBe(flip.reply);
    expect(firstHistory.at(-1)?.continuations).toEqual([]);
    expect(
      getRepliedConversations(state, pack).some(
        (conversation) => conversation.participant.id === contactId,
      ),
    ).toBe(true);

    for (let turn = 0; turn < 4; turn += 1) state = advanceTurn(state, pack);
    const laterHistory = getBackgroundConversationHistory(state, pack, contactId);

    expect(laterHistory.map((exchange) => exchange.id)).toEqual([
      'topic-idol-dog-01',
      'topic-idol-dog-02',
    ]);
    expect(laterHistory.every((exchange) => exchange.outgoing !== undefined)).toBe(true);
  });

  it('renders expired history without a reply and can append the current pending choices', () => {
    let state = createInitialGame(pack, 'standard');
    state = advanceTurn(advanceTurn(advanceTurn(state, pack), pack), pack);

    const history = getCoreConversationHistory(state, pack, 'yuzu', 'yuzu-02');
    const pastIds = pack.fans
      .find((fan) => fan.id === 'yuzu')!
      .pastChats.map((chat) => `past:yuzu:${chat.id}`);

    expect(history.map((exchange) => exchange.id)).toEqual([...pastIds, 'yuzu-01', 'yuzu-02']);
    expect(history.at(-2)).toMatchObject({ status: 'expired', choices: [] });
    expect(history.at(-2)?.outgoing).toBeUndefined();
    expect(history.at(-1)?.status).toBe('pending');
    expect(history.at(-1)?.choices.map((choice) => choice.id)).toEqual([
      'notice-details',
      'gentle-congrats',
      'pivot-to-election',
    ]);
  });
});
