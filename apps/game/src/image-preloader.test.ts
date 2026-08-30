import { describe, expect, it } from 'vitest';
import { uniqueImageSources } from './image-preloader';

describe('uniqueImageSources', () => {
  it('removes blank and duplicate preload entries while preserving priority order', () => {
    expect(
      uniqueImageSources([
        '/assets/endings/ending.webp',
        '/assets/takeout/meal.jpg',
        '/assets/endings/ending.webp',
        '',
        '   ',
      ]),
    ).toEqual(['/assets/endings/ending.webp', '/assets/takeout/meal.jpg']);
  });
});
