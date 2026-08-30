import type {
  Achievement,
  DisplayMode,
  ElectionEnding,
  ElectionResult,
  GameState,
  PopularityVoteTier,
  ReplyFeedback,
  Resources,
  StoryEffects,
  StoryNode,
  StoryPack,
  StoryTrigger,
  VoteTier,
} from './types';

const SAVE_VERSION = 4;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const unique = (values: string[]): string[] => [...new Set(values)];

function storyTriggerMet(
  trigger: StoryTrigger | undefined,
  state: GameState,
  pack: StoryPack,
): boolean {
  if (!trigger) return true;
  const expiredFlipCount = Object.values(state.resolvedNodes).filter(
    (resolution) => resolution === 'expired',
  ).length;
  const flagSet = new Set(state.flags);
  const results = trigger.conditions.map((condition) => {
    switch (condition.type) {
      case 'flag-set':
        return flagSet.has(condition.flag);
      case 'flag-unset':
        return !flagSet.has(condition.flag);
      case 'expired-flips-at-least':
        return expiredFlipCount >= condition.count;
      case 'takeout-orders-at-least':
        return state.takeoutCount >= condition.count;
      case 'consecutive-replies-delayed-at-least': {
        const recentReplies = state.replyHistory
          .filter((entry) => entry.fanId === condition.fanId)
          .slice(-condition.count);
        return (
          recentReplies.length === condition.count &&
          recentReplies.every((entry) => entry.delayTurns >= condition.turns)
        );
      }
      case 'first-nodes-replied-on-time': {
        const lineNodes = pack.nodes
          .map((node, index) => ({ node, index }))
          .filter(({ node }) => node.fanId === condition.fanId)
          .sort((a, b) => a.node.postedDay - b.node.postedDay || a.index - b.index);
        const firstNodes = lineNodes.slice(0, condition.count).map(({ node }) => node);
        return firstNodes.every((node) => {
          const entry = state.replyHistory.find((candidate) => candidate.nodeId === node.id);
          return entry !== undefined && entry.delayTurns === 0;
        });
      }
    }
  });
  return trigger.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function buildIncomingNodeIds(pack: StoryPack): Set<string> {
  const incoming = new Set<string>();
  for (const node of pack.nodes) {
    for (const choice of node.choices) {
      if (choice.nextNodeId) incoming.add(choice.nextNodeId);
    }
    if (node.onExpire?.nextNodeId) incoming.add(node.onExpire.nextNodeId);
  }
  return incoming;
}

function applyEffects(state: GameState, pack: StoryPack, effects: StoryEffects): GameState {
  const affinity = { ...state.affinity };
  for (const [fanId, delta] of Object.entries(effects.affinity ?? {})) {
    affinity[fanId] = clamp((affinity[fanId] ?? 0) + delta, 0, 100);
  }

  const voteBonuses = { ...state.voteBonuses };
  for (const [fanId, delta] of Object.entries(effects.voteBonus ?? {})) {
    voteBonuses[fanId] = (voteBonuses[fanId] ?? 0) + delta;
  }

  const flagSet = new Set(state.flags);
  for (const flag of effects.setFlags ?? []) flagSet.add(flag);
  for (const flag of effects.unsetFlags ?? []) flagSet.delete(flag);

  return {
    ...state,
    affinity,
    voteBonuses,
    popularity: clamp(
      state.popularity + (effects.popularity ?? 0),
      pack.config.popularity.min,
      pack.config.popularity.max,
    ),
    resources: {
      energy: clamp(
        state.resources.energy + (effects.resources?.energy ?? 0),
        0,
        pack.config.resources.max.energy,
      ),
      mindset: clamp(
        state.resources.mindset + (effects.resources?.mindset ?? 0),
        0,
        pack.config.resources.max.mindset,
      ),
    },
    flags: [...flagSet],
  };
}

function expirePendingNodes(state: GameState, pack: StoryPack): GameState {
  const nodeMap = new Map(pack.nodes.map((node) => [node.id, node]));
  let nextState = { ...state, pendingNodeIds: [...state.pendingNodeIds] };
  const stillPending: string[] = [];

  for (const nodeId of nextState.pendingNodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const deadlineDay = node.postedDay + node.replyWindowDays;
    if (nextState.currentDay > deadlineDay) {
      if (node.onExpire) {
        nextState = applyEffects(nextState, pack, node.onExpire);
        if (node.onExpire.nextNodeId) {
          nextState.unlockedNodeIds = unique([
            ...nextState.unlockedNodeIds,
            node.onExpire.nextNodeId,
          ]);
        }
      }
      nextState.resolvedNodes = { ...nextState.resolvedNodes, [nodeId]: 'expired' };
    } else {
      stillPending.push(nodeId);
    }
  }
  nextState.pendingNodeIds = stillPending;

  return nextState;
}

function activateDayStartNodes(state: GameState, pack: StoryPack): GameState {
  const nextState = {
    ...state,
    pendingNodeIds: [...state.pendingNodeIds],
    activatedTurnByNodeId: { ...state.activatedTurnByNodeId },
  };

  const incoming = buildIncomingNodeIds(pack);
  const processed = new Set([...Object.keys(nextState.resolvedNodes), ...nextState.pendingNodeIds]);
  const unlocked = new Set(nextState.unlockedNodeIds);

  const available = pack.nodes
    .filter((node) => {
      if (processed.has(node.id)) return false;
      if (node.postedDay > nextState.currentDay) return false;
      if (incoming.has(node.id) && !unlocked.has(node.id)) return false;
      return storyTriggerMet(node.trigger, nextState, pack);
    })
    .sort((a, b) => a.postedDay - b.postedDay || a.id.localeCompare(b.id));

  for (const node of available) {
    nextState.activatedTurnByNodeId[node.id] ??= nextState.turn;
  }

  return {
    ...nextState,
    pendingNodeIds: unique([...nextState.pendingNodeIds, ...available.map((node) => node.id)]),
  };
}

function activateImmediateFollowUp(state: GameState, pack: StoryPack, nodeId: string): GameState {
  const node = pack.nodes.find((candidate) => candidate.id === nodeId);
  const alreadyProcessed =
    state.pendingNodeIds.includes(nodeId) || Object.hasOwn(state.resolvedNodes, nodeId);
  if (
    !node ||
    alreadyProcessed ||
    node.postedDay > state.currentDay ||
    !storyTriggerMet(node.trigger, state, pack)
  ) {
    return state;
  }

  return {
    ...state,
    pendingNodeIds: unique([...state.pendingNodeIds, nodeId]),
    activatedTurnByNodeId: {
      ...state.activatedTurnByNodeId,
      [nodeId]: state.activatedTurnByNodeId[nodeId] ?? state.turn,
    },
  };
}

/**
 * 每次回复翻牌后检查所有带 trigger 的节点：条件满足且日期已到的立即进入收件箱。
 * 普通连线节点不在此列，仍按日初或 nextNodeTiming 规则出现。
 */
function activateTriggeredNodes(state: GameState, pack: StoryPack): GameState {
  const nextState = {
    ...state,
    pendingNodeIds: [...state.pendingNodeIds],
    activatedTurnByNodeId: { ...state.activatedTurnByNodeId },
  };

  const incoming = buildIncomingNodeIds(pack);
  const processed = new Set([...Object.keys(nextState.resolvedNodes), ...nextState.pendingNodeIds]);
  const unlocked = new Set(nextState.unlockedNodeIds);

  const available = pack.nodes
    .filter((node) => {
      if (!node.trigger) return false;
      if (processed.has(node.id)) return false;
      if (node.postedDay > nextState.currentDay) return false;
      if (incoming.has(node.id) && !unlocked.has(node.id)) return false;
      return storyTriggerMet(node.trigger, nextState, pack);
    })
    .sort((a, b) => a.postedDay - b.postedDay || a.id.localeCompare(b.id));

  for (const node of available) {
    nextState.activatedTurnByNodeId[node.id] ??= nextState.turn;
  }

  return {
    ...nextState,
    pendingNodeIds: unique([...nextState.pendingNodeIds, ...available.map((node) => node.id)]),
  };
}

export function createInitialGame(pack: StoryPack, mode: DisplayMode): GameState {
  const affinity = Object.fromEntries(pack.fans.map((fan) => [fan.id, fan.initialAffinity]));
  const initial: GameState = {
    saveVersion: SAVE_VERSION,
    storyPackId: pack.id,
    contentVersion: pack.contentVersion,
    mode,
    status: 'playing',
    turn: 1,
    currentDay: 1,
    resources: { ...pack.config.resources.initial },
    affinity,
    popularity: pack.config.popularity.initial,
    flags: [],
    pendingNodeIds: [],
    unlockedNodeIds: [],
    resolvedNodes: {},
    activatedTurnByNodeId: {},
    replyHistory: [],
    voteBonuses: {},
    takeoutCount: 0,
    takeoutUsesThisTurn: 0,
    seenTurnEventIds: [],
  };
  return activateDayStartNodes(applyTurnEvent(initial, pack), pack);
}

export function getPendingNodes(state: GameState, pack: StoryPack): StoryNode[] {
  const pending = new Set(state.pendingNodeIds);
  return pack.nodes
    .filter((node) => pending.has(node.id))
    .sort(
      (a, b) =>
        a.postedDay + a.replyWindowDays - (b.postedDay + b.replyWindowDays) ||
        a.postedDay - b.postedDay,
    );
}

export function canAfford(resources: Resources, cost: Resources): boolean {
  return resources.energy >= cost.energy && resources.mindset >= cost.mindset;
}

export function replyToNode(
  state: GameState,
  pack: StoryPack,
  nodeId: string,
  choiceId: string,
): GameState {
  if (state.status !== 'playing') return state;
  if (!state.pendingNodeIds.includes(nodeId)) return state;
  const node = pack.nodes.find((candidate) => candidate.id === nodeId);
  const choice = node?.choices.find((candidate) => candidate.id === choiceId);
  if (!node || !choice || !canAfford(state.resources, choice.cost)) return state;

  let nextState: GameState = {
    ...state,
    resources: {
      energy: state.resources.energy - choice.cost.energy,
      mindset: state.resources.mindset - choice.cost.mindset,
    },
    pendingNodeIds: state.pendingNodeIds.filter((id) => id !== nodeId),
    resolvedNodes: { ...state.resolvedNodes, [nodeId]: choiceId },
    replyHistory: [
      ...state.replyHistory,
      {
        nodeId,
        fanId: node.fanId,
        repliedTurn: state.turn,
        delayTurns: Math.max(0, state.turn - (state.activatedTurnByNodeId[nodeId] ?? state.turn)),
      },
    ],
  };
  nextState = applyEffects(nextState, pack, choice.effects);
  if (choice.nextNodeId) {
    nextState.unlockedNodeIds = unique([...nextState.unlockedNodeIds, choice.nextNodeId]);
    if (choice.nextNodeTiming === 'immediate') {
      nextState = activateImmediateFollowUp(nextState, pack, choice.nextNodeId);
    }
  }
  // 回复后立刻重查所有触发条件节点，秒回奖励当场弹出
  nextState = activateTriggeredNodes(nextState, pack);

  const feedback: ReplyFeedback = {
    nodeId,
    choiceId,
    affinityDelta: { ...(choice.effects.affinity ?? {}) },
    popularityDelta: choice.effects.popularity ?? 0,
    resourceCost: { ...choice.cost },
  };
  const resolved = { ...nextState, lastFeedback: feedback };
  if (choice.endingId) {
    return {
      ...resolved,
      status: 'early-ending',
      earlyEndingId: choice.endingId,
      pendingNodeIds: [],
    };
  }
  return resolved;
}

function applyTurnEvent(state: GameState, pack: StoryPack): GameState {
  const event = pack.turnEvents.find(
    (candidate) => candidate.turn === state.turn && !state.seenTurnEventIds.includes(candidate.id),
  );
  if (!event) return state;
  const withEffects = applyEffects(state, pack, {
    popularity: event.popularityDelta,
  });
  return {
    ...withEffects,
    seenTurnEventIds: [...state.seenTurnEventIds, event.id],
  };
}

function getTurnRecovery(state: GameState, pack: StoryPack): Resources {
  const event = pack.turnEvents.find((candidate) => candidate.turn === state.turn);
  return {
    energy: pack.config.resources.recoveryPerTurn.energy + (event?.recoveryDelta?.energy ?? 0),
    mindset: pack.config.resources.recoveryPerTurn.mindset + (event?.recoveryDelta?.mindset ?? 0),
  };
}

function bestVoteTier(tiers: VoteTier[], value: number): VoteTier {
  return (
    [...tiers]
      .sort((a, b) => b.minAffinity - a.minAffinity)
      .find((tier) => value >= tier.minAffinity) ?? tiers[0]!
  );
}

function bestPopularityTier(tiers: PopularityVoteTier[], value: number): PopularityVoteTier {
  return (
    [...tiers]
      .sort((a, b) => b.minPopularity - a.minPopularity)
      .find((tier) => value >= tier.minPopularity) ?? tiers[0]!
  );
}

function achievementMet(achievement: Achievement, state: GameState, pack: StoryPack): boolean {
  const condition = achievement.condition;
  if (
    condition.takeoutCountAtMost !== undefined &&
    state.takeoutCount > condition.takeoutCountAtMost
  )
    return false;
  if (
    condition.takeoutCountAtLeast !== undefined &&
    state.takeoutCount < condition.takeoutCountAtLeast
  )
    return false;
  if (condition.popularityAtLeast !== undefined && state.popularity < condition.popularityAtLeast)
    return false;
  if (
    condition.allFansAffinityAtLeast !== undefined &&
    pack.fans.some((fan) => (state.affinity[fan.id] ?? 0) < condition.allFansAffinityAtLeast!)
  )
    return false;
  if (condition.allFlags && condition.allFlags.some((flag) => !state.flags.includes(flag)))
    return false;
  return true;
}

function chooseElectionEnding(endings: ElectionEnding[], votes: number): ElectionEnding {
  return (
    [...endings]
      .sort((a, b) => b.minVotes - a.minVotes)
      .find((ending) => votes >= ending.minVotes) ?? endings[0]!
  );
}

export function finalizeElection(state: GameState, pack: StoryPack): GameState {
  const fanVotes = pack.fans.map((fan) => {
    const affinity = state.affinity[fan.id] ?? fan.initialAffinity;
    const tier = bestVoteTier(fan.voteTiers, affinity);
    const bonusVotes = state.voteBonuses[fan.id] ?? 0;
    return {
      fanId: fan.id,
      affinity,
      tierLabel: tier.label,
      baseVotes: tier.votes,
      bonusVotes,
      votes: clamp(tier.votes + bonusVotes, 0, fan.maxVotePower + Math.max(0, bonusVotes)),
    };
  });
  const popularityTier = bestPopularityTier(pack.config.popularity.voteTiers, state.popularity);
  const totalVotes = fanVotes.reduce((sum, result) => sum + result.votes, 0) + popularityTier.votes;
  const ending = chooseElectionEnding(pack.electionEndings, totalVotes);
  const result: ElectionResult = {
    endingId: ending.id,
    totalVotes,
    fanVotes,
    popularityVotes: popularityTier.votes,
    popularityTierLabel: popularityTier.label,
    achievementIds: pack.achievements
      .filter((achievement) => achievementMet(achievement, state, pack))
      .map((achievement) => achievement.id),
  };
  return { ...state, status: 'election', electionResult: result, pendingNodeIds: [] };
}

export function advanceTurn(state: GameState, pack: StoryPack): GameState {
  if (state.status !== 'playing') return state;
  if (state.turn >= pack.config.maxTurns) return finalizeElection(state, pack);

  const nextTurn = state.turn + 1;
  const advanced: GameState = {
    ...state,
    turn: nextTurn,
    currentDay: Math.min(pack.config.totalDays, state.currentDay + pack.config.turnDays),
    takeoutUsesThisTurn: 0,
    lastFeedback: undefined,
  };
  const afterExpiry = expirePendingNodes(advanced, pack);
  const afterEvent = applyTurnEvent(afterExpiry, pack);
  const recovery = getTurnRecovery(afterEvent, pack);
  afterEvent.resources = {
    energy: clamp(
      afterEvent.resources.energy + recovery.energy,
      0,
      pack.config.resources.max.energy,
    ),
    mindset: clamp(
      afterEvent.resources.mindset + recovery.mindset,
      0,
      pack.config.resources.max.mindset,
    ),
  };
  return activateDayStartNodes(afterEvent, pack);
}

export function orderTakeout(state: GameState, pack: StoryPack): GameState {
  if (state.status !== 'playing') return state;
  if (state.takeoutUsesThisTurn >= pack.config.takeout.maxPerTurn) return state;
  const takeoutCount = state.takeoutCount + 1;
  const restored: GameState = {
    ...state,
    takeoutCount,
    takeoutUsesThisTurn: state.takeoutUsesThisTurn + 1,
    resources: {
      energy: clamp(
        state.resources.energy + pack.config.takeout.recovery.energy,
        0,
        pack.config.resources.max.energy,
      ),
      mindset: clamp(
        state.resources.mindset + pack.config.takeout.recovery.mindset,
        0,
        pack.config.resources.max.mindset,
      ),
    },
    lastFeedback: undefined,
  };
  if (takeoutCount >= pack.config.takeout.triggerCount) {
    return {
      ...restored,
      status: 'early-ending',
      earlyEndingId: pack.config.takeout.endingId,
      pendingNodeIds: [],
    };
  }
  return restored;
}

export function getCurrentTurnEvent(state: GameState, pack: StoryPack) {
  return pack.turnEvents.find((event) => event.turn === state.turn);
}

export function isCompatibleSave(state: GameState, pack: StoryPack): boolean {
  return (
    state.saveVersion === SAVE_VERSION &&
    state.storyPackId === pack.id &&
    state.contentVersion === pack.contentVersion
  );
}
