import type { DisplayMode, GameState, StoryPack } from '@clip/story-core/types';

export const STATISTICS_STORAGE_KEY = 'clip-simulator:statistics:v1';
export const STATISTICS_ACTIVE_RUN_KEY = 'clip-simulator:statistics-active-run:v1';
export const STATISTICS_FILE_NAME = 'clip-simulator-statistics.json';
export const STATISTICS_ENDPOINT =
  import.meta.env.VITE_STATISTICS_ENDPOINT?.trim() || '/api/statistics';

export interface NodeStatistics {
  fanId: string;
  replies: number;
  expirations: number;
  totalReplyDelayTurns: number;
  choices: Record<string, number>;
}

export interface FanVoteStatistics {
  samples: number;
  totalVotes: number;
}

export interface PackStatistics {
  storyPackId: string;
  contentVersion: string;
  totals: {
    runsStarted: number;
    runsAbandoned: number;
    runsFinished: number;
    electionFinishes: number;
    earlyFinishes: number;
    replies: number;
    expiredReplies: number;
    takeoutOrders: number;
  };
  startedModes: Record<DisplayMode, number>;
  endings: Record<string, number>;
  achievements: Record<string, number>;
  nodes: Record<string, NodeStatistics>;
  elections: {
    count: number;
    totalVotes: number;
    popularityVotes: number;
    fanVotes: Record<string, FanVoteStatistics>;
  };
}

export interface StatisticsFile {
  schemaVersion: 1;
  updatedAt: string | null;
  packs: Record<string, PackStatistics>;
}

export type StatisticsTransitionAction =
  { type: 'reply'; nodeId: string; choiceId: string } | { type: 'takeout' } | { type: 'advance' };

type RunOutcome = 'abandoned' | 'early-ending' | 'election';

interface ActiveStatisticsRun {
  schemaVersion: 1;
  runId: string;
  storyPackId: string;
  contentVersion: string;
  mode: DisplayMode;
  startedAt: string;
}

interface RemoteStatisticsEvent {
  schemaVersion: 1;
  eventId: string;
  event: 'run_started' | 'run_finished';
  occurredAt: string;
  run: {
    id: string;
    storyPackId: string;
    contentVersion: string;
    mode: DisplayMode;
    startedAt: string;
  };
  result?: {
    outcome: RunOutcome;
    endingId?: string;
    turn?: number;
    currentDay?: number;
    replies?: number;
    expiredReplies?: number;
    takeoutOrders?: number;
    totalVotes?: number;
    popularityVotes?: number;
    achievementIds?: string[];
  };
}

export interface StatisticsDeveloperApi {
  readonly filename: typeof STATISTICS_FILE_NAME;
  read: () => StatisticsFile;
  file: () => Promise<File | undefined>;
  download: () => void;
}

declare global {
  interface Window {
    __CLIP_STATS__?: StatisticsDeveloperApi;
  }
}

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

let mirrorQueue = Promise.resolve();

function emptyStatisticsFile(): StatisticsFile {
  return { schemaVersion: 1, updatedAt: null, packs: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneStatistics(file: StatisticsFile): StatisticsFile {
  return JSON.parse(JSON.stringify(file)) as StatisticsFile;
}

function randomEventId(prefix: 'event' | 'run'): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function readActiveRun(): ActiveStatisticsRun | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.localStorage.getItem(STATISTICS_ACTIVE_RUN_KEY);
    if (!value) return undefined;
    const candidate: unknown = JSON.parse(value);
    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== 1 ||
      typeof candidate.runId !== 'string' ||
      typeof candidate.storyPackId !== 'string' ||
      typeof candidate.contentVersion !== 'string' ||
      (candidate.mode !== 'standard' && candidate.mode !== 'realistic') ||
      typeof candidate.startedAt !== 'string'
    ) {
      return undefined;
    }
    return candidate as unknown as ActiveStatisticsRun;
  } catch {
    return undefined;
  }
}

function persistActiveRun(run: ActiveStatisticsRun | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (run) {
      window.localStorage.setItem(STATISTICS_ACTIVE_RUN_KEY, JSON.stringify(run));
    } else {
      window.localStorage.removeItem(STATISTICS_ACTIVE_RUN_KEY);
    }
  } catch {
    // Remote reporting remains best-effort if the run marker cannot be stored.
  }
}

function sendRemoteStatistics(event: RemoteStatisticsEvent): void {
  if (typeof fetch !== 'function') return;
  void fetch(STATISTICS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    cache: 'no-store',
    credentials: 'omit',
    keepalive: true,
    referrerPolicy: 'no-referrer',
  }).then(
    () => undefined,
    () => undefined,
  );
}

function finishActiveRun(state: GameState | undefined, outcome: RunOutcome): void {
  const run = readActiveRun();
  if (!run) return;
  const result = state
    ? {
        outcome,
        endingId: state.earlyEndingId ?? state.electionResult?.endingId,
        turn: state.turn,
        currentDay: state.currentDay,
        replies: state.replyHistory.length,
        expiredReplies: Object.values(state.resolvedNodes).filter(
          (resolution) => resolution === 'expired',
        ).length,
        takeoutOrders: state.takeoutCount,
        totalVotes: state.electionResult?.totalVotes,
        popularityVotes: state.electionResult?.popularityVotes,
        achievementIds: state.electionResult?.achievementIds,
      }
    : { outcome };
  sendRemoteStatistics({
    schemaVersion: 1,
    eventId: randomEventId('event'),
    event: 'run_finished',
    occurredAt: new Date().toISOString(),
    run: {
      id: run.runId,
      storyPackId: run.storyPackId,
      contentVersion: run.contentVersion,
      mode: run.mode,
      startedAt: run.startedAt,
    },
    result,
  });
  persistActiveRun(undefined);
}

function startActiveRun(pack: StoryPack, mode: DisplayMode): void {
  finishActiveRun(undefined, 'abandoned');
  const startedAt = new Date().toISOString();
  const run: ActiveStatisticsRun = {
    schemaVersion: 1,
    runId: randomEventId('run'),
    storyPackId: pack.id,
    contentVersion: pack.contentVersion,
    mode,
    startedAt,
  };
  persistActiveRun(run);
  sendRemoteStatistics({
    schemaVersion: 1,
    eventId: randomEventId('event'),
    event: 'run_started',
    occurredAt: startedAt,
    run: {
      id: run.runId,
      storyPackId: run.storyPackId,
      contentVersion: run.contentVersion,
      mode: run.mode,
      startedAt: run.startedAt,
    },
  });
}

function packKey(pack: Pick<StoryPack, 'id' | 'contentVersion'>): string {
  return `${pack.id}@${pack.contentVersion}`;
}

function createPackStatistics(pack: Pick<StoryPack, 'id' | 'contentVersion'>): PackStatistics {
  return {
    storyPackId: pack.id,
    contentVersion: pack.contentVersion,
    totals: {
      runsStarted: 0,
      runsAbandoned: 0,
      runsFinished: 0,
      electionFinishes: 0,
      earlyFinishes: 0,
      replies: 0,
      expiredReplies: 0,
      takeoutOrders: 0,
    },
    startedModes: { standard: 0, realistic: 0 },
    endings: {},
    achievements: {},
    nodes: {},
    elections: {
      count: 0,
      totalVotes: 0,
      popularityVotes: 0,
      fanVotes: {},
    },
  };
}

function ensurePack(file: StatisticsFile, pack: StoryPack): PackStatistics {
  const key = packKey(pack);
  return (file.packs[key] ??= createPackStatistics(pack));
}

function ensureNode(packStatistics: PackStatistics, nodeId: string, fanId: string): NodeStatistics {
  return (packStatistics.nodes[nodeId] ??= {
    fanId,
    replies: 0,
    expirations: 0,
    totalReplyDelayTurns: 0,
    choices: {},
  });
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function readStoredStatistics(): StatisticsFile {
  if (typeof window === 'undefined') return emptyStatisticsFile();
  try {
    const value = window.localStorage.getItem(STATISTICS_STORAGE_KEY);
    if (!value) return emptyStatisticsFile();
    const candidate: unknown = JSON.parse(value);
    if (!isRecord(candidate) || candidate.schemaVersion !== 1 || !isRecord(candidate.packs)) {
      return emptyStatisticsFile();
    }
    return candidate as unknown as StatisticsFile;
  } catch {
    return emptyStatisticsFile();
  }
}

export function readStatisticsFile(): StatisticsFile {
  return cloneStatistics(readStoredStatistics());
}

async function getStatisticsDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage) return undefined;
  const storage = navigator.storage as StorageManagerWithDirectory;
  if (!storage.getDirectory) return undefined;
  try {
    return await storage.getDirectory();
  } catch {
    return undefined;
  }
}

async function mirrorStatisticsFile(file: StatisticsFile): Promise<void> {
  const directory = await getStatisticsDirectory();
  if (!directory) return;
  try {
    const handle = await directory.getFileHandle(STATISTICS_FILE_NAME, { create: true });
    const writable = await handle.createWritable();
    await writable.write(`${JSON.stringify(file, null, 2)}\n`);
    await writable.close();
  } catch {
    // LocalStorage remains the compatibility fallback when OPFS is unavailable.
  }
}

function queueStatisticsMirror(file: StatisticsFile): void {
  const snapshot = cloneStatistics(file);
  mirrorQueue = mirrorQueue.then(() => mirrorStatisticsFile(snapshot)).catch(() => undefined);
}

function persistStatisticsFile(file: StatisticsFile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STATISTICS_STORAGE_KEY, JSON.stringify(file));
  } catch {
    // Statistics are deliberately best-effort and never block gameplay or saves.
  }
  queueStatisticsMirror(file);
}

function updateStatistics(
  pack: StoryPack,
  mutate: (packStatistics: PackStatistics) => boolean,
): void {
  const file = readStoredStatistics();
  const currentPack = ensurePack(file, pack);
  if (!mutate(currentPack)) return;
  file.updatedAt = new Date().toISOString();
  persistStatisticsFile(file);
}

function recordEnding(packStatistics: PackStatistics, next: GameState): boolean {
  if (next.status === 'playing') return false;
  const endingId = next.earlyEndingId ?? next.electionResult?.endingId;
  packStatistics.totals.runsFinished += 1;
  if (next.status === 'early-ending') {
    packStatistics.totals.earlyFinishes += 1;
  } else {
    packStatistics.totals.electionFinishes += 1;
  }
  if (endingId) increment(packStatistics.endings, endingId);

  const election = next.electionResult;
  if (!election) return true;
  packStatistics.elections.count += 1;
  packStatistics.elections.totalVotes += election.totalVotes;
  packStatistics.elections.popularityVotes += election.popularityVotes;
  for (const fanResult of election.fanVotes) {
    const fanVotes = (packStatistics.elections.fanVotes[fanResult.fanId] ??= {
      samples: 0,
      totalVotes: 0,
    });
    fanVotes.samples += 1;
    fanVotes.totalVotes += fanResult.votes;
  }
  for (const achievementId of election.achievementIds) {
    increment(packStatistics.achievements, achievementId);
  }
  return true;
}

function recordRecoverableEnding(packStatistics: PackStatistics, next: GameState): boolean {
  if (next.status !== 'early-ending' || !next.earlyEndingId) return false;
  increment(packStatistics.endings, next.earlyEndingId);
  return true;
}

export function recordRunStarted(pack: StoryPack, mode: DisplayMode): void {
  updateStatistics(pack, (packStatistics) => {
    packStatistics.totals.runsStarted += 1;
    packStatistics.startedModes[mode] += 1;
    return true;
  });
  startActiveRun(pack, mode);
}

export function recordRunAbandoned(pack: StoryPack, state: GameState | undefined): void {
  if (!state || state.status !== 'playing') return;
  updateStatistics(pack, (packStatistics) => {
    packStatistics.totals.runsAbandoned += 1;
    return true;
  });
  finishActiveRun(state, 'abandoned');
}

export function recordGameTransition(
  pack: StoryPack,
  previous: GameState,
  next: GameState,
  action: StatisticsTransitionAction,
): void {
  updateStatistics(pack, (packStatistics) => {
    let changed = false;

    if (action.type === 'reply') {
      const node = pack.nodes.find((candidate) => candidate.id === action.nodeId);
      if (
        node &&
        previous.resolvedNodes[action.nodeId] === undefined &&
        next.resolvedNodes[action.nodeId] === action.choiceId
      ) {
        const nodeStatistics = ensureNode(packStatistics, node.id, node.fanId);
        const reply = [...next.replyHistory].reverse().find((entry) => entry.nodeId === node.id);
        nodeStatistics.replies += 1;
        nodeStatistics.totalReplyDelayTurns += reply?.delayTurns ?? 0;
        increment(nodeStatistics.choices, action.choiceId);
        packStatistics.totals.replies += 1;
        changed = true;
      }
    }

    if (action.type === 'takeout') {
      const orders = Math.max(0, next.takeoutCount - previous.takeoutCount);
      if (orders > 0) {
        packStatistics.totals.takeoutOrders += orders;
        changed = true;
      }
    }

    if (action.type === 'advance') {
      for (const [nodeId, resolution] of Object.entries(next.resolvedNodes)) {
        if (resolution !== 'expired' || previous.resolvedNodes[nodeId] === 'expired') continue;
        const node = pack.nodes.find((candidate) => candidate.id === nodeId);
        if (!node) continue;
        ensureNode(packStatistics, node.id, node.fanId).expirations += 1;
        packStatistics.totals.expiredReplies += 1;
        changed = true;
      }
    }

    if (previous.status === 'playing' && next.status === 'early-ending') {
      changed = recordRecoverableEnding(packStatistics, next) || changed;
    } else if (previous.status === 'playing' && next.status === 'election') {
      changed = recordEnding(packStatistics, next) || changed;
    }
    return changed;
  });
  if (previous.status === 'playing' && next.status === 'election') {
    finishActiveRun(next, 'election');
  }
}

export async function readStatisticsOriginFile(): Promise<File | undefined> {
  const directory = await getStatisticsDirectory();
  if (!directory) return undefined;
  try {
    const handle = await directory.getFileHandle(STATISTICS_FILE_NAME);
    return await handle.getFile();
  } catch {
    return undefined;
  }
}

export function downloadStatisticsFile(): void {
  if (typeof document === 'undefined') return;
  const contents = `${JSON.stringify(readStatisticsFile(), null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = STATISTICS_FILE_NAME;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function installStatisticsDeveloperApi(): void {
  if (typeof window === 'undefined') return;
  const api: StatisticsDeveloperApi = Object.freeze({
    filename: STATISTICS_FILE_NAME,
    read: readStatisticsFile,
    file: readStatisticsOriginFile,
    download: downloadStatisticsFile,
  });
  Object.defineProperty(window, '__CLIP_STATS__', {
    value: api,
    configurable: true,
    enumerable: false,
  });
}
