import { publicAssetSrc } from './asset-paths';

export const FAN_AVATAR_IDS = [
  'fan-yuzu',
  'fan-salt',
  'fan-lighthouse',
  'fan-battery',
  'fan-callsticks',
  'fan-milktea',
  'fan-subway',
  'fan-desk',
  'fan-opera-glasses',
  'fan-loading-charm',
  'fan-snowman-mic',
  'fan-star-lightstick',
  'fan-office-goldfish',
  'fan-sleepy-owl',
  'fan-vote-abacus',
  'fan-last-train',
  'fan-shiba',
  'fan-river-notebook',
  'fan-instant-camera',
] as const;

export type FanAvatarId = (typeof FAN_AVATAR_IDS)[number];

export function fanAvatarSrc(avatarId: FanAvatarId, baseUrl = '/'): string {
  return publicAssetSrc(`/assets/avatars/${avatarId}.webp`, baseUrl);
}
