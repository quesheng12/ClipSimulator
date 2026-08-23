export type DisplayMode = 'standard' | 'realistic';

export type GameStatus = 'playing' | 'early-ending' | 'election';

export interface Resources {
  energy: number;
  mindset: number;
}

export type StoryTriggerCondition =
  | { type: 'flag-set'; flag: string }
  | { type: 'flag-unset'; flag: string }
  | { type: 'expired-flips-at-least'; count: number }
  | { type: 'takeout-orders-at-least'; count: number }
  | {
      type: 'consecutive-replies-delayed-at-least';
      fanId: string;
      count: number;
      turns: number;
    };

export interface StoryTrigger {
  match: 'all' | 'any';
  conditions: StoryTriggerCondition[];
}

export interface StoryEffects {
  affinity?: Record<string, number>;
  popularity?: number;
  resources?: Partial<Resources>;
  setFlags?: string[];
  unsetFlags?: string[];
  voteBonus?: Record<string, number>;
}

export interface StoryChoice {
  id: string;
  text: string;
  cost: Resources;
  effects: StoryEffects & { popularity: number };
  nextNodeId?: string;
  /** Defaults to day-start; immediate activates an eligible downstream node after this reply. */
  nextNodeTiming?: 'day-start' | 'immediate';
  /** Opens a recoverable early-ending branch instead of continuing to another node. */
  endingId?: string;
}

export interface ExpireOutcome extends StoryEffects {
  nextNodeId?: string;
}

export interface StoryNode {
  id: string;
  fanId: string;
  title: string;
  postedDay: number;
  replyWindowDays: number;
  /** Evaluated at day start, or after effects when an incoming choice is explicitly immediate. */
  trigger?: StoryTrigger;
  content: {
    text: string;
    context?: string;
    public?: boolean;
  };
  choices: StoryChoice[];
  onExpire?: ExpireOutcome;
  editor?: {
    y: number;
  };
}

export interface VoteTier {
  minAffinity: number;
  votes: number;
  label: string;
}

export interface CoreFanPastChat {
  /** Stable within this fan's authored history; it never enters GameState. */
  id: string;
  /** Human-authored marker such as “三个月前” or “出道第 18 天”. */
  timeLabel: string;
  message: string;
  reply: string;
}

export interface PopularityVoteTier {
  minPopularity: number;
  votes: number;
  label: string;
}

export interface FanDefinition {
  id: string;
  name: string;
  handle: string;
  bio: string;
  tags: string[];
  /** Read-only relationship history shown before the current election run. */
  pastChats: CoreFanPastChat[];
  avatar: string;
  accent: string;
  initialAffinity: number;
  maxVotePower: number;
  voteTiers: VoteTier[];
}

export interface TeamDefinition {
  id: string;
  name: string;
  shortName: string;
  mark: string;
  color: string;
}

export interface PlayerProfile {
  idolName: string;
  teamId: string;
  /** Stable app-owned avatar id. Older local profiles omit it and use the default. */
  avatarId?: string;
}

export type ProfileNameKind = 'adapted' | 'original';

export interface ProfileNamePools {
  adapted: string[];
  original: string[];
}

export interface ProfileSetup {
  namePools: ProfileNamePools;
  teams: TeamDefinition[];
}

export interface TurnEvent {
  id: string;
  turn: number;
  title: string;
  description: string;
  recoveryDelta?: Partial<Resources>;
  popularityDelta?: number;
}

export interface BackgroundFlip {
  id: string;
  /** Stable identity used to group messages when a display name changes. */
  contactId?: string;
  day: number;
  fanName: string;
  avatar?: string;
  tag: string;
  message: string;
  /** Optional automatic member reply used by ambient archive exchanges. */
  reply?: string;
  /** Extra consecutive bubbles from the same NPC. Omit `reply` for read-only NPC chatter. */
  continuations?: string[];
}

export interface ElectionEnding {
  id: string;
  minVotes: number;
  rankLabel: string;
  title: string;
  description: string;
}

export interface EarlyEnding {
  id: string;
  title: string;
  description: string;
  image?: {
    src: string;
    alt: string;
  };
  trigger: {
    takeoutCountAtLeast?: number;
    allFlags?: string[];
  };
}

export interface AchievementCondition {
  takeoutCountAtMost?: number;
  takeoutCountAtLeast?: number;
  popularityAtLeast?: number;
  allFansAffinityAtLeast?: number;
  allFlags?: string[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  condition: AchievementCondition;
}

export interface StoryPack {
  schemaVersion: number;
  id: string;
  title: string;
  description: string;
  contentVersion: string;
  profileSetup: ProfileSetup;
  globalVariables: Record<string, string>;
  config: {
    totalDays: number;
    turnDays: number;
    maxTurns: number;
    resources: {
      max: Resources;
      initial: Resources;
      recoveryPerTurn: Resources;
    };
    takeout: {
      recovery: Resources;
      maxPerTurn: number;
      triggerCount: number;
      endingId: string;
    };
    popularity: {
      initial: number;
      min: number;
      max: number;
      voteTiers: PopularityVoteTier[];
    };
  };
  fans: FanDefinition[];
  nodes: StoryNode[];
  turnEvents: TurnEvent[];
  backgroundFlips: BackgroundFlip[];
  electionEndings: ElectionEnding[];
  earlyEndings: EarlyEnding[];
  achievements: Achievement[];
}

export interface ReplyFeedback {
  nodeId: string;
  choiceId: string;
  affinityDelta: Record<string, number>;
  popularityDelta: number;
  resourceCost: Resources;
}

export interface FanVoteResult {
  fanId: string;
  affinity: number;
  tierLabel: string;
  baseVotes: number;
  bonusVotes: number;
  votes: number;
}

export interface ElectionResult {
  endingId: string;
  totalVotes: number;
  fanVotes: FanVoteResult[];
  popularityVotes: number;
  popularityTierLabel: string;
  achievementIds: string[];
}

export interface ReplyHistoryEntry {
  nodeId: string;
  fanId: string;
  repliedTurn: number;
  delayTurns: number;
}

export interface GameState {
  saveVersion: number;
  storyPackId: string;
  contentVersion: string;
  mode: DisplayMode;
  status: GameStatus;
  turn: number;
  currentDay: number;
  resources: Resources;
  affinity: Record<string, number>;
  popularity: number;
  flags: string[];
  pendingNodeIds: string[];
  unlockedNodeIds: string[];
  resolvedNodes: Record<string, string | 'expired'>;
  activatedTurnByNodeId: Record<string, number>;
  replyHistory: ReplyHistoryEntry[];
  voteBonuses: Record<string, number>;
  takeoutCount: number;
  takeoutUsesThisTurn: number;
  seenTurnEventIds: string[];
  lastFeedback?: ReplyFeedback;
  earlyEndingId?: string;
  electionResult?: ElectionResult;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
}
