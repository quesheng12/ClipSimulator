import { publicAssetSrc } from '@clip/story-core/asset-paths';

export interface ProfileAvatarOption {
  id: string;
  src: string;
  label: string;
}

export const PROFILE_AVATARS: readonly ProfileAvatarOption[] = [
  {
    id: 'cafe',
    src: publicAssetSrc('/assets/avatars/profile-cafe.webp', import.meta.env.BASE_URL),
    label: '窗边侧颜',
  },
  {
    id: 'lamb',
    src: publicAssetSrc('/assets/avatars/profile-lamb.webp', import.meta.env.BASE_URL),
    label: '抱抱小羊',
  },
  {
    id: 'breeze',
    src: publicAssetSrc('/assets/avatars/profile-breeze.webp', import.meta.env.BASE_URL),
    label: '春日回头',
  },
  {
    id: 'kitten',
    src: publicAssetSrc('/assets/avatars/profile-kitten.webp', import.meta.env.BASE_URL),
    label: '包里小猫',
  },
  {
    id: 'poodle',
    src: publicAssetSrc('/assets/avatars/profile-poodle.webp', import.meta.env.BASE_URL),
    label: '歪头小狗',
  },
  {
    id: 'bunny',
    src: publicAssetSrc('/assets/avatars/profile-bunny.webp', import.meta.env.BASE_URL),
    label: '耳机兔兔',
  },
];

export const DEFAULT_PROFILE_AVATAR_ID = PROFILE_AVATARS[0]!.id;

export function profileAvatarForId(id?: string): ProfileAvatarOption {
  return PROFILE_AVATARS.find((avatar) => avatar.id === id) ?? PROFILE_AVATARS[0]!;
}

export function normalizeProfileAvatarId(value: unknown): string {
  return typeof value === 'string' && PROFILE_AVATARS.some((avatar) => avatar.id === value)
    ? value
    : DEFAULT_PROFILE_AVATAR_ID;
}
