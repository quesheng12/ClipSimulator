import type { ReactNode } from 'react';
import { BatteryCharging, Heart, Smile, Users } from 'lucide-react';
import { fanAvatarSrc } from '@clip/story-core/fan-avatars';
import type { FanDefinition, GameState, Resources, StoryPack } from '@clip/story-core/types';

export function affinityLabel(value: number): string {
  if (value >= 90) return '全力奔赴';
  if (value >= 75) return '非常亲近';
  if (value >= 50) return '稳定支持';
  if (value >= 25) return '仍在观望';
  return '渐行渐远';
}

type AvatarIdentity = Pick<FanDefinition, 'avatarId' | 'accent'>;

export function FanAvatar({
  fan,
  small = false,
  muted = false,
}: {
  fan: AvatarIdentity;
  small?: boolean;
  muted?: boolean;
}) {
  const sizeClass = small ? 'fan-avatar fan-avatar--small' : 'fan-avatar';
  const className = muted ? `${sizeClass} fan-avatar--muted` : sizeClass;
  return (
    <span
      className={className}
      style={{ '--fan-accent': fan.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <img
        src={fanAvatarSrc(fan.avatarId, import.meta.env.BASE_URL)}
        alt=""
        width={512}
        height={512}
      />
    </span>
  );
}

export function FanTags({ tags, compact = false }: { tags: string[]; compact?: boolean }) {
  return (
    <span className={compact ? 'fan-tag-list fan-tag-list--compact' : 'fan-tag-list'}>
      {tags.map((tag) => (
        <span className="fan-tag" key={tag}>
          {tag}
        </span>
      ))}
    </span>
  );
}

function Meter({
  icon,
  label,
  value,
  max,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  max: number;
  tone: 'energy' | 'mindset';
}) {
  const percentage = Math.round((value / max) * 100);
  return (
    <div className={`resource-meter resource-meter--${tone}`}>
      <div className="resource-meter__label">
        <span>
          {icon}
          {label}
        </span>
        <strong>{value}</strong>
      </div>
      <div
        className="resource-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function ResourcePanel({ resources, max }: { resources: Resources; max: Resources }) {
  return (
    <div className="resource-panel" aria-label="当前状态">
      <Meter
        icon={<BatteryCharging size={15} aria-hidden="true" />}
        label="精力"
        value={resources.energy}
        max={max.energy}
        tone="energy"
      />
      <Meter
        icon={<Smile size={15} aria-hidden="true" />}
        label="心情"
        value={resources.mindset}
        max={max.mindset}
        tone="mindset"
      />
    </div>
  );
}

export function DayRail({ state, pack }: { state: GameState; pack: StoryPack }) {
  const percentage = Math.min(100, Math.round((state.currentDay / pack.config.totalDays) * 100));
  return (
    <div className="day-rail" aria-label={`总选倒计时，第 ${state.currentDay} 日`}>
      <div className="day-rail__topline">
        <span>总选前营业日记</span>
        <strong>
          第 {state.turn} / {pack.config.maxTurns} 回合
        </strong>
      </div>
      <div className="day-rail__bar">
        <span className="day-rail__fill" style={{ width: `${percentage}%` }} />
        <span className="day-rail__stamp" style={{ left: `${percentage}%` }}>
          Day {state.currentDay}
        </span>
      </div>
      <div className="day-rail__ticks" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
    </div>
  );
}

export function CompactStats({ state }: { state: GameState }) {
  return (
    <div className="compact-stats">
      <span>
        <Users size={15} aria-hidden="true" /> 泛人气 <strong>{state.popularity}</strong>
      </span>
      <span>
        <Heart size={15} aria-hidden="true" /> 核心粉丝{' '}
        <strong>{Object.keys(state.affinity).length}</strong>
      </span>
    </div>
  );
}
