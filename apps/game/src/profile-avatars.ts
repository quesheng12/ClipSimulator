export interface ProfileAvatarOption {
  id: string;
  src: string;
  label: string;
}

export const PROFILE_AVATARS: readonly ProfileAvatarOption[] = [
  { id: 'cafe', src: '/assets/avatars/profile-cafe.webp', label: '窗边侧颜' },
  { id: 'lamb', src: '/assets/avatars/profile-lamb.webp', label: '抱抱小羊' },
  { id: 'breeze', src: '/assets/avatars/profile-breeze.webp', label: '春日回头' },
  { id: 'kitten', src: '/assets/avatars/profile-kitten.webp', label: '包里小猫' },
  { id: 'poodle', src: '/assets/avatars/profile-poodle.webp', label: '歪头小狗' },
  { id: 'bunny', src: '/assets/avatars/profile-bunny.webp', label: '耳机兔兔' },
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
