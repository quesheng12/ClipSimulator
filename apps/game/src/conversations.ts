import type { BackgroundFlip, GameState, StoryChoice, StoryPack } from '@clip/story-core/types';

export type ConversationKind = 'core' | 'background';

export type ConversationExchangeStatus = 'pending' | 'replied' | 'expired' | 'automatic';

export interface ConversationParticipant {
  id: string;
  kind: ConversationKind;
  name: string;
  handle: string;
  avatar: string;
  accent: string;
  tag?: string;
  affinity?: number;
}

export interface ConversationExchange {
  id: string;
  day: number;
  title?: string;
  incoming: string;
  outgoing?: string;
  context?: string;
  tag?: string;
  status: ConversationExchangeStatus;
  deadlineDay?: number;
  selectedChoiceId?: string;
  choices: StoryChoice[];
}

export interface RepliedConversation {
  id: string;
  participant: ConversationParticipant;
  exchanges: ConversationExchange[];
  latestExchange: ConversationExchange;
  latestDay: number;
}

const BACKGROUND_ACCENTS = ['#8f82e8', '#5fb7aa', '#d8799e', '#6d9fd1', '#e49a63'];
const BACKGROUND_AVATARS = [
  '/assets/avatars/fan-callsticks.webp',
  '/assets/avatars/fan-milktea.webp',
  '/assets/avatars/fan-subway.webp',
  '/assets/avatars/fan-desk.webp',
];

function stableHash(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return hash;
}

function backgroundAccent(contactId: string): string {
  return BACKGROUND_ACCENTS[stableHash(contactId) % BACKGROUND_ACCENTS.length]!;
}

function backgroundAvatar(contactId: string): string {
  return BACKGROUND_AVATARS[stableHash(contactId) % BACKGROUND_AVATARS.length]!;
}

export function getBackgroundContactId(flip: BackgroundFlip): string {
  return flip.contactId?.trim() || flip.fanName;
}

export function getCoreParticipant(
  state: GameState,
  pack: StoryPack,
  fanId: string,
): ConversationParticipant | undefined {
  const fan = pack.fans.find((candidate) => candidate.id === fanId);
  if (!fan) return undefined;
  return {
    id: fan.id,
    kind: 'core',
    name: fan.name,
    handle: fan.handle,
    avatar: fan.avatar,
    accent: fan.accent,
    affinity: state.affinity[fan.id] ?? fan.initialAffinity,
  };
}

export function getBackgroundParticipant(
  pack: StoryPack,
  currentDay: number,
  contactId: string,
): ConversationParticipant | undefined {
  const latest = pack.backgroundFlips
    .map((flip, index) => ({ flip, index }))
    .filter(({ flip }) => flip.day <= currentDay && getBackgroundContactId(flip) === contactId)
    .sort((a, b) => b.flip.day - a.flip.day || b.index - a.index)[0]?.flip;
  if (!latest) return undefined;
  return {
    id: contactId,
    kind: 'background',
    name: latest.fanName,
    handle: latest.tag,
    avatar: latest.avatar ?? backgroundAvatar(contactId),
    accent: backgroundAccent(contactId),
    tag: latest.tag,
  };
}

/**
 * Returns only conversation events that the save has actually reached.
 * A pending node is included only when its id is explicitly supplied, which lets
 * the replied inbox show history without accidentally exposing other open messages.
 */
export function getCoreConversationHistory(
  state: GameState,
  pack: StoryPack,
  fanId: string,
  pendingNodeId?: string,
): ConversationExchange[] {
  return pack.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => {
      if (node.fanId !== fanId) return false;
      if (Object.prototype.hasOwnProperty.call(state.resolvedNodes, node.id)) return true;
      return node.id === pendingNodeId && state.pendingNodeIds.includes(node.id);
    })
    .sort((a, b) => a.node.postedDay - b.node.postedDay || a.index - b.index)
    .map(({ node }) => {
      const resolution = state.resolvedNodes[node.id];
      if (resolution === 'expired') {
        return {
          id: node.id,
          day: node.postedDay,
          title: node.title,
          incoming: node.content.text,
          context: node.content.context,
          status: 'expired' as const,
          deadlineDay: node.postedDay + node.replyWindowDays,
          choices: [],
        };
      }

      if (typeof resolution === 'string') {
        const selectedChoice = node.choices.find((choice) => choice.id === resolution);
        return {
          id: node.id,
          day: node.postedDay,
          title: node.title,
          incoming: node.content.text,
          outgoing: selectedChoice?.text,
          context: node.content.context,
          status: 'replied' as const,
          deadlineDay: node.postedDay + node.replyWindowDays,
          selectedChoiceId: resolution,
          choices: [],
        };
      }

      return {
        id: node.id,
        day: node.postedDay,
        title: node.title,
        incoming: node.content.text,
        context: node.content.context,
        status: 'pending' as const,
        deadlineDay: node.postedDay + node.replyWindowDays,
        choices: [...node.choices],
      };
    });
}

export function getBackgroundConversationHistory(
  pack: StoryPack,
  currentDay: number,
  contactId: string,
): ConversationExchange[] {
  return pack.backgroundFlips
    .map((flip, index) => ({ flip, index }))
    .filter(({ flip }) => flip.day <= currentDay && getBackgroundContactId(flip) === contactId)
    .sort((a, b) => a.flip.day - b.flip.day || a.index - b.index)
    .map(({ flip }) => ({
      id: flip.id,
      day: flip.day,
      incoming: flip.message,
      outgoing: flip.reply,
      tag: flip.tag,
      status: 'automatic' as const,
      choices: [],
    }));
}

/** Core conversations always precede ordinary-fan conversations in the replied inbox. */
export function getRepliedConversations(state: GameState, pack: StoryPack): RepliedConversation[] {
  const core = pack.fans.flatMap((fan): RepliedConversation[] => {
    const participant = getCoreParticipant(state, pack, fan.id);
    const exchanges = getCoreConversationHistory(state, pack, fan.id);
    const latestExchange = exchanges.at(-1);
    if (!participant || !latestExchange) return [];
    return [
      {
        id: `core:${fan.id}`,
        participant,
        exchanges,
        latestExchange,
        latestDay: latestExchange.day,
      },
    ];
  });

  const backgroundContactIds = [
    ...new Set(
      pack.backgroundFlips
        .filter((flip) => flip.day <= state.currentDay)
        .map(getBackgroundContactId),
    ),
  ];
  const background = backgroundContactIds.flatMap((contactId): RepliedConversation[] => {
    const participant = getBackgroundParticipant(pack, state.currentDay, contactId);
    const exchanges = getBackgroundConversationHistory(pack, state.currentDay, contactId);
    const latestExchange = exchanges.at(-1);
    if (!participant || !latestExchange) return [];
    return [
      {
        id: `background:${contactId}`,
        participant,
        exchanges,
        latestExchange,
        latestDay: latestExchange.day,
      },
    ];
  });

  core.sort((a, b) => b.latestDay - a.latestDay);
  background.sort((a, b) => b.latestDay - a.latestDay);
  return [...core, ...background];
}
