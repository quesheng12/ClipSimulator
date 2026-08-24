import * as RadixSelect from '@radix-ui/react-select';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowRight,
  BatteryCharging,
  Bell,
  ChevronLeft,
  ChevronRight,
  Check,
  CircleHelp,
  Clock3,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Gift,
  HeartHandshake,
  House,
  LockKeyhole,
  MessageCircleMore,
  Settings,
  Smile,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Minus,
  RotateCcw,
  Star,
  Trophy,
  UserRound,
  UsersRound,
  Utensils,
  Video,
  X,
} from 'lucide-react';
import {
  advanceTurn,
  canAfford,
  createInitialGame,
  getCurrentTurnEvent,
  getPendingNodes,
  orderTakeout,
  replyToNode,
} from '@clip/story-core/engine';
import { createProfileNamePicker } from '@clip/story-core/profile-names';
import type {
  DisplayMode,
  FanDefinition,
  GameState,
  PlayerProfile,
  StoryChoice,
  StoryNode,
  StoryPack,
  TeamDefinition,
} from '@clip/story-core/types';
import { buildTemplateVariables, resolveStoryPackTemplates } from '@clip/story-core/templates';
import { affinityLabel, FanAvatar, FanTags, ResourcePanel } from './components';
import {
  getBackgroundConversationHistory,
  getBackgroundParticipant,
  getCoreConversationHistory,
  getCoreParticipant,
  getRepliedConversations,
  type ConversationExchange,
  type ConversationParticipant,
} from './conversations';
import { storyPack } from './content';
import { DEFAULT_PROFILE_AVATAR_ID, PROFILE_AVATARS, profileAvatarForId } from './profile-avatars';
import { recordGameTransition, recordRunAbandoned, recordRunStarted } from './statistics';
import {
  clearSave,
  clearEarlyEndingCheckpoint,
  loadEarlyEndingCheckpoint,
  loadMeta,
  loadMode,
  loadProfile,
  loadSave,
  mergeMeta,
  persistMeta,
  persistMode,
  persistEarlyEndingCheckpoint,
  persistProfile,
  persistSave,
  type PlayerMeta,
} from './storage';

type View =
  | { name: 'menu' }
  | { name: 'workbench' }
  | {
      name: 'conversation';
      kind: 'core' | 'background';
      participantId: string;
      replyNodeId?: string;
    }
  | { name: 'result'; nodeId: string; choiceId: string }
  | { name: 'ending' };

const TAKEOUT_SHOPS = [
  {
    name: '鸡柳大人',
    image: '/assets/takeout/fried-takeout.jpg',
    imageAlt: '装在纸质外带餐盒里的炸鸡',
  },
  {
    name: '椰子鸡',
    image: '/assets/takeout/asian-takeout.jpg',
    imageAlt: '装在一次性餐盒里的鸡肉和面食',
  },
  {
    name: '麻辣烫',
    image: '/assets/takeout/malatang-takeout.jpg',
    imageAlt: '装在单人外卖碗里的热汤和面食',
  },
  {
    name: '聚湘缘',
    image: '/assets/takeout/asian-takeout.jpg',
    imageAlt: '装在一次性餐盒里的鸡肉和面食',
  },
  {
    name: 'KFC',
    image: '/assets/takeout/fried-takeout.jpg',
    imageAlt: '装在纸质外带餐盒里的炸鸡',
  },
  {
    name: '麦麦',
    image: '/assets/takeout/fried-takeout.jpg',
    imageAlt: '装在纸质外带餐盒里的炸鸡',
  },
  {
    name: '塔斯汀',
    image: '/assets/takeout/fried-takeout.jpg',
    imageAlt: '装在纸质外带餐盒里的炸鸡',
  },
] as const;

type TakeoutShop = (typeof TAKEOUT_SHOPS)[number];

interface TakeoutReceipt {
  shop: TakeoutShop;
  energyRecovery: number;
  moodRecovery: number;
}

function pickTakeoutShop(): TakeoutShop {
  return TAKEOUT_SHOPS[Math.floor(Math.random() * TAKEOUT_SHOPS.length)] ?? TAKEOUT_SHOPS[0];
}

type NavigationState = {
  version: 1;
  view: View;
  settingsOpen: boolean;
  depth: number;
};

const NAVIGATION_STATE_KEY = 'clipSimulatorNavigation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseView(value: unknown): View | undefined {
  if (!isRecord(value) || typeof value.name !== 'string') return undefined;
  if (value.name === 'menu' || value.name === 'ending') {
    return { name: value.name };
  }
  if (value.name === 'workbench') {
    return { name: 'workbench' };
  }
  if (
    value.name === 'conversation' &&
    (value.kind === 'core' || value.kind === 'background') &&
    typeof value.participantId === 'string'
  ) {
    return {
      name: 'conversation',
      kind: value.kind,
      participantId: value.participantId,
      replyNodeId: typeof value.replyNodeId === 'string' ? value.replyNodeId : undefined,
    };
  }
  // Browser history created by the earlier single-message screen remains usable.
  if (value.name === 'reply' && typeof value.nodeId === 'string') {
    const node = storyPack.nodes.find((candidate) => candidate.id === value.nodeId);
    if (!node) return undefined;
    return {
      name: 'conversation',
      kind: 'core',
      participantId: node.fanId,
      replyNodeId: node.id,
    };
  }
  if (
    value.name === 'result' &&
    typeof value.nodeId === 'string' &&
    typeof value.choiceId === 'string'
  ) {
    return { name: 'result', nodeId: value.nodeId, choiceId: value.choiceId };
  }
  return undefined;
}

function readNavigationState(value: unknown): NavigationState | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[NAVIGATION_STATE_KEY];
  if (!isRecord(candidate) || candidate.version !== 1) return undefined;
  const view = parseView(candidate.view);
  if (!view || !Number.isInteger(candidate.depth) || (candidate.depth as number) < 0) {
    return undefined;
  }
  return {
    version: 1,
    view,
    settingsOpen: candidate.settingsOpen === true && view.name === 'menu',
    depth: candidate.depth as number,
  };
}

function withNavigationState(navigation: NavigationState): Record<string, unknown> {
  const current = isRecord(window.history.state) ? window.history.state : {};
  return { ...current, [NAVIGATION_STATE_KEY]: navigation };
}

function normalizeNavigation(navigation: NavigationState, state?: GameState): NavigationState {
  const fallback = (view: View): NavigationState => ({
    ...navigation,
    view,
    settingsOpen: false,
  });

  if (navigation.view.name === 'menu') return navigation;
  if (!state) return fallback({ name: 'menu' });
  if (state.status !== 'playing') {
    return navigation.view.name === 'ending' ? navigation : fallback({ name: 'ending' });
  }
  if (navigation.view.name === 'ending') {
    return fallback({ name: 'workbench' });
  }
  if (navigation.view.name === 'conversation') {
    const conversationView = navigation.view;
    if (conversationView.kind === 'core') {
      const fan = storyPack.fans.find(
        (candidate) => candidate.id === conversationView.participantId,
      );
      const replyNode = conversationView.replyNodeId
        ? storyPack.nodes.find((node) => node.id === conversationView.replyNodeId)
        : undefined;
      const validPending =
        replyNode !== undefined &&
        replyNode.fanId === conversationView.participantId &&
        state.pendingNodeIds.includes(replyNode.id);
      const hasAnsweredHistory = storyPack.nodes.some(
        (node) =>
          node.fanId === conversationView.participantId &&
          Object.prototype.hasOwnProperty.call(state.resolvedNodes, node.id),
      );
      const hasPastHistory = (fan?.pastChats.length ?? 0) > 0;
      if (
        !fan ||
        (conversationView.replyNodeId ? !validPending : !hasAnsweredHistory && !hasPastHistory)
      ) {
        return fallback({ name: 'workbench' });
      }
    } else {
      const hasVisibleHistory = storyPack.backgroundFlips.some(
        (flip) =>
          (flip.contactId ?? flip.fanName) === conversationView.participantId &&
          flip.day <= state.currentDay,
      );
      if (!hasVisibleHistory) return fallback({ name: 'workbench' });
    }
  }
  if (
    navigation.view.name === 'result' &&
    state.resolvedNodes[navigation.view.nodeId] !== navigation.view.choiceId
  ) {
    return fallback({ name: 'workbench' });
  }
  return navigation;
}

const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

function fanById(pack: StoryPack, fanId: string): FanDefinition {
  return pack.fans.find((fan) => fan.id === fanId)!;
}

function teamForProfile(pack: StoryPack, profile: PlayerProfile) {
  return (
    pack.profileSetup.teams.find((team) => team.id === profile.teamId) ??
    pack.profileSetup.teams[0]!
  );
}

function TeamMark({ team, active = false }: { team: TeamDefinition; active?: boolean }) {
  return (
    <span
      className={`team-mark${active ? ' is-active' : ''}`}
      style={{ '--team-color': team.color } as CSSProperties}
      aria-hidden="true"
    >
      <b>{team.mark}</b>
      <i />
    </span>
  );
}

function TeamSelect({
  id,
  teams,
  value,
  compact = false,
  portalContainer,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  teams: TeamDefinition[];
  value: string;
  compact?: boolean;
  portalContainer?: HTMLElement | null;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const selected = teams.find((team) => team.id === value) ?? teams[0];
  const selectContent = (
    <RadixSelect.Content className="team-select-content" position="popper" sideOffset={6}>
      <RadixSelect.Viewport className="team-select-viewport">
        {teams.map((team) => (
          <RadixSelect.Item className="team-select-item" key={team.id} value={team.id}>
            <TeamMark team={team} />
            <RadixSelect.ItemText>{team.name}</RadixSelect.ItemText>
            <span className="team-select-item__short">{team.shortName}</span>
            <RadixSelect.ItemIndicator className="team-select-item__check">
              <Check size={16} aria-hidden="true" />
            </RadixSelect.ItemIndicator>
          </RadixSelect.Item>
        ))}
      </RadixSelect.Viewport>
    </RadixSelect.Content>
  );
  return (
    <div className="team-picker">
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger
          id={id}
          className="team-select-trigger"
          aria-invalid={invalid}
          aria-describedby={describedBy}
        >
          {selected && <TeamMark team={selected} active />}
          <span className="team-select-trigger__copy">
            <RadixSelect.Value />
            {!compact && <small>{selected?.shortName} · 之后仍可在设置中修改</small>}
          </span>
          <RadixSelect.Icon className="team-select-trigger__icon">
            <ChevronRight size={18} aria-hidden="true" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal container={portalContainer ?? undefined}>
          {selectContent}
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}

function ProfileForm({
  pack,
  profile,
  idPrefix,
  submitLabel,
  compact = false,
  selectPortalContainer,
  onSubmit,
}: {
  pack: StoryPack;
  profile?: PlayerProfile;
  idPrefix: string;
  submitLabel: string;
  compact?: boolean;
  selectPortalContainer?: HTMLElement | null;
  onSubmit: (profile: PlayerProfile) => void;
}) {
  const [initialIdolName] = useState(
    () =>
      profile?.idolName ?? createProfileNamePicker(pack.profileSetup.namePools).next()?.name ?? '',
  );
  const namePicker = useMemo(
    () =>
      createProfileNamePicker(pack.profileSetup.namePools, Math.random, {
        warmupDrawsCompleted: profile ? 0 : 1,
        lastGeneratedName: profile ? undefined : initialIdolName,
        suggestedNames: profile ? undefined : [initialIdolName],
      }),
    [initialIdolName, pack.profileSetup.namePools, profile],
  );
  const [idolName, setIdolName] = useState(initialIdolName);
  const [teamId, setTeamId] = useState(
    () => profile?.teamId ?? pack.profileSetup.teams[0]?.id ?? '',
  );
  const [avatarId, setAvatarId] = useState(() => profile?.avatarId ?? DEFAULT_PROFILE_AVATAR_ID);
  const [nameError, setNameError] = useState('');
  const [teamError, setTeamError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setIdolName(profile.idolName);
    setTeamId(profile.teamId);
    setAvatarId(profile.avatarId ?? DEFAULT_PROFILE_AVATAR_ID);
    setNameError('');
    setTeamError('');
  }, [profile]);

  const selectedTeam =
    pack.profileSetup.teams.find((team) => team.id === teamId) ?? pack.profileSetup.teams[0];
  const selectedAvatar = profileAvatarForId(avatarId);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = idolName.trim();
    const nextNameError =
      normalizedName.length === 0
        ? '请先填写偶像姓名'
        : normalizedName.length > 16
          ? '偶像姓名最多 16 个字'
          : '';
    const nextTeamError = selectedTeam ? '' : '请选择所属队伍';
    setNameError(nextNameError);
    setTeamError(nextTeamError);
    if (nextNameError || nextTeamError || !selectedTeam) {
      if (nextNameError) nameRef.current?.focus();
      return;
    }
    onSubmit({ idolName: normalizedName, teamId: selectedTeam.id, avatarId: selectedAvatar.id });
  };

  return (
    <form
      className={compact ? 'profile-form profile-form--compact' : 'profile-form'}
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="profile-form__preview" aria-live="polite">
        <span className="profile-form__portrait">
          <img src={selectedAvatar.src} alt="" width={512} height={512} />
          {selectedTeam && <TeamMark team={selectedTeam} active />}
        </span>
        <div>
          <strong>{idolName.trim() || '等待命名的成员'}</strong>
          <small>{selectedTeam?.name ?? '请选择所属队伍'}</small>
        </div>
      </div>

      <fieldset className="profile-avatar-field">
        <legend>成员头像</legend>
        <div className="profile-avatar-options">
          {PROFILE_AVATARS.map((avatar) => (
            <label key={avatar.id} className="profile-avatar-option">
              <input
                type="radio"
                name={`${idPrefix}-avatar`}
                value={avatar.id}
                checked={avatar.id === selectedAvatar.id}
                onChange={() => setAvatarId(avatar.id)}
              />
              <span className="profile-avatar-option__image">
                <img src={avatar.src} alt="" width={512} height={512} />
                <span className="profile-avatar-option__check" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              </span>
              <small>{avatar.label}</small>
            </label>
          ))}
        </div>
        <small className="profile-avatar-field__hint">也可以用宠物或玩偶，当作你的口袋头像。</small>
      </fieldset>

      <div className="profile-field">
        <label htmlFor={`${idPrefix}-idol-name`}>偶像姓名</label>
        <div className="profile-name-control">
          <input
            ref={nameRef}
            id={`${idPrefix}-idol-name`}
            value={idolName}
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? `${idPrefix}-name-error` : undefined}
            onChange={(event) => {
              setIdolName(event.target.value);
              if (nameError) setNameError('');
            }}
          />
          <button
            type="button"
            className="profile-random-button"
            aria-label="从姓名库随机一个偶像姓名"
            onClick={() => {
              const suggestion = namePicker.next(idolName);
              if (suggestion) setIdolName(suggestion.name);
              setNameError('');
            }}
          >
            <Dices size={17} aria-hidden="true" />
            随机
          </button>
        </div>
        {nameError && (
          <small id={`${idPrefix}-name-error`} className="profile-field__error">
            {nameError}
          </small>
        )}
      </div>

      <div className="profile-field">
        <label htmlFor={`${idPrefix}-team`}>所属队伍</label>
        <TeamSelect
          id={`${idPrefix}-team`}
          teams={pack.profileSetup.teams}
          value={teamId}
          compact={compact}
          portalContainer={selectPortalContainer}
          invalid={Boolean(teamError)}
          describedBy={teamError ? `${idPrefix}-team-error` : undefined}
          onChange={(value) => {
            setTeamId(value);
            if (teamError) setTeamError('');
          }}
        />
        {teamError && (
          <small id={`${idPrefix}-team-error`} className="profile-field__error">
            {teamError}
          </small>
        )}
      </div>

      <button type="submit" className="button button--primary button--wide">
        {submitLabel}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
  );
}

function ProfileSetupScreen({
  pack,
  onComplete,
}: {
  pack: StoryPack;
  onComplete: (profile: PlayerProfile) => void;
}) {
  const groupName = pack.globalVariables.groupName?.trim() || '48';

  return (
    <main className="profile-setup-screen" aria-labelledby="profile-setup-title">
      <div className="profile-setup__ambient profile-setup__ambient--one" aria-hidden="true" />
      <div className="profile-setup__ambient profile-setup__ambient--two" aria-hidden="true" />
      <section className="profile-setup-card">
        <div className="profile-setup-card__mark" aria-hidden="true">
          <UserRound size={32} strokeWidth={1.7} />
        </div>
        <span className="profile-setup__eyebrow">
          入团后的第一次总选 · 还剩 {pack.config.totalDays} 天
        </span>
        <h1 id="profile-setup-title">先写下你的成员资料</h1>
        <p>你是刚加入{groupName}的新人小偶像。面对粉丝发来的翻牌，你会怎么回复？</p>
        <ProfileForm
          pack={pack}
          idPrefix="onboarding"
          submitLabel="进入成员主页"
          onSubmit={onComplete}
        />
        <small className="profile-setup__privacy">
          <LockKeyhole size={14} aria-hidden="true" /> 资料只保存在当前浏览器
        </small>
      </section>
    </main>
  );
}

function SettingsSheet({
  pack,
  profile,
  mode,
  onProfileChange,
  onModeChange,
  onRestart,
  onClose,
  hasProgress,
}: {
  pack: StoryPack;
  profile: PlayerProfile;
  mode: DisplayMode;
  onProfileChange: (profile: PlayerProfile) => void;
  onModeChange: (mode: DisplayMode) => void;
  onRestart: () => void;
  onClose: () => void;
  hasProgress: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [selectPortalContainer, setSelectPortalContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="settings-sheet"
      aria-labelledby="settings-sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="settings-sheet__content" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-sheet__handle" aria-hidden="true" />
        <header className="settings-sheet__header">
          <div>
            <span>成员主页</span>
            <h2 id="settings-sheet-title">营业设置</h2>
          </div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <section className="sheet-profile-section" aria-labelledby="profile-title">
          <div className="sheet-mode-heading">
            <div>
              <span>成员资料</span>
              <h3 id="profile-title">姓名与队伍</h3>
            </div>
            <small>{profileSaved ? '已保存' : '独立于周目保存'}</small>
          </div>
          <ProfileForm
            pack={pack}
            profile={profile}
            idPrefix="settings"
            submitLabel="保存成员资料"
            compact
            selectPortalContainer={selectPortalContainer}
            onSubmit={(nextProfile) => {
              onProfileChange(nextProfile);
              setProfileSaved(true);
            }}
          />
        </section>

        <section className="sheet-mode-section" aria-labelledby="mode-title">
          <div className="sheet-mode-heading">
            <div>
              <span>好感记录</span>
              <h3 id="mode-title">显示方式</h3>
            </div>
            <small>即时生效</small>
          </div>
          <div className="mode-options mode-options--sheet">
            <button
              type="button"
              className={mode === 'standard' ? 'mode-card is-selected' : 'mode-card'}
              onClick={() => onModeChange('standard')}
              aria-pressed={mode === 'standard'}
            >
              <Eye size={20} aria-hidden="true" />
              <span>
                <strong>标准模式</strong>
                <small>显示具体数值</small>
              </span>
            </button>
            <button
              type="button"
              className={mode === 'realistic' ? 'mode-card is-selected' : 'mode-card'}
              onClick={() => onModeChange('realistic')}
              aria-pressed={mode === 'realistic'}
            >
              <EyeOff size={20} aria-hidden="true" />
              <span>
                <strong>拟真模式</strong>
                <small>只看变化方向</small>
              </span>
            </button>
          </div>
        </section>

        <button type="button" className="button button--primary button--wide" onClick={onRestart}>
          <RotateCcw size={18} aria-hidden="true" />
          放弃进度，从头开始
        </button>
        <p className="settings-restart-note">
          {hasProgress
            ? '保留成员资料与设置，清除当前周目进度。'
            : '保留成员资料与设置，从第 1 日开始。'}
        </p>
        <p className="sheet-privacy-note">
          <LockKeyhole size={14} aria-hidden="true" /> 进度只保存在当前浏览器
        </p>
      </div>
      <div ref={setSelectPortalContainer} className="settings-select-portal-host" />
    </dialog>
  );
}

function TakeoutReceiptDialog({
  receipt,
  onClose,
}: {
  receipt: TakeoutReceipt;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      const restoreTarget = restoreFocusRef.current;
      requestAnimationFrame(() => {
        const targetCanReceiveFocus =
          restoreTarget?.isConnected &&
          (!(restoreTarget instanceof HTMLButtonElement) || !restoreTarget.disabled);
        if (targetCanReceiveFocus) {
          restoreTarget.focus();
          return;
        }
        document
          .querySelector<HTMLElement>(
            '.turn-actions--fixed .button--primary:not(:disabled), .ending-actions .button--primary',
          )
          ?.focus();
      });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="takeout-receipt"
      aria-labelledby="takeout-receipt-title"
      aria-describedby="takeout-receipt-gains"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="takeout-receipt__card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="takeout-receipt__media">
          <img src={receipt.shop.image} alt={receipt.shop.imageAlt} />
          <span className="takeout-receipt__icon" aria-hidden="true">
            <Utensils size={24} />
          </span>
        </div>
        <span className="takeout-receipt__eyebrow">外卖送到</span>
        <h2 id="takeout-receipt-title">点了一份{receipt.shop.name}</h2>
        <div id="takeout-receipt-gains" className="takeout-receipt__gains">
          <span>
            <BatteryCharging size={17} aria-hidden="true" />
            精力 <strong>+{receipt.energyRecovery}</strong>
          </span>
          <span>
            <Smile size={17} aria-hidden="true" />
            心情 <strong>+{receipt.moodRecovery}</strong>
          </span>
        </div>
        <button type="button" className="button button--primary button--wide" onClick={onClose}>
          开吃
        </button>
      </div>
    </dialog>
  );
}

function MenuScreen({
  pack,
  profile,
  save,
  meta,
  mode,
  settingsOpen,
  onModeChange,
  onOpenSettings,
  onCloseSettings,
  onEnterFlip,
  onRestart,
  onProfileChange,
}: {
  pack: StoryPack;
  profile: PlayerProfile;
  save?: GameState;
  meta: PlayerMeta;
  mode: DisplayMode;
  settingsOpen: boolean;
  onModeChange: (mode: DisplayMode) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onEnterFlip: () => void;
  onRestart: () => void;
  onProfileChange: (profile: PlayerProfile) => void;
}) {
  const previewState = save?.status === 'playing' ? save : createInitialGame(pack, mode);
  const pending = getPendingNodes(previewState, pack);
  const nextDeadline = pending.length
    ? Math.min(...pending.map((node) => node.postedDay + node.replyWindowDays))
    : undefined;
  const turnEvent = getCurrentTurnEvent(previewState, pack);
  const team = teamForProfile(pack, profile);
  const memberAvatar = profileAvatarForId(profile.avatarId);

  return (
    <main className="menu-screen pocket-home">
      <section className="pocket-profile" aria-labelledby="member-name">
        <div className="pocket-profile__ambient pocket-profile__ambient--one" aria-hidden="true" />
        <div className="pocket-profile__ambient pocket-profile__ambient--two" aria-hidden="true" />
        <div className="pocket-profile__topline">
          <span className="member-home-label">成员主页</span>
          <button
            type="button"
            className="profile-settings"
            aria-label="设置"
            onClick={onOpenSettings}
          >
            <Settings size={21} aria-hidden="true" />
          </button>
        </div>
        <div className="member-portrait" aria-hidden="true">
          <img src={memberAvatar.src} alt="" width={512} height={512} />
          <TeamMark team={team} active />
        </div>
        <h1 id="member-name">{profile.idolName}</h1>
        <div className="member-status">
          <span
            className="member-status__team"
            style={{ '--team-color': team.color } as CSSProperties}
          >
            {team.shortName}
          </span>
          <i />
          {save?.status === 'playing' ? `第 ${save.currentDay} 日营业中` : '准备营业'}
        </div>
      </section>

      <section className="pocket-stats" aria-label="成员账号数据">
        <div>
          <strong>8,888</strong>
          <span>粉丝</span>
        </div>
        <div>
          <strong>28</strong>
          <span>关注</span>
        </div>
        <div>
          <strong>{meta.achievementIds.length || '—'}</strong>
          <span>鸡腿</span>
        </div>
      </section>

      <section className="pocket-favorite" aria-label="我的收藏">
        <span className="favorite-icon">
          <Star size={18} fill="currentColor" aria-hidden="true" />
        </span>
        <strong>我的收藏</strong>
        <span>
          {meta.endingIds.length + meta.achievementIds.length} 个收藏内容
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </section>

      <section className="pocket-workbench" aria-labelledby="workbench-title">
        <div className="pocket-section-title">
          <div>
            <span>常用工具</span>
            <h2 id="workbench-title">工作台</h2>
          </div>
          <small>
            第 {previewState.turn} / {pack.config.maxTurns} 回合
          </small>
        </div>
        <div className="pocket-work-grid">
          <button
            type="button"
            className="pocket-work-card pocket-work-card--flip"
            onClick={onEnterFlip}
          >
            <span>
              <strong>翻牌</strong>
              <small>{pending.length} 条待回复</small>
            </span>
            <MessageCircleMore size={44} strokeWidth={1.65} aria-hidden="true" />
            {pending.length > 0 && <b>{pending.length}</b>}
          </button>
          <article
            className="pocket-work-card pocket-work-card--notice is-unavailable"
            aria-disabled="true"
            aria-label="通告，暂未开放"
          >
            <span>
              <strong>通告</strong>
              <small>{turnEvent ? '1 条待完成' : '今日已完成'}</small>
            </span>
            <Bell size={43} strokeWidth={1.65} aria-hidden="true" />
            <em className="pocket-work-card__unavailable">暂未开放</em>
          </article>
          <article
            className="pocket-work-card pocket-work-card--gift is-unavailable"
            aria-disabled="true"
            aria-label="金丝瓜，暂未开放"
          >
            <span>
              <strong>金丝瓜</strong>
              <small>0 条待祝福</small>
            </span>
            <Gift size={43} strokeWidth={1.65} aria-hidden="true" />
            <em className="pocket-work-card__unavailable">暂未开放</em>
          </article>
          <article
            className="pocket-work-card pocket-work-card--thanks is-unavailable"
            aria-disabled="true"
            aria-label="感谢粉丝，暂未开放"
          >
            <span>
              <strong>感谢粉丝</strong>
              <small>{meta.achievementIds.length} 份纪念</small>
            </span>
            <HeartHandshake size={44} strokeWidth={1.65} aria-hidden="true" />
            <em className="pocket-work-card__unavailable">暂未开放</em>
          </article>
        </div>
        <p className="pocket-deadline-note">
          <Clock3 size={16} aria-hidden="true" />
          {nextDeadline
            ? `最早一条翻牌将在第 ${nextDeadline} 日 24:00 过期`
            : '暂时没有临近到期的翻牌'}
        </p>
      </section>

      <nav className="pocket-tabbar" aria-label="成员口袋主导航">
        <span>
          <House size={20} aria-hidden="true" /> 首页
        </span>
        <span>
          <UsersRound size={20} aria-hidden="true" /> 聚聚
        </span>
        <span>
          <Video size={20} aria-hidden="true" /> 演出
        </span>
        <span className="is-active" aria-current="page">
          <UserRound size={20} aria-hidden="true" /> 我的
        </span>
      </nav>

      {settingsOpen && (
        <SettingsSheet
          pack={pack}
          profile={profile}
          mode={mode}
          onProfileChange={onProfileChange}
          onModeChange={onModeChange}
          onRestart={onRestart}
          onClose={onCloseSettings}
          hasProgress={save?.status === 'playing'}
        />
      )}
    </main>
  );
}

function ConversationRow({
  participant,
  preview,
  meta,
  timing,
  timingUrgent = false,
  onOpen,
}: {
  participant: ConversationParticipant;
  preview: string;
  meta?: string;
  timing: string;
  timingUrgent?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="conversation-row"
      onClick={onOpen}
      style={{ '--fan-accent': participant.accent } as React.CSSProperties}
    >
      <FanAvatar fan={participant} />
      <span className="conversation-row__body">
        <span className="conversation-row__topline">
          <strong>{participant.name}</strong>
        </span>
        <FanTags tags={participant.tags} compact />
        <span className="conversation-row__preview">{preview}</span>
      </span>
      <span className="conversation-row__end">
        <time className={timingUrgent ? 'conversation-row__timing--urgent' : undefined}>
          {timing}
        </time>
        {meta && <span className="conversation-row__meta">{meta}</span>}
      </span>
    </button>
  );
}

function WorkbenchScreen({
  pack,
  profile,
  state,
  onOpenPending,
  onOpenReplied,
  onTakeout,
  onAdvance,
  onMenu,
}: {
  pack: StoryPack;
  profile: PlayerProfile;
  state: GameState;
  onOpenPending: (fanId: string, nodeId: string) => void;
  onOpenReplied: (participant: ConversationParticipant) => void;
  onTakeout: () => void;
  onAdvance: () => void;
  onMenu: () => void;
}) {
  const pendingNodes = getPendingNodes(state, pack);
  const pendingFlips = pendingNodes.flatMap((node) => {
    const participant = getCoreParticipant(state, pack, node.fanId);
    return participant ? [{ participant, node }] : [];
  });
  const repliedConversations = getRepliedConversations(state, pack);
  const pendingParticipantIds = new Set(pendingFlips.map((flip) => `core:${flip.participant.id}`));
  const visibleRepliedConversations = repliedConversations.filter(
    (conversation) =>
      !pendingParticipantIds.has(`${conversation.participant.kind}:${conversation.participant.id}`),
  );
  const event = getCurrentTurnEvent(state, pack);
  const canTakeout = state.takeoutUsesThisTurn < pack.config.takeout.maxPerTurn;
  const electionDaysRemaining = Math.max(0, pack.config.totalDays - state.currentDay);
  const nextTurnDay = Math.min(pack.config.totalDays, state.currentDay + pack.config.turnDays);
  const team = teamForProfile(pack, profile);

  return (
    <main className="game-screen inbox-screen">
      <header className="game-header game-header--inbox">
        <div className="game-header__main">
          <button type="button" className="icon-button" onClick={onMenu} aria-label="返回主菜单">
            <ChevronLeft size={21} aria-hidden="true" />
          </button>
          <div>
            <span>
              {profile.idolName} · {team.shortName}
            </span>
            <h1>翻牌消息</h1>
          </div>
          <span className="game-header__countdown">离总选结束还剩 {electionDaysRemaining} 天</span>
        </div>
        <section className="inbox-summary" aria-label="当前营业状态">
          <strong>Day {state.currentDay}</strong>
          <span>
            <BatteryCharging size={15} aria-hidden="true" /> 精力 {state.resources.energy}
          </span>
          <span>
            <Smile size={15} aria-hidden="true" /> 心情 {state.resources.mindset}
          </span>
        </section>
      </header>

      {event && (
        <section className="turn-event" aria-label="本回合事件">
          <Star size={18} aria-hidden="true" />
          <div>
            <strong>{event.title}</strong>
            <p>{event.description}</p>
          </div>
        </section>
      )}

      <section className="inbox-message-list" aria-label="翻牌消息列表">
        <header className="conversation-group-heading">
          <h2>未回复</h2>
          <strong aria-label={`${pendingNodes.length} 条未回复`}>{pendingNodes.length}</strong>
        </header>

        <div className="conversation-group conversation-group--pending">
          {pendingFlips.length > 0 ? (
            <ul className="conversation-list" aria-label="未回复">
              {pendingFlips.map(({ participant, node }) => {
                const deadlineDay = node.postedDay + node.replyWindowDays;
                const remainingDays = Math.max(0, deadlineDay - state.currentDay);
                const expiresNextTurn =
                  state.turn < pack.config.maxTurns &&
                  state.currentDay <= deadlineDay &&
                  nextTurnDay > deadlineDay;

                return (
                  <li key={node.id}>
                    <ConversationRow
                      participant={participant}
                      preview={node.content.text}
                      meta={
                        state.mode === 'standard'
                          ? `好感 ${state.affinity[participant.id]}`
                          : affinityLabel(state.affinity[participant.id] ?? 0)
                      }
                      timing={`还有 ${remainingDays} 天过期`}
                      timingUrgent={expiresNextTurn}
                      onOpen={() => onOpenPending(participant.id, node.id)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="conversation-group-empty">
              <MessageCircleMore size={19} aria-hidden="true" />
              <span>没有未回复的翻牌</span>
            </div>
          )}
        </div>

        <div className="conversation-splitter">
          <h2>已回复</h2>
          <span aria-label={`${visibleRepliedConversations.length} 个已回复会话`}>
            {visibleRepliedConversations.length}
          </span>
        </div>

        <div className="conversation-group conversation-group--replied">
          {visibleRepliedConversations.length > 0 ? (
            <ul className="conversation-list" aria-label="已回复">
              {visibleRepliedConversations.map((conversation) => {
                const latest = conversation.latestExchange;
                const latestIncoming = latest.continuations?.at(-1) ?? latest.incoming;
                const preview = latest.outgoing ? `我：${latest.outgoing}` : latestIncoming;
                const meta =
                  conversation.participant.kind === 'core'
                    ? state.mode === 'standard'
                      ? `好感 ${state.affinity[conversation.participant.id]}`
                      : affinityLabel(state.affinity[conversation.participant.id] ?? 0)
                    : undefined;
                return (
                  <li key={conversation.id}>
                    <ConversationRow
                      participant={conversation.participant}
                      preview={preview}
                      meta={meta}
                      timing={
                        latest.status === 'expired'
                          ? '已过期'
                          : (latest.timeLabel ?? `第 ${conversation.latestDay} 日`)
                      }
                      timingUrgent={latest.status === 'expired'}
                      onOpen={() => onOpenReplied(conversation.participant)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="conversation-group-empty">
              <MessageCircleMore size={19} aria-hidden="true" />
              <span>完成第一条翻牌后，对话会收在这里</span>
            </div>
          )}
        </div>
      </section>

      <footer className="turn-actions turn-actions--fixed">
        <div className="turn-action-buttons">
          <button
            type="button"
            className="takeout-button"
            onClick={onTakeout}
            disabled={!canTakeout}
          >
            <Utensils size={18} aria-hidden="true" />
            <span>
              <strong>{canTakeout ? '点份外卖' : '本回合已点过'}</strong>
              <small>
                精力 +{pack.config.takeout.recovery.energy} · 心情 +
                {pack.config.takeout.recovery.mindset}
              </small>
            </span>
          </button>
          <button type="button" className="button button--primary" onClick={onAdvance}>
            {state.turn >= pack.config.maxTurns ? '进入总选' : '几天后'}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </footer>
    </main>
  );
}

function ConversationScreen({
  pack,
  state,
  participant,
  exchanges,
  activeNode,
  onBack,
  onReply,
}: {
  pack: StoryPack;
  state: GameState;
  participant: ConversationParticipant;
  exchanges: ConversationExchange[];
  activeNode?: StoryNode;
  onBack: () => void;
  onReply?: (choice: StoryChoice) => void;
}) {
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const choiceSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // 有待回复节点时直接露出选项区；仅浏览历史时才滚动到聊天末尾。
    if (activeNode && onReply) {
      choiceSectionRef.current?.scrollIntoView({ block: 'end' });
    } else {
      timelineEndRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [activeNode?.id, exchanges.length, exchanges.at(-1)?.selectedChoiceId]);

  return (
    <main className="reply-screen conversation-screen">
      <header className="reply-header">
        <button type="button" className="icon-button" onClick={onBack} aria-label="返回翻牌消息">
          <ChevronLeft size={21} aria-hidden="true" />
        </button>
        <div
          className="reply-header__contact"
          style={{ '--fan-accent': participant.accent } as React.CSSProperties}
        >
          <h1>{participant.name}</h1>
          {participant.handle && <span className="reply-header__handle">{participant.handle}</span>}
          <FanTags tags={participant.tags} compact />
        </div>
        <small>第 {state.currentDay} 日</small>
      </header>

      <section className="chat-timeline" aria-label={`与${participant.name}的全部翻牌对话`}>
        {exchanges.map((exchange, index) => {
          const marker = exchange.timeLabel ?? `第 ${exchange.day} 日`;
          const previous = exchanges[index - 1];
          const previousMarker = previous
            ? (previous.timeLabel ?? `第 ${previous.day} 日`)
            : undefined;
          return (
            <div className="chat-exchange" key={exchange.id}>
              {(index === 0 || previousMarker !== marker) && (
                <div className="chat-day-marker">{marker}</div>
              )}
              <div className="chat-row chat-row--fan">
                <FanAvatar fan={participant} small />
                <article
                  className="fan-message"
                  style={{ '--fan-accent': participant.accent } as React.CSSProperties}
                >
                  <p>{exchange.incoming}</p>
                </article>
              </div>
              {exchange.continuations?.map((continuation, continuationIndex) => (
                <div
                  className="chat-row chat-row--fan chat-row--continuation"
                  key={`${exchange.id}-continuation-${continuationIndex}`}
                >
                  <FanAvatar fan={participant} small />
                  <article
                    className="fan-message fan-message--continuation"
                    style={{ '--fan-accent': participant.accent } as React.CSSProperties}
                  >
                    <p>{continuation}</p>
                  </article>
                </div>
              ))}
              {exchange.outgoing && (
                <div className="chat-row chat-row--idol">
                  <article className="idol-message">
                    <span>你</span>
                    <p>{exchange.outgoing}</p>
                  </article>
                </div>
              )}
              {exchange.status === 'expired' && (
                <div className="chat-system-note">
                  这条翻牌已于第 {exchange.deadlineDay} 日 24:00 过期
                </div>
              )}
              {exchange.status === 'pending' && exchange.deadlineDay !== undefined && (
                <div className="chat-deadline">第 {exchange.deadlineDay} 日 24:00 前回复</div>
              )}
            </div>
          );
        })}
        <div ref={timelineEndRef} aria-hidden="true" />
      </section>

      {activeNode && onReply ? (
        <section
          ref={choiceSectionRef}
          className="choice-section reply-options"
          aria-labelledby="choice-title"
        >
          <div className="choice-section__heading">
            <div>
              <span>候选消息</span>
              <h1 id="choice-title">选择一条回复</h1>
            </div>
            <ResourcePanel resources={state.resources} max={pack.config.resources.max} />
          </div>
          <div className="choice-list">
            {activeNode.choices.map((choice, index) => {
              const affordable = canAfford(state.resources, choice.cost);
              return (
                <button
                  key={choice.id}
                  type="button"
                  className="choice-card"
                  onClick={() => onReply(choice)}
                  disabled={!affordable}
                >
                  <span className="choice-card__prompt" aria-hidden="true">
                    <CircleHelp size={17} />
                  </span>
                  <span className="choice-card__copy">
                    <strong>{choice.text}</strong>
                    {!affordable && <small>当前精力或心情不足</small>}
                  </span>
                  <span
                    className="choice-card__cost"
                    aria-label={`候选回复 ${String.fromCharCode(65 + index)}，消耗 ${choice.cost.energy} 点精力，${choice.cost.mindset} 点心情`}
                  >
                    <span className="choice-card__cost-item choice-card__cost-item--energy">
                      -{choice.cost.energy}
                      <BatteryCharging size={14} aria-hidden="true" />
                    </span>
                    <span className="choice-card__cost-item choice-card__cost-item--mindset">
                      -{choice.cost.mindset}
                      <Smile size={14} aria-hidden="true" />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="conversation-closed-note">当前没有待回复的翻牌</div>
      )}
    </main>
  );
}

function ResultScreen({
  pack,
  state,
  node,
  choice,
  onContinue,
}: {
  pack: StoryPack;
  state: GameState;
  node: StoryNode;
  choice: StoryChoice;
  onContinue: () => void;
}) {
  const fan = fanById(pack, node.fanId);
  const ownDelta = choice.effects.affinity?.[fan.id] ?? 0;
  const otherDeltas = Object.entries(choice.effects.affinity ?? {}).filter(([id]) => id !== fan.id);
  const affinityDirection = ownDelta > 0 ? 'positive' : ownDelta < 0 ? 'negative' : 'neutral';
  const affinityDirectionLabel = ownDelta > 0 ? '上升' : ownDelta < 0 ? '下降' : '不变';
  const AffinityDirectionIcon = ownDelta > 0 ? TrendingUp : ownDelta < 0 ? TrendingDown : Minus;
  const hasSecondaryDeltas =
    choice.effects.popularity !== 0 || (state.mode === 'standard' && otherDeltas.length > 0);
  return (
    <main className="result-screen">
      <section className="sent-message">
        <span>你回复了 {fan.name}</span>
        <p>{choice.text}</p>
      </section>
      <section
        className="reaction-ticket"
        style={{ '--fan-accent': fan.accent } as React.CSSProperties}
      >
        <FanAvatar fan={fan} />
        <span className="reaction-ticket__eyebrow">{fan.name} · 好感变化</span>
        <h1 className={`reaction-ticket__change reaction-ticket__change--${affinityDirection}`}>
          <AffinityDirectionIcon size={24} strokeWidth={2.4} aria-hidden="true" />
          {state.mode === 'standard' ? signed(ownDelta) : affinityDirectionLabel}
        </h1>
        {hasSecondaryDeltas && (
          <div className="result-deltas">
            {choice.effects.popularity !== 0 && (
              <span className={choice.effects.popularity > 0 ? 'is-positive' : 'is-negative'}>
                泛人气 {signed(choice.effects.popularity)}
              </span>
            )}
            {state.mode === 'standard' &&
              otherDeltas.map(([fanId, delta]) => (
                <span key={fanId} className={delta >= 0 ? 'is-positive' : 'is-negative'}>
                  {fanById(pack, fanId).name} 好感 {signed(delta)}
                </span>
              ))}
          </div>
        )}
      </section>
      <button type="button" className="button button--primary button--wide" onClick={onContinue}>
        回到工作台 <ArrowRight size={18} aria-hidden="true" />
      </button>
    </main>
  );
}

function EndingScreen({
  pack,
  state,
  canReturnToCheckpoint,
  onReturnToCheckpoint,
  onRestart,
  onMenu,
}: {
  pack: StoryPack;
  state: GameState;
  canReturnToCheckpoint: boolean;
  onReturnToCheckpoint: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  if (state.status === 'early-ending') {
    const ending = pack.earlyEndings.find((candidate) => candidate.id === state.earlyEndingId)!;
    const isTakeoutEnding = ending.id === pack.config.takeout.endingId;
    return (
      <main className="ending-screen ending-screen--early">
        <div className="ending-mark">
          {isTakeoutEnding ? (
            <Utensils size={34} aria-hidden="true" />
          ) : (
            <Sparkles size={34} aria-hidden="true" />
          )}
        </div>
        <span className="ending-eyebrow">提前结局 · 已收录</span>
        <h1>{ending.title}</h1>
        {ending.image && (
          <figure className="ending-post-image">
            <img
              src={ending.image.src}
              alt={ending.image.alt}
              width={1448}
              height={1086}
              loading="eager"
              decoding="async"
            />
          </figure>
        )}
        <p>{ending.description}</p>
        <span className="ending-return-note">
          结局已经收录。返回后会恢复到触发这次结局之前，可以改选其他分支。
        </span>
        <div className="ending-actions">
          <button
            type="button"
            className="button button--primary"
            disabled={!canReturnToCheckpoint}
            onClick={onReturnToCheckpoint}
          >
            <RotateCcw size={17} aria-hidden="true" />
            回到上一回合
          </button>
          <button type="button" className="button button--ghost" onClick={onMenu}>
            返回菜单
          </button>
        </div>
      </main>
    );
  }

  const result = state.electionResult!;
  const ending = pack.electionEndings.find((candidate) => candidate.id === result.endingId)!;
  const achievements = pack.achievements.filter((achievement) =>
    result.achievementIds.includes(achievement.id),
  );
  return (
    <main className="ending-screen">
      <section className="election-hero">
        <Crown size={30} aria-hidden="true" />
        <span>年度总选结果</span>
        <strong>{ending.rankLabel}</strong>
        <h1>{result.totalVotes.toLocaleString('zh-CN')} 票</h1>
        <p>{ending.title}</p>
      </section>
      <p className="ending-copy">{ending.description}</p>
      <section className="vote-breakdown" aria-labelledby="vote-title">
        <div className="section-heading">
          <div>
            <span>票力来源</span>
            <h2 id="vote-title">谁留到了最后</h2>
          </div>
        </div>
        {result.fanVotes.map((vote) => {
          const fan = fanById(pack, vote.fanId);
          return (
            <article key={fan.id}>
              <FanAvatar fan={fan} small />
              <div>
                <strong>{fan.name}</strong>
                <span>
                  {vote.tierLabel}
                  {state.mode === 'standard' ? ` · 好感 ${vote.affinity}` : ''}
                </span>
              </div>
              <b>{vote.votes.toLocaleString('zh-CN')}</b>
            </article>
          );
        })}
        <article className="vote-breakdown__public">
          <span className="public-avatar" aria-hidden="true">
            众
          </span>
          <div>
            <strong>其他粉丝</strong>
            <span>{result.popularityTierLabel}</span>
          </div>
          <b>{result.popularityVotes.toLocaleString('zh-CN')}</b>
        </article>
      </section>
      {achievements.length > 0 && (
        <section className="achievement-list" aria-label="本轮成就">
          {achievements.map((achievement) => (
            <article key={achievement.id}>
              <Trophy size={18} aria-hidden="true" />
              <div>
                <strong>{achievement.title}</strong>
                <span>{achievement.description}</span>
              </div>
            </article>
          ))}
        </section>
      )}
      <div className="ending-actions">
        <button type="button" className="button button--primary" onClick={onRestart}>
          <RotateCcw size={17} aria-hidden="true" />
          再玩一次
        </button>
        <button type="button" className="button button--ghost" onClick={onMenu}>
          返回菜单
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const initialSave = useMemo(() => loadSave(storyPack), []);
  const initialEarlyEndingCheckpoint = useMemo(() => loadEarlyEndingCheckpoint(storyPack), []);
  const [state, setState] = useState<GameState | undefined>(initialSave);
  const [earlyEndingCheckpoint, setEarlyEndingCheckpoint] = useState<GameState | undefined>(
    initialEarlyEndingCheckpoint,
  );
  const [profile, setProfile] = useState<PlayerProfile | undefined>(() => loadProfile(storyPack));
  const runtimePack = useMemo(
    () =>
      profile
        ? resolveStoryPackTemplates(storyPack, buildTemplateVariables(storyPack, profile))
        : storyPack,
    [profile],
  );
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    () => initialSave?.mode ?? loadMode(),
  );
  const [meta, setMeta] = useState<PlayerMeta>(() => loadMeta());
  const [navigation, setNavigation] = useState<NavigationState>(() => {
    const fallback: NavigationState = {
      version: 1,
      view:
        initialSave?.status && initialSave.status !== 'playing'
          ? { name: 'ending' }
          : { name: 'menu' },
      settingsOpen: false,
      depth: 0,
    };
    const restored = readNavigationState(window.history.state);
    return normalizeNavigation(restored ?? fallback, initialSave);
  });
  const [storageWarning, setStorageWarning] = useState(false);
  const [takeoutReceipt, setTakeoutReceipt] = useState<TakeoutReceipt>();
  const stateRef = useRef(state);
  const navigationRef = useRef(navigation);
  const view = navigation.view;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  useEffect(() => {
    window.history.replaceState(withNavigationState(navigationRef.current), '');

    const handlePopState = (event: PopStateEvent) => {
      const restored = readNavigationState(event.state);
      if (!restored) return;
      const next = normalizeNavigation(restored, stateRef.current);
      navigationRef.current = next;
      setNavigation(next);
      if (JSON.stringify(next) !== JSON.stringify(restored)) {
        window.history.replaceState(withNavigationState(next), '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!profile) {
      document.title = '创建成员资料 — 成员口袋';
      return;
    }
    if (navigation.settingsOpen) {
      document.title = '营业设置 — 成员口袋';
      return;
    }
    if (view.name === 'workbench') {
      document.title = '翻牌消息 — 成员口袋';
      return;
    }
    if (view.name === 'conversation') {
      const contactName =
        view.kind === 'core'
          ? runtimePack.fans.find((fan) => fan.id === view.participantId)?.name
          : runtimePack.backgroundFlips.find(
              (flip) => (flip.contactId ?? flip.fanName) === view.participantId,
            )?.fanName;
      document.title = `${contactName ?? '聊天记录'} — 成员口袋`;
      return;
    }
    if (view.name === 'ending' && state?.status === 'early-ending') {
      const ending = runtimePack.earlyEndings.find(
        (candidate) => candidate.id === state.earlyEndingId,
      );
      document.title = `${ending?.title ?? '特殊结局'} — 成员口袋`;
      return;
    }
    const titles = {
      menu: '成员口袋 — 工作台',
      result: '回复送达 — 成员口袋',
      ending: '年度总选 — 成员口袋',
    } as const;
    document.title = titles[view.name];
  }, [navigation.settingsOpen, profile, runtimePack, state, view]);

  useEffect(() => {
    if (!state) return;
    if (!persistSave(state)) setStorageWarning(true);
    if (state.status !== 'playing') {
      const nextMeta = mergeMeta(meta, state);
      if (JSON.stringify(nextMeta) !== JSON.stringify(meta)) {
        setMeta(nextMeta);
        persistMeta(nextMeta);
      }
    }
  }, [state, meta]);

  const commitNavigation = (
    nextView: View,
    options: { replace?: boolean; settingsOpen?: boolean } = {},
  ) => {
    const current = navigationRef.current;
    const next = normalizeNavigation(
      {
        version: 1,
        view: nextView,
        settingsOpen: options.settingsOpen === true && nextView.name === 'menu',
        depth: options.replace ? current.depth : current.depth + 1,
      },
      stateRef.current,
    );
    navigationRef.current = next;
    setNavigation(next);
    if (options.replace) {
      window.history.replaceState(withNavigationState(next), '');
    } else {
      window.history.pushState(withNavigationState(next), '');
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  const goBack = (fallback: View) => {
    if (navigationRef.current.depth > 0) {
      window.history.back();
    } else {
      commitNavigation(fallback, { replace: true });
    }
  };

  const start = (mode: DisplayMode, replace = false) => {
    recordRunAbandoned(
      storyPack,
      stateRef.current?.status === 'early-ending' ? earlyEndingCheckpoint : stateRef.current,
    );
    clearEarlyEndingCheckpoint();
    setEarlyEndingCheckpoint(undefined);
    setDisplayMode(mode);
    if (!persistMode(mode)) setStorageWarning(true);
    const nextState = createInitialGame(storyPack, mode);
    recordRunStarted(storyPack, mode);
    stateRef.current = nextState;
    setState(nextState);
    commitNavigation({ name: 'workbench' }, { replace });
  };

  const changeDisplayMode = (mode: DisplayMode) => {
    setDisplayMode(mode);
    if (!persistMode(mode)) setStorageWarning(true);
    setState((current) => (current ? { ...current, mode } : current));
  };

  const changeProfile = (nextProfile: PlayerProfile) => {
    setProfile(nextProfile);
    if (!persistProfile(nextProfile)) setStorageWarning(true);
  };

  const restart = () => {
    recordRunAbandoned(
      storyPack,
      stateRef.current?.status === 'early-ending' ? earlyEndingCheckpoint : stateRef.current,
    );
    clearSave();
    stateRef.current = undefined;
    setState(undefined);
    const current = navigationRef.current;
    const root: NavigationState = {
      version: 1,
      view: { name: 'menu' },
      settingsOpen: false,
      depth: 0,
    };
    navigationRef.current = root;
    setNavigation(root);
    if (current.depth > 0) {
      window.history.go(-current.depth);
    } else {
      window.history.replaceState(withNavigationState(root), '');
    }
  };

  const rememberEarlyEndingCheckpoint = (previous: GameState, next: GameState) => {
    if (previous.status !== 'playing' || next.status !== 'early-ending') return;
    setEarlyEndingCheckpoint(previous);
    if (!persistEarlyEndingCheckpoint(previous)) setStorageWarning(true);
  };

  const returnToEarlyEndingCheckpoint = () => {
    const checkpoint = earlyEndingCheckpoint ?? loadEarlyEndingCheckpoint(storyPack);
    if (!checkpoint) return;
    clearEarlyEndingCheckpoint();
    setEarlyEndingCheckpoint(undefined);
    stateRef.current = checkpoint;
    setState(checkpoint);
    commitNavigation({ name: 'workbench' }, { replace: true });
  };

  const currentNode =
    state && view.name === 'conversation' && view.kind === 'core' && view.replyNodeId
      ? runtimePack.nodes.find((node) => node.id === view.replyNodeId)
      : undefined;
  const conversationParticipant =
    state && view.name === 'conversation'
      ? view.kind === 'core'
        ? getCoreParticipant(state, runtimePack, view.participantId)
        : getBackgroundParticipant(runtimePack, state.currentDay, view.participantId)
      : undefined;
  const conversationExchanges =
    state && view.name === 'conversation'
      ? view.kind === 'core'
        ? getCoreConversationHistory(state, runtimePack, view.participantId, view.replyNodeId)
        : getBackgroundConversationHistory(state, runtimePack, view.participantId)
      : [];
  const resultNode =
    state && view.name === 'result'
      ? runtimePack.nodes.find((node) => node.id === view.nodeId)
      : undefined;
  const resultChoice =
    resultNode && view.name === 'result'
      ? resultNode.choices.find((choice) => choice.id === view.choiceId)
      : undefined;

  return (
    <div className="app-frame">
      {storageWarning && (
        <div className="storage-warning" role="status">
          浏览器阻止了本地存档；本次游玩仍可继续。
        </div>
      )}
      {takeoutReceipt && (
        <TakeoutReceiptDialog
          receipt={takeoutReceipt}
          onClose={() => {
            setTakeoutReceipt(undefined);
            if (stateRef.current?.status !== 'playing') {
              commitNavigation({ name: 'ending' }, { replace: true });
            }
          }}
        />
      )}
      {!profile && <ProfileSetupScreen pack={storyPack} onComplete={changeProfile} />}
      {profile && view.name === 'menu' && (
        <MenuScreen
          pack={runtimePack}
          profile={profile}
          save={state}
          meta={meta}
          mode={displayMode}
          settingsOpen={navigation.settingsOpen}
          onModeChange={changeDisplayMode}
          onOpenSettings={() => commitNavigation({ name: 'menu' }, { settingsOpen: true })}
          onCloseSettings={() => goBack({ name: 'menu' })}
          onEnterFlip={() =>
            state?.status === 'playing'
              ? commitNavigation({ name: 'workbench' })
              : state?.status === 'early-ending'
                ? commitNavigation({ name: 'ending' })
                : start(displayMode)
          }
          onRestart={() => start(displayMode, true)}
          onProfileChange={changeProfile}
        />
      )}
      {profile && state && view.name === 'workbench' && (
        <WorkbenchScreen
          pack={runtimePack}
          profile={profile}
          state={state}
          onOpenPending={(fanId, nodeId) =>
            commitNavigation({
              name: 'conversation',
              kind: 'core',
              participantId: fanId,
              replyNodeId: nodeId,
            })
          }
          onOpenReplied={(participant) =>
            commitNavigation({
              name: 'conversation',
              kind: participant.kind,
              participantId: participant.id,
            })
          }
          onTakeout={() => {
            const next = orderTakeout(state, storyPack);
            rememberEarlyEndingCheckpoint(state, next);
            recordGameTransition(storyPack, state, next, { type: 'takeout' });
            setTakeoutReceipt({
              shop: pickTakeoutShop(),
              energyRecovery: storyPack.config.takeout.recovery.energy,
              moodRecovery: storyPack.config.takeout.recovery.mindset,
            });
            stateRef.current = next;
            setState(next);
          }}
          onAdvance={() => {
            const next = advanceTurn(state, storyPack);
            rememberEarlyEndingCheckpoint(state, next);
            recordGameTransition(storyPack, state, next, { type: 'advance' });
            stateRef.current = next;
            setState(next);
            if (next.status !== 'playing') {
              commitNavigation({ name: 'ending' }, { replace: true });
            }
          }}
          onMenu={() => goBack({ name: 'menu' })}
        />
      )}
      {profile &&
        state &&
        view.name === 'conversation' &&
        conversationParticipant &&
        conversationExchanges.length > 0 && (
          <ConversationScreen
            pack={runtimePack}
            state={state}
            participant={conversationParticipant}
            exchanges={conversationExchanges}
            activeNode={currentNode}
            onBack={() => goBack({ name: 'workbench' })}
            onReply={
              currentNode
                ? (choice) => {
                    const next = replyToNode(state, storyPack, currentNode.id, choice.id);
                    rememberEarlyEndingCheckpoint(state, next);
                    recordGameTransition(storyPack, state, next, {
                      type: 'reply',
                      nodeId: currentNode.id,
                      choiceId: choice.id,
                    });
                    stateRef.current = next;
                    setState(next);
                    commitNavigation(
                      next.status === 'early-ending'
                        ? { name: 'ending' }
                        : { name: 'result', nodeId: currentNode.id, choiceId: choice.id },
                      { replace: true },
                    );
                  }
                : undefined
            }
          />
        )}
      {profile && state && view.name === 'result' && resultNode && resultChoice && (
        <ResultScreen
          pack={runtimePack}
          state={state}
          node={resultNode}
          choice={resultChoice}
          onContinue={() => goBack({ name: 'workbench' })}
        />
      )}
      {profile && state && view.name === 'ending' && (
        <EndingScreen
          pack={runtimePack}
          state={state}
          canReturnToCheckpoint={earlyEndingCheckpoint !== undefined}
          onReturnToCheckpoint={returnToEarlyEndingCheckpoint}
          onRestart={restart}
          onMenu={() => goBack({ name: 'menu' })}
        />
      )}
    </div>
  );
}
