import type { DisplayMode, GameState, PlayerProfile, StoryPack } from '@clip/story-core/types';
import { isCompatibleSave } from '@clip/story-core/engine';
import { normalizeProfileAvatarId } from './profile-avatars';

const SAVE_KEY = 'clip-simulator:save:v1';
const META_KEY = 'clip-simulator:meta:v1';
const MODE_KEY = 'clip-simulator:display-mode:v1';
const PROFILE_KEY = 'clip-simulator:player-profile:v1';
const EARLY_ENDING_CHECKPOINT_KEY = 'clip-simulator:early-ending-checkpoint:v1';

let memoryProfile: PlayerProfile | undefined;
let memoryEarlyEndingCheckpoint: GameState | undefined;

export interface PlayerMeta {
  endingIds: string[];
  achievementIds: string[];
}

const emptyMeta: PlayerMeta = { endingIds: [], achievementIds: [] };

function readJson(key: string): unknown {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSave(pack: StoryPack): GameState | undefined {
  const candidate = readJson(SAVE_KEY);
  if (!candidate || typeof candidate !== 'object') return undefined;
  const state = candidate as GameState;
  return isCompatibleSave(state, pack) ? state : undefined;
}

export function persistSave(state: GameState): boolean {
  return writeJson(SAVE_KEY, state);
}

export function loadEarlyEndingCheckpoint(pack: StoryPack): GameState | undefined {
  const candidate = readJson(EARLY_ENDING_CHECKPOINT_KEY) ?? memoryEarlyEndingCheckpoint;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const state = candidate as GameState;
  return state.status === 'playing' && isCompatibleSave(state, pack) ? state : undefined;
}

export function persistEarlyEndingCheckpoint(state: GameState): boolean {
  memoryEarlyEndingCheckpoint = state;
  return writeJson(EARLY_ENDING_CHECKPOINT_KEY, state);
}

export function clearEarlyEndingCheckpoint(): void {
  memoryEarlyEndingCheckpoint = undefined;
  try {
    window.localStorage.removeItem(EARLY_ENDING_CHECKPOINT_KEY);
  } catch {
    // The in-memory checkpoint has still been cleared.
  }
}

export function loadMode(): DisplayMode {
  return readJson(MODE_KEY) === 'realistic' ? 'realistic' : 'standard';
}

export function persistMode(mode: DisplayMode): boolean {
  return writeJson(MODE_KEY, mode);
}

function isValidProfile(value: unknown, pack: StoryPack): value is PlayerProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlayerProfile>;
  return (
    typeof candidate.idolName === 'string' &&
    candidate.idolName.trim().length > 0 &&
    candidate.idolName.trim().length <= 16 &&
    typeof candidate.teamId === 'string' &&
    pack.profileSetup.teams.some((team) => team.id === candidate.teamId)
  );
}

export function loadProfile(pack: StoryPack): PlayerProfile | undefined {
  const candidate = readJson(PROFILE_KEY) ?? memoryProfile;
  if (!isValidProfile(candidate, pack)) return undefined;
  return {
    idolName: candidate.idolName.trim(),
    teamId: candidate.teamId,
    avatarId: normalizeProfileAvatarId(candidate.avatarId),
  };
}

export function persistProfile(profile: PlayerProfile): boolean {
  memoryProfile = profile;
  return writeJson(PROFILE_KEY, profile);
}

export function clearSave(): void {
  clearEarlyEndingCheckpoint();
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // The current in-memory run can still continue when storage is unavailable.
  }
}

export function loadMeta(): PlayerMeta {
  const candidate = readJson(META_KEY);
  if (!candidate || typeof candidate !== 'object') return emptyMeta;
  const meta = candidate as Partial<PlayerMeta>;
  return {
    endingIds: Array.isArray(meta.endingIds) ? meta.endingIds : [],
    achievementIds: Array.isArray(meta.achievementIds) ? meta.achievementIds : [],
  };
}

export function persistMeta(meta: PlayerMeta): boolean {
  return writeJson(META_KEY, meta);
}

export function mergeMeta(meta: PlayerMeta, state: GameState): PlayerMeta {
  const endingId = state.earlyEndingId ?? state.electionResult?.endingId;
  return {
    endingIds: [...new Set([...meta.endingIds, ...(endingId ? [endingId] : [])])],
    achievementIds: [
      ...new Set([...meta.achievementIds, ...(state.electionResult?.achievementIds ?? [])]),
    ],
  };
}
