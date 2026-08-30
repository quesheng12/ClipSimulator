import { describe, expect, it } from 'vitest';
import { publicAssetSrc } from './asset-paths';

describe('publicAssetSrc', () => {
  it('joins root-relative assets to a deployment base path', () => {
    expect(publicAssetSrc('/assets/avatar.webp', '/ClipSimulator/')).toBe(
      '/ClipSimulator/assets/avatar.webp',
    );
  });

  it('supports relative application bases', () => {
    expect(publicAssetSrc('/assets/avatar.webp', './')).toBe('./assets/avatar.webp');
  });

  it('leaves external URLs unchanged', () => {
    expect(publicAssetSrc('https://cdn.example.com/avatar.webp', '/ClipSimulator/')).toBe(
      'https://cdn.example.com/avatar.webp',
    );
  });
});
