import type { ProfileNameKind, ProfileNamePools } from './types';

export interface ProfileNameDraw {
  name: string;
  kind: ProfileNameKind;
  drawNumber: number;
}

export interface ProfileNamePicker {
  next: (currentName?: string) => ProfileNameDraw | undefined;
}

export type ProfileNameRandomSource = () => number;

export interface ProfileNamePickerOptions {
  /** Already displayed adapted suggestions from the three-draw warmup. */
  warmupDrawsCompleted?: number;
  lastGeneratedName?: string;
  /** Suggestions already shown before this picker instance was created. */
  suggestedNames?: string[];
}

const POST_WARMUP_KIND_BLOCK: ProfileNameKind[] = [
  'adapted',
  'adapted',
  'original',
  'original',
  'original',
];

function boundedRandomIndex(length: number, random: ProfileNameRandomSource): number {
  const sampled = random();
  const value = Number.isFinite(sampled) ? sampled : 0;
  return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
}

function shuffle<T>(values: readonly T[], random: ProfileNameRandomSource): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = boundedRandomIndex(index + 1, random);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function normalizeNames(names: readonly string[]): string[] {
  return names.map((name) => name.trim()).filter(Boolean);
}

/**
 * Creates one constrained suggestion sequence.
 *
 * The first three draws use adapted names. Afterwards, every aligned five-draw
 * block is a shuffled bag containing two adapted and three original names.
 * Name bags are shuffled independently and avoid an immediate repeat whenever
 * the selected pool contains an alternative.
 */
export function createProfileNamePicker(
  pools: ProfileNamePools,
  random: ProfileNameRandomSource = Math.random,
  options: ProfileNamePickerOptions = {},
): ProfileNamePicker {
  const normalizedPools: Record<ProfileNameKind, string[]> = {
    adapted: normalizeNames(pools.adapted),
    original: normalizeNames(pools.original),
  };
  const nameBags: Record<ProfileNameKind, string[]> = {
    adapted: [],
    original: [],
  };
  let remainingKinds: ProfileNameKind[] = [];
  let drawCount = Math.min(3, Math.max(0, Math.floor(options.warmupDrawsCompleted ?? 0)));
  let lastGeneratedName = options.lastGeneratedName?.trim() ?? '';
  const suggestedNames = new Set(
    [...(options.suggestedNames ?? []), lastGeneratedName]
      .map((name) => name.trim())
      .filter(Boolean),
  );

  const nextPreferredKind = (): ProfileNameKind => {
    if (drawCount < 3) return 'adapted';
    if (remainingKinds.length === 0) {
      remainingKinds = shuffle(POST_WARMUP_KIND_BLOCK, random);
    }
    return remainingKinds.shift()!;
  };

  const drawName = (kind: ProfileNameKind, currentName: string): string | undefined => {
    const pool = normalizedPools[kind];
    if (pool.length === 0) return undefined;
    if (nameBags[kind].length === 0) nameBags[kind] = shuffle(pool, random);

    const excluded = new Set(
      [currentName.trim(), lastGeneratedName, ...suggestedNames].filter(Boolean),
    );
    let candidateIndex = nameBags[kind].findIndex((name) => !excluded.has(name));

    if (candidateIndex < 0 && pool.some((name) => !excluded.has(name))) {
      nameBags[kind] = shuffle(pool, random);
      candidateIndex = nameBags[kind].findIndex((name) => !excluded.has(name));
    }
    if (candidateIndex < 0) {
      suggestedNames.clear();
      const immediateExcluded = new Set([currentName.trim(), lastGeneratedName].filter(Boolean));
      candidateIndex = nameBags[kind].findIndex((name) => !immediateExcluded.has(name));
    }
    if (candidateIndex < 0) {
      candidateIndex = nameBags[kind].findIndex((name) => name !== currentName.trim());
    }
    if (candidateIndex < 0) candidateIndex = 0;

    return nameBags[kind].splice(candidateIndex, 1)[0];
  };

  return {
    next(currentName = '') {
      const preferredKind = nextPreferredKind();
      const fallbackKind: ProfileNameKind = preferredKind === 'adapted' ? 'original' : 'adapted';
      const preferredName = drawName(preferredKind, currentName);
      const kind = preferredName ? preferredKind : fallbackKind;
      const name = preferredName ?? drawName(fallbackKind, currentName);
      if (!name) return undefined;

      drawCount += 1;
      lastGeneratedName = name;
      suggestedNames.add(name);
      return { name, kind, drawNumber: drawCount };
    },
  };
}
