import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BatteryCharging, Heart, Smile, Users } from 'lucide-react';
import { fanAvatarSrc } from '@clip/story-core/fan-avatars';
import type { FanDefinition, GameState, Resources, StoryPack } from '@clip/story-core/types';

const HOLD_TO_CONFIRM_DURATION_MS = 1_500;

export function HoldToConfirmButton({
  onConfirm,
  idleLabel,
  holdingLabel = '继续按住…',
  className = '',
  describedBy,
  children,
}: {
  onConfirm: () => void;
  idleLabel: string;
  holdingLabel?: string;
  className?: string;
  describedBy?: string;
  children?: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const activeRef = useRef(false);
  const startedAtRef = useRef(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const confirmRef = useRef(onConfirm);
  const pointerIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    confirmRef.current = onConfirm;
  }, [onConfirm]);

  const cancelHold = useCallback(() => {
    activeRef.current = false;
    pointerIdRef.current = undefined;
    if (animationFrameRef.current !== undefined) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  const updateHold = useCallback(function updateHoldFrame(now: number) {
    if (!activeRef.current) return;
    const nextProgress = Math.min(1, (now - startedAtRef.current) / HOLD_TO_CONFIRM_DURATION_MS);
    setProgress(nextProgress);
    if (nextProgress < 1) {
      animationFrameRef.current = requestAnimationFrame(updateHoldFrame);
      return;
    }

    activeRef.current = false;
    pointerIdRef.current = undefined;
    animationFrameRef.current = undefined;
    setHolding(false);
    confirmRef.current();
  }, []);

  const beginHold = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    startedAtRef.current = performance.now();
    setProgress(0);
    setHolding(true);
    animationFrameRef.current = requestAnimationFrame(updateHold);
  }, [updateHold]);

  useEffect(() => cancelHold, [cancelHold]);

  const buttonClassName = [
    'button',
    'button--wide',
    'hold-confirm-button',
    holding ? 'is-holding' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={buttonClassName}
      aria-label={idleLabel}
      aria-describedby={describedBy}
      aria-busy={holding}
      data-holding={holding ? 'true' : 'false'}
      style={{ '--hold-progress': progress } as React.CSSProperties}
      onClick={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        beginHold();
      }}
      onPointerMove={(event) => {
        if (!activeRef.current || pointerIdRef.current !== event.pointerId) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const isOutside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (isOutside) cancelHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onLostPointerCapture={cancelHold}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          beginHold();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          cancelHold();
        }
      }}
      onBlur={cancelHold}
    >
      <span className="hold-confirm-button__fill" aria-hidden="true" />
      <span className="hold-confirm-button__content">
        {children}
        <span aria-live="polite">{holding ? holdingLabel : idleLabel}</span>
      </span>
    </button>
  );
}

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
        <strong className="resource-meter__value" key={`${tone}-${value}`}>
          {value}
        </strong>
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
