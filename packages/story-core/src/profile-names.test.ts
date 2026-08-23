import { describe, expect, it } from 'vitest';
import { createProfileNamePicker } from './profile-names';
import type { ProfileNamePools } from './types';

const pools: ProfileNamePools = {
  adapted: Array.from({ length: 20 }, (_, index) => `改编${index + 1}`),
  original: Array.from({ length: 20 }, (_, index) => `原创${index + 1}`),
};

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe('profile name picker', () => {
  it('uses adapted names for the first three draws', () => {
    const picker = createProfileNamePicker(pools, sequenceRandom([0.13, 0.81, 0.37]));
    const draws = Array.from({ length: 3 }, () => picker.next());

    expect(draws.map((draw) => draw?.kind)).toEqual(['adapted', 'adapted', 'adapted']);
    expect(new Set(draws.map((draw) => draw?.name)).size).toBe(3);
    expect(draws.map((draw) => draw?.drawNumber)).toEqual([1, 2, 3]);
  });

  it('continues after an already displayed automatic warmup suggestion', () => {
    const picker = createProfileNamePicker(pools, sequenceRandom([0.41, 0.73]), {
      warmupDrawsCompleted: 1,
      lastGeneratedName: '改编1',
      suggestedNames: ['改编1'],
    });

    const nextTwo = [picker.next(), picker.next()];
    expect(nextTwo[0]).toMatchObject({ kind: 'adapted', drawNumber: 2 });
    expect(nextTwo[1]).toMatchObject({ kind: 'adapted', drawNumber: 3 });
    expect(nextTwo.map((draw) => draw?.name)).not.toContain('改编1');
  });

  it('places exactly two adapted names in every later five-draw block', () => {
    const picker = createProfileNamePicker(pools, sequenceRandom([0.91, 0.07, 0.64, 0.28]));
    const draws = Array.from({ length: 28 }, () => picker.next()!);

    for (let start = 3; start < draws.length; start += 5) {
      const block = draws.slice(start, start + 5);
      expect(block).toHaveLength(5);
      expect(block.filter((draw) => draw.kind === 'adapted')).toHaveLength(2);
      expect(block.filter((draw) => draw.kind === 'original')).toHaveLength(3);
    }
  });

  it('does not immediately repeat a generated or currently typed name', () => {
    const picker = createProfileNamePicker(pools, sequenceRandom([0.99, 0.01, 0.52]));
    let currentName = pools.adapted[0]!;

    for (let index = 0; index < 80; index += 1) {
      const draw = picker.next(currentName)!;
      expect(draw.name).not.toBe(currentName);
      currentName = draw.name;
    }
  });

  it('falls back safely while an editor has a temporarily empty pool', () => {
    const picker = createProfileNamePicker(
      { adapted: [], original: ['临时原创名'] },
      sequenceRandom([0.5]),
    );

    expect(picker.next()).toMatchObject({ name: '临时原创名', kind: 'original', drawNumber: 1 });
  });

  it('uses only adapted names when the original pool is empty', () => {
    const picker = createProfileNamePicker(
      { adapted: pools.adapted, original: [] },
      sequenceRandom([0.83, 0.17, 0.61]),
    );
    const draws = Array.from({ length: 40 }, () => picker.next()!);

    expect(draws.every((draw) => draw.kind === 'adapted')).toBe(true);
    expect(draws.every((draw) => pools.adapted.includes(draw.name))).toBe(true);
  });
});
