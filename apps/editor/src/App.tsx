import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  GitBranch,
  Plus,
  Redo2,
  Save,
  Shuffle,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from 'react';
import {
  RESERVED_TEMPLATE_VARIABLES,
  buildIdolNickname,
  buildTemplateVariables,
  isValidTemplateVariableName,
  renderTemplateText,
  type TemplateVariables,
} from '@clip/story-core/templates';
import { createProfileNamePicker } from '@clip/story-core/profile-names';
import { hasValidationErrors, validateStoryPack } from '@clip/story-core/validation';
import type {
  BackgroundFlip,
  ExpireOutcome,
  FanDefinition,
  PlayerProfile,
  ProfileNameKind,
  StoryChoice,
  StoryNode,
  StoryPack,
  StoryTriggerCondition,
  ValidationIssue,
} from '@clip/story-core/types';
import { defaultStoryPack } from './content';
import {
  chooseSaveHandle,
  downloadStoryFile,
  openStoryFile,
  parseImportedFile,
  supportsDirectFileAccess,
  writeStoryFile,
  type WritableFileHandle,
} from './file-io';
import { renameFanReferences } from './story-pack-editing';

const DAY_GAP = 220;
const HISTORY_LIMIT = 80;
const LONG_TEXT_SOFT_LIMIT = 140;
const LONG_TEXT_MAX_HEIGHT = 280;
const EMPTY_PROFILE_SETUP: StoryPack['profileSetup'] = {
  namePools: { adapted: [], original: [] },
  teams: [],
};

const TRIGGER_TYPE_LABELS: Record<StoryTriggerCondition['type'], string> = {
  'flag-set': '已拥有标记',
  'flag-unset': '未拥有标记',
  'expired-flips-at-least': '过期翻牌至少',
  'takeout-orders-at-least': '已点外卖至少',
  'consecutive-replies-delayed-at-least': '连续延迟回复至少',
};

function AvatarPreview({ avatar }: { avatar: string }) {
  const isImage = avatar.startsWith('/') || /^https?:\/\//.test(avatar);
  return isImage ? <img src={avatar} alt="" /> : <>{avatar}</>;
}

type StoryNodeData = { storyNode: StoryNode; fan: FanDefinition };
type DayNodeData = { day: number; hasEvent: boolean };
type StoryFlowNode = Node<StoryNodeData, 'story'>;
type DayFlowNode = Node<DayNodeData, 'day'>;

function clonePack(pack: StoryPack): StoryPack {
  return structuredClone(pack);
}

function createPreviewProfile(pack: StoryPack): PlayerProfile {
  return {
    idolName:
      pack.profileSetup?.namePools.adapted[0] ??
      pack.profileSetup?.namePools.original[0] ??
      '测试成员',
    teamId: pack.profileSetup?.teams[0]?.id ?? '',
  };
}

interface NamePoolEditorProps {
  kind: ProfileNameKind;
  names: string[];
  onAdd: () => void;
  onChange: (index: number, name: string) => void;
  onDelete: (index: number) => void;
}

function NamePoolEditor({ kind, names, onAdd, onChange, onDelete }: NamePoolEditorProps) {
  const isAdapted = kind === 'adapted';
  const label = isAdapted ? '改编姓名' : '原创姓名';
  const minimum = isAdapted ? 3 : 0;

  return (
    <details className="name-pool-editor" open={isAdapted}>
      <summary>
        <span>{label}</span>
        <span className="count-badge">{names.length}</span>
      </summary>
      <div className="name-pool-editor__body">
        <div className="name-pool-editor__toolbar">
          <small>{isAdapted ? '参考命名气质后虚构化' : '完全原创的虚构姓名'}</small>
          <button type="button" className="tiny-button" aria-label={`新增${label}`} onClick={onAdd}>
            <Plus size={14} />
          </button>
        </div>
        <div className="simple-row-list">
          {names.length === 0 && (
            <p className="empty-name-pool">暂未使用{label}，可以随时从这里添加。</p>
          )}
          {names.map((name, index) => (
            <div className="simple-edit-row" key={index}>
              <label className="compact-field">
                <span className="sr-only">
                  {label} {index + 1}
                </span>
                <input value={name} onChange={(event) => onChange(index, event.target.value)} />
              </label>
              <button
                type="button"
                className="tiny-button"
                aria-label={`删除${label} ${name || index + 1}`}
                disabled={names.length <= minimum}
                onClick={() => onDelete(index)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

interface AutoGrowTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helpText?: string;
  softLimit?: number;
  minRows?: number;
}

function AutoGrowTextarea({
  label,
  value,
  onChange,
  helpText,
  softLimit = LONG_TEXT_SOFT_LIMIT,
  minRows = 3,
}: AutoGrowTextareaProps) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overLimit = value.length > softLimit;
  const helpId = helpText ? `${id}-help` : undefined;
  const warningId = overLimit ? `${id}-warning` : undefined;
  const describedBy = [helpId, warningId].filter(Boolean).join(' ') || undefined;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, LONG_TEXT_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > LONG_TEXT_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  return (
    <div className="field full long-text-field">
      <div className="field-heading">
        <label htmlFor={id}>{label}</label>
        <span className={`character-count${overLimit ? ' is-over-limit' : ''}`}>
          {value.length} / {softLimit} 字
        </span>
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        className="auto-grow-textarea resize-none"
        rows={minRows}
        value={value}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {helpText && (
        <p className="field-help" id={helpId}>
          {helpText}
        </p>
      )}
      {overLimit && (
        <p className="form-warning" id={warningId}>
          建议精简到 {softLimit} 字以内；当前多出 {value.length - softLimit} 字。
        </p>
      )}
    </div>
  );
}

function VariableHints({ variables }: { variables: TemplateVariables }) {
  const entries = Object.entries(variables);
  return (
    <section className="variable-hints" aria-labelledby="variable-hints-title">
      <div className="variable-hints__heading">
        <strong id="variable-hints-title">可用变量</strong>
        <span>在翻牌正文或回复中输入变量占位符</span>
      </div>
      <div className="variable-hint-list">
        {entries.map(([key, value]) => (
          <div className="variable-hint" key={key}>
            <code>{`{{${key}}}`}</code>
            <span title={value}>{value || '空值'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoryCardNode({ data }: NodeProps<StoryFlowNode>) {
  const { storyNode, fan } = data;
  return (
    <div className="story-node" style={{ '--node-accent': fan.accent } as CSSProperties}>
      <Handle type="target" position={Position.Left} />
      <div className="story-node-head">
        <span className="node-day">D{storyNode.postedDay}</span>
        <span className="node-title">{storyNode.title}</span>
      </div>
      <div className="story-node-body">
        <p className="node-message">{storyNode.content.text}</p>
        {storyNode.trigger && (
          <span className="node-trigger-badge">
            日初 · {storyNode.trigger.match === 'all' ? '全部' : '任一'}{' '}
            {storyNode.trigger.conditions.length}
          </span>
        )}
        <div className="node-footer">
          <span>{fan.name}</span>
          <span>{storyNode.choices.length} 个回复</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function DayMarkerNode({ data }: NodeProps<DayFlowNode>) {
  return (
    <div className={`date-marker-node${data.hasEvent ? ' event-day' : ''}`}>
      <strong>{data.day}</strong>
      {data.hasEvent ? '特殊日' : '日'}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  story: StoryCardNode,
  day: DayMarkerNode,
};

interface JsonFieldProps<T extends object> {
  label: string;
  value: T | undefined;
  onCommit: (value: T | undefined) => void;
  emptyMeansUndefined?: boolean;
}

function JsonField<T extends object>({
  label,
  value,
  onCommit,
  emptyMeansUndefined = false,
}: JsonFieldProps<T>) {
  const serialized = JSON.stringify(value ?? {}, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(serialized);
    setError('');
  }, [serialized]);

  const commit = () => {
    try {
      const parsed: unknown = JSON.parse(draft || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('必须是 JSON 对象');
      }
      const object = parsed as T;
      onCommit(emptyMeansUndefined && Object.keys(object).length === 0 ? undefined : object);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON 格式有误');
    }
  };

  return (
    <label className="field full">
      <span>{label}</span>
      <textarea
        className="code-field resize-none"
        value={draft}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      {error && <p className="form-error">{error}</p>}
    </label>
  );
}

interface ContentPackInspectorProps {
  pack: StoryPack;
  previewProfile: PlayerProfile;
  templateVariables: TemplateVariables;
  onUpdate: (updater: (pack: StoryPack) => StoryPack) => void;
  onRenameFanId: (previousId: string, nextId: string) => void;
  onPreviewProfileChange: (profile: PlayerProfile) => void;
}

function ContentPackInspector({
  pack,
  previewProfile,
  templateVariables,
  onUpdate,
  onRenameFanId,
  onPreviewProfileChange,
}: ContentPackInspectorProps) {
  const profileSetup = pack.profileSetup ?? EMPTY_PROFILE_SETUP;
  const globalVariables = pack.globalVariables ?? {};
  const variableEntries = Object.entries(globalVariables);
  const [variableKeyDrafts, setVariableKeyDrafts] = useState<Record<string, string>>({});
  const [variableKeyErrors, setVariableKeyErrors] = useState<Record<string, string>>({});
  const [fanIdDrafts, setFanIdDrafts] = useState<Record<string, string>>({});
  const [fanIdErrors, setFanIdErrors] = useState<Record<string, string>>({});
  const previewNamePicker = useMemo(
    () => createProfileNamePicker(profileSetup.namePools),
    [profileSetup.namePools],
  );

  const updateProfileSetup = (
    updater: (setup: StoryPack['profileSetup']) => StoryPack['profileSetup'],
  ) => {
    onUpdate((current) => ({
      ...current,
      profileSetup: updater(current.profileSetup ?? EMPTY_PROFILE_SETUP),
    }));
  };

  const addGlobalVariable = () => {
    const used = new Set(Object.keys(globalVariables));
    let index = used.size + 1;
    while (used.has(`variable_${index}`)) index += 1;
    onUpdate((current) => ({
      ...current,
      globalVariables: { ...(current.globalVariables ?? {}), [`variable_${index}`]: '' },
    }));
  };

  const commitVariableKey = (currentKey: string) => {
    const nextKey = (variableKeyDrafts[currentKey] ?? currentKey).trim();
    if (!nextKey) {
      setVariableKeyErrors((current) => ({ ...current, [currentKey]: '变量名不能为空' }));
      return;
    }
    if (!isValidTemplateVariableName(nextKey)) {
      setVariableKeyErrors((current) => ({
        ...current,
        [currentKey]: '请以英文字母开头，只使用字母、数字和下划线',
      }));
      return;
    }
    if ((RESERVED_TEMPLATE_VARIABLES as readonly string[]).includes(nextKey)) {
      setVariableKeyErrors((current) => ({
        ...current,
        [currentKey]: '这是预览身份使用的预留变量名',
      }));
      return;
    }
    if (nextKey !== currentKey && Object.hasOwn(globalVariables, nextKey)) {
      setVariableKeyErrors((current) => ({ ...current, [currentKey]: '变量名已存在' }));
      return;
    }
    if (nextKey !== currentKey) {
      onUpdate((current) => ({
        ...current,
        globalVariables: Object.fromEntries(
          Object.entries(current.globalVariables ?? {}).map(([key, value]) =>
            key === currentKey ? [nextKey, value] : [key, value],
          ),
        ),
      }));
    }
    setVariableKeyDrafts((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    setVariableKeyErrors((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
  };

  const addName = (kind: ProfileNameKind) => {
    updateProfileSetup((setup) => ({
      ...setup,
      namePools: {
        ...setup.namePools,
        [kind]: [...setup.namePools[kind], '新名字'],
      },
    }));
  };

  const addTeam = () => {
    const used = new Set(profileSetup.teams.map((team) => team.id));
    let index = profileSetup.teams.length + 1;
    while (used.has(`team-${index}`)) index += 1;
    updateProfileSetup((setup) => ({
      ...setup,
      teams: [
        ...setup.teams,
        {
          id: `team-${index}`,
          name: '新队伍',
          shortName: `T${index}`,
          mark: `T${index}`.slice(0, 3),
          color: '#8E6AD8',
        },
      ],
    }));
  };

  const randomizePreviewName = () => {
    const suggestion = previewNamePicker.next(previewProfile.idolName);
    if (!suggestion) return;
    onPreviewProfileChange({ ...previewProfile, idolName: suggestion.name });
  };

  const updateFan = (index: number, updater: (fan: FanDefinition) => FanDefinition) => {
    onUpdate((current) => ({
      ...current,
      fans: current.fans.map((fan, fanIndex) => (fanIndex === index ? updater(fan) : fan)),
    }));
  };

  const commitFanId = (fan: FanDefinition) => {
    const nextId = (fanIdDrafts[fan.id] ?? fan.id).trim();
    if (!nextId) {
      setFanIdErrors((current) => ({ ...current, [fan.id]: '核心粉丝 ID 不能为空' }));
      return;
    }
    if (nextId !== fan.id && pack.fans.some((candidate) => candidate.id === nextId)) {
      setFanIdErrors((current) => ({ ...current, [fan.id]: '这个核心粉丝 ID 已存在' }));
      return;
    }
    if (nextId !== fan.id) onRenameFanId(fan.id, nextId);
    setFanIdDrafts((current) => {
      const next = { ...current };
      delete next[fan.id];
      return next;
    });
    setFanIdErrors((current) => {
      const next = { ...current };
      delete next[fan.id];
      return next;
    });
  };

  const addPastChat = (fanIndex: number) => {
    const fan = pack.fans[fanIndex];
    if (!fan || fan.pastChats.length >= 8) return;
    const used = new Set(fan.pastChats.map((chat) => chat.id));
    let suffix = fan.pastChats.length + 1;
    while (used.has(`${fan.id}-past-${String(suffix).padStart(2, '0')}`)) suffix += 1;
    updateFan(fanIndex, (current) => ({
      ...current,
      pastChats: [
        ...current.pastChats,
        {
          id: `${fan.id}-past-${String(suffix).padStart(2, '0')}`,
          timeLabel: '总选月前',
          message: '填写这名粉丝过去发来的消息。',
          reply: '填写成员当时已经发出的回复。',
        },
      ],
    }));
  };

  const updateBackgroundFlip = (
    index: number,
    updater: (flip: BackgroundFlip) => BackgroundFlip,
  ) => {
    onUpdate((current) => ({
      ...current,
      backgroundFlips: current.backgroundFlips.map((flip, flipIndex) =>
        flipIndex === index ? updater(flip) : flip,
      ),
    }));
  };

  const nextBackgroundFlipId = (base = 'npc-topic') => {
    const used = new Set(pack.backgroundFlips.map((flip) => flip.id));
    let suffix = pack.backgroundFlips.length + 1;
    while (used.has(`${base}-${String(suffix).padStart(2, '0')}`)) suffix += 1;
    return `${base}-${String(suffix).padStart(2, '0')}`;
  };

  const addBackgroundFlip = () => {
    const id = nextBackgroundFlipId();
    onUpdate((current) => ({
      ...current,
      backgroundFlips: [
        ...current.backgroundFlips,
        {
          id,
          contactId: id,
          day: 1,
          fanName: '{{idolName}}的新听众',
          tag: '河内热议',
          message: '在这里填写 NPC 随日期出现的第一条闲聊。',
          continuations: ['需要分成多个气泡时，可以继续填写这一句。'],
        },
      ],
    }));
  };

  const duplicateBackgroundFlip = (index: number) => {
    const source = pack.backgroundFlips[index];
    if (!source) return;
    const duplicate = structuredClone(source);
    duplicate.id = nextBackgroundFlipId(`${source.id}-round`);
    duplicate.day = Math.min(pack.config.totalDays, source.day + pack.config.turnDays);
    onUpdate((current) => ({
      ...current,
      backgroundFlips: [...current.backgroundFlips, duplicate],
    }));
  };

  return (
    <>
      <div className="inspector-header inspector-header--pack">
        <div>
          <strong>内容包与变量</strong>
          <span>{pack.id}</span>
        </div>
        <span className="inspector-header__context">本地预览设置</span>
      </div>

      <form
        className="inspector-body pack-inspector-form"
        noValidate
        onSubmit={(event) => event.preventDefault()}
      >
        <section className="pack-preview-card" aria-labelledby="preview-profile-title">
          <div className="section-heading section-heading--plain">
            <span id="preview-profile-title">预览身份</span>
            <span className="preview-badge">不写入内容包</span>
          </div>
          <div className="preview-profile-grid">
            <div className="field">
              <label htmlFor="preview-idol-name">成员姓名</label>
              <div className="input-with-action">
                <input
                  id="preview-idol-name"
                  value={previewProfile.idolName}
                  onChange={(event) =>
                    onPreviewProfileChange({ ...previewProfile, idolName: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="tiny-button"
                  aria-label="随机预览姓名"
                  title="随机姓名"
                  disabled={
                    ![...profileSetup.namePools.adapted, ...profileSetup.namePools.original].some(
                      (name) => name.trim(),
                    )
                  }
                  onClick={randomizePreviewName}
                >
                  <Shuffle size={13} />
                </button>
              </div>
            </div>
            <label className="field">
              <span>所属队伍</span>
              <select
                value={previewProfile.teamId}
                disabled={profileSetup.teams.length === 0}
                onChange={(event) =>
                  onPreviewProfileChange({ ...previewProfile, teamId: event.target.value })
                }
              >
                {profileSetup.teams.length === 0 && <option value="">请先添加队伍</option>}
                {profileSetup.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.shortName} · {team.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="inspector-section inspector-section--first">
          <div className="section-heading section-heading--plain">
            <span>内容包信息</span>
          </div>
          <div className="form-grid">
            <label className="field full">
              <span>内容包名称</span>
              <input
                value={pack.title}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="field full">
              <span>简介</span>
              <textarea
                className="resize-none pack-description-field"
                rows={3}
                value={pack.description}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <label className="field full">
              <span>内容版本</span>
              <input
                value={pack.contentVersion}
                onChange={(event) =>
                  onUpdate((current) => ({ ...current, contentVersion: event.target.value }))
                }
              />
            </label>
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-heading">
            <span>全局变量</span>
            <button
              type="button"
              className="tiny-button"
              aria-label="新增全局变量"
              onClick={addGlobalVariable}
            >
              <Plus size={14} />
            </button>
          </div>
          <p className="section-help">变量值会与预览身份一起替换正文中的占位符。</p>
          {variableEntries.length === 0 ? (
            <p className="compact-empty-state">还没有自定义变量。成员和队伍变量仍然可用。</p>
          ) : (
            <div className="key-value-list">
              {variableEntries.map(([key, value], index) => {
                const keyError = variableKeyErrors[key];
                return (
                  <div className="key-value-row" key={key}>
                    <label className="compact-field">
                      <span className="sr-only">变量 {index + 1} 的名称</span>
                      <input
                        value={variableKeyDrafts[key] ?? key}
                        aria-invalid={Boolean(keyError)}
                        aria-describedby={keyError ? `variable-key-${index}-error` : undefined}
                        onChange={(event) => {
                          setVariableKeyDrafts((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }));
                          setVariableKeyErrors((current) => {
                            const next = { ...current };
                            delete next[key];
                            return next;
                          });
                        }}
                        onBlur={() => commitVariableKey(key)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </label>
                    <label className="compact-field">
                      <span className="sr-only">变量 {key} 的值</span>
                      <input
                        value={value}
                        onChange={(event) =>
                          onUpdate((current) => ({
                            ...current,
                            globalVariables: {
                              ...(current.globalVariables ?? {}),
                              [key]: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="tiny-button"
                      aria-label={`删除变量 ${key}`}
                      onClick={() =>
                        onUpdate((current) => {
                          const nextVariables = { ...(current.globalVariables ?? {}) };
                          delete nextVariables[key];
                          return { ...current, globalVariables: nextVariables };
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                    {keyError && (
                      <p
                        className="form-error key-value-row__error"
                        id={`variable-key-${index}-error`}
                      >
                        {keyError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="inspector-section">
          <div className="section-heading">
            <span>随机姓名库</span>
            <span className="count-badge">
              {profileSetup.namePools.adapted.length + profileSetup.namePools.original.length}
            </span>
          </div>
          <p className="name-pool-rule">
            {profileSetup.namePools.original.length === 0
              ? '当前仅使用改编姓名；所有随机建议都会从改编池抽取。'
              : '前三次建议使用改编姓名；之后每五次为一组，至少两次来自改编姓名。'}
          </p>
          <div className="name-pool-editor-list">
            {(['adapted', 'original'] as const).map((kind) => (
              <NamePoolEditor
                key={kind}
                kind={kind}
                names={profileSetup.namePools[kind]}
                onAdd={() => addName(kind)}
                onChange={(index, name) =>
                  updateProfileSetup((setup) => ({
                    ...setup,
                    namePools: {
                      ...setup.namePools,
                      [kind]: setup.namePools[kind].map((item, itemIndex) =>
                        itemIndex === index ? name : item,
                      ),
                    },
                  }))
                }
                onDelete={(index) =>
                  updateProfileSetup((setup) => ({
                    ...setup,
                    namePools: {
                      ...setup.namePools,
                      [kind]: setup.namePools[kind].filter((_, itemIndex) => itemIndex !== index),
                    },
                  }))
                }
              />
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-heading">
            <span>队伍资料</span>
            <button type="button" className="tiny-button" aria-label="新增队伍" onClick={addTeam}>
              <Plus size={14} />
            </button>
          </div>
          <div className="team-editor-list">
            {profileSetup.teams.map((team, index) => (
              <fieldset className="team-editor-card" key={index}>
                <legend>队伍 {index + 1}</legend>
                <div className="team-editor-grid">
                  <label className="compact-field">
                    <span>ID</span>
                    <input
                      value={team.id}
                      onChange={(event) =>
                        updateProfileSetup((setup) => ({
                          ...setup,
                          teams: setup.teams.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, id: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="compact-field">
                    <span>名称</span>
                    <input
                      value={team.name}
                      onChange={(event) =>
                        updateProfileSetup((setup) => ({
                          ...setup,
                          teams: setup.teams.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, name: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="compact-field team-editor-short-name">
                    <span>简称</span>
                    <input
                      value={team.shortName}
                      onChange={(event) =>
                        updateProfileSetup((setup) => ({
                          ...setup,
                          teams: setup.teams.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, shortName: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="compact-field">
                    <span>队标</span>
                    <input
                      maxLength={3}
                      value={team.mark}
                      onChange={(event) =>
                        updateProfileSetup((setup) => ({
                          ...setup,
                          teams: setup.teams.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, mark: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="compact-field team-color-field">
                    <span>主题色</span>
                    <input
                      type="color"
                      value={team.color}
                      onChange={(event) =>
                        updateProfileSetup((setup) => ({
                          ...setup,
                          teams: setup.teams.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, color: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="tiny-button team-delete-button"
                    aria-label={`删除队伍 ${team.name || team.id}`}
                    disabled={profileSetup.teams.length <= 1}
                    onClick={() =>
                      updateProfileSetup((setup) => ({
                        ...setup,
                        teams: setup.teams.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-heading">
            <span>核心粉丝档案</span>
            <span className="count-badge">{pack.fans.length}</span>
          </div>
          <p className="section-help core-fan-editor-help">
            稳定 ID
            会被剧情节点、好感效果、票力修正和延迟触发引用；在这里改名时会同步更新全部引用。标签按顺序显示在消息列表和聊天标题中。过往聊天只构建关系氛围，不参与本周目结算。
          </p>
          <div className="core-fan-editor-list">
            {pack.fans.map((fan, fanIndex) => {
              const fanIdError = fanIdErrors[fan.id];
              return (
                <details className="core-fan-editor" key={fanIndex}>
                  <summary>
                    <span className="core-fan-editor__identity">
                      <span className="core-fan-editor__avatar" aria-hidden="true">
                        <AvatarPreview avatar={fan.avatar} />
                      </span>
                      <span>
                        <strong>{renderTemplateText(fan.name, templateVariables)}</strong>
                        <small>{fan.tags.join(' · ')}</small>
                      </span>
                    </span>
                    <span className="core-fan-editor__meta">
                      {fan.pastChats.length} 条过往 ·{' '}
                      {pack.nodes.filter((node) => node.fanId === fan.id).length} 个节点
                    </span>
                  </summary>
                  <div className="core-fan-editor__body">
                    <div className="core-fan-editor__grid">
                      <label className="compact-field">
                        <span>稳定 ID</span>
                        <input
                          value={fanIdDrafts[fan.id] ?? fan.id}
                          aria-invalid={Boolean(fanIdError)}
                          aria-describedby={fanIdError ? `fan-${fanIndex}-id-error` : undefined}
                          onChange={(event) => {
                            setFanIdDrafts((current) => ({
                              ...current,
                              [fan.id]: event.target.value,
                            }));
                            setFanIdErrors((current) => {
                              const next = { ...current };
                              delete next[fan.id];
                              return next;
                            });
                          }}
                          onBlur={() => commitFanId(fan)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        {fanIdError && (
                          <span className="form-error" id={`fan-${fanIndex}-id-error`}>
                            {fanIdError}
                          </span>
                        )}
                      </label>
                      <label className="compact-field">
                        <span>显示昵称</span>
                        <input
                          value={fan.name}
                          onChange={(event) =>
                            updateFan(fanIndex, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="compact-field">
                        <span>账号 ID</span>
                        <input
                          value={fan.handle}
                          onChange={(event) =>
                            updateFan(fanIndex, (current) => ({
                              ...current,
                              handle: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="compact-field">
                        <span>头像路径</span>
                        <input
                          value={fan.avatar}
                          onChange={(event) =>
                            updateFan(fanIndex, (current) => ({
                              ...current,
                              avatar: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="compact-field">
                        <span>初始好感</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={fan.initialAffinity}
                          onChange={(event) =>
                            updateFan(fanIndex, (current) => ({
                              ...current,
                              initialAffinity: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="compact-field">
                        <span>票力上限</span>
                        <input
                          type="number"
                          min={0}
                          value={fan.maxVotePower}
                          onChange={(event) =>
                            updateFan(fanIndex, (current) => ({
                              ...current,
                              maxVotePower: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <AutoGrowTextarea
                      label="人物简介"
                      value={fan.bio}
                      onChange={(value) =>
                        updateFan(fanIndex, (current) => ({ ...current, bio: value }))
                      }
                      softLimit={180}
                      minRows={2}
                    />

                    <div className="core-fan-tags-editor">
                      <div className="core-fan-subheading">
                        <span>人物标签</span>
                        <button
                          type="button"
                          className="tiny-button"
                          aria-label={`为${fan.name}新增标签`}
                          disabled={fan.tags.length >= 4}
                          onClick={() =>
                            updateFan(fanIndex, (current) => ({
                              ...current,
                              tags: [...current.tags, '新标签'],
                            }))
                          }
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <div className="core-fan-tag-list">
                        {fan.tags.map((tag, tagIndex) => (
                          <div className="core-fan-tag-row" key={tagIndex}>
                            <label className="compact-field">
                              <span className="sr-only">
                                {fan.name} 标签 {tagIndex + 1}
                              </span>
                              <input
                                maxLength={12}
                                value={tag}
                                onChange={(event) =>
                                  updateFan(fanIndex, (current) => ({
                                    ...current,
                                    tags: current.tags.map((item, itemIndex) =>
                                      itemIndex === tagIndex ? event.target.value : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="tiny-button"
                              aria-label={`删除标签 ${tag}`}
                              disabled={fan.tags.length <= 1}
                              onClick={() =>
                                updateFan(fanIndex, (current) => ({
                                  ...current,
                                  tags: current.tags.filter(
                                    (_, itemIndex) => itemIndex !== tagIndex,
                                  ),
                                }))
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="core-fan-history-editor">
                      <div className="core-fan-subheading">
                        <span>过往聊天记录</span>
                        <button
                          type="button"
                          className="tiny-button"
                          aria-label={`为${fan.name}新增过往聊天`}
                          disabled={fan.pastChats.length >= 8}
                          onClick={() => addPastChat(fanIndex)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      {fan.pastChats.length === 0 ? (
                        <p className="compact-empty-state">
                          这名粉丝尚无赛前聊天。适合刚刚出现、还没有关系基础的角色。
                        </p>
                      ) : (
                        <div className="core-fan-history-list">
                          {fan.pastChats.map((chat, chatIndex) => (
                            <fieldset className="core-fan-history-card" key={chatIndex}>
                              <legend>过往 {chatIndex + 1}</legend>
                              <div className="core-fan-history-card__toolbar">
                                <span>{chat.timeLabel}</span>
                                <button
                                  type="button"
                                  className="tiny-button"
                                  aria-label={`删除${fan.name}的过往聊天 ${chatIndex + 1}`}
                                  onClick={() =>
                                    updateFan(fanIndex, (current) => ({
                                      ...current,
                                      pastChats: current.pastChats.filter(
                                        (_, itemIndex) => itemIndex !== chatIndex,
                                      ),
                                    }))
                                  }
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              <div className="core-fan-history-card__grid">
                                <label className="compact-field">
                                  <span>记录 ID</span>
                                  <input
                                    value={chat.id}
                                    onChange={(event) =>
                                      updateFan(fanIndex, (current) => ({
                                        ...current,
                                        pastChats: current.pastChats.map((item, itemIndex) =>
                                          itemIndex === chatIndex
                                            ? { ...item, id: event.target.value }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                                <label className="compact-field">
                                  <span>时间标签</span>
                                  <input
                                    maxLength={24}
                                    value={chat.timeLabel}
                                    onChange={(event) =>
                                      updateFan(fanIndex, (current) => ({
                                        ...current,
                                        pastChats: current.pastChats.map((item, itemIndex) =>
                                          itemIndex === chatIndex
                                            ? { ...item, timeLabel: event.target.value }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                              <AutoGrowTextarea
                                label="粉丝当时发来的消息"
                                value={chat.message}
                                onChange={(value) =>
                                  updateFan(fanIndex, (current) => ({
                                    ...current,
                                    pastChats: current.pastChats.map((item, itemIndex) =>
                                      itemIndex === chatIndex ? { ...item, message: value } : item,
                                    ),
                                  }))
                                }
                                minRows={2}
                              />
                              <AutoGrowTextarea
                                label="成员当时的回复"
                                value={chat.reply}
                                onChange={(value) =>
                                  updateFan(fanIndex, (current) => ({
                                    ...current,
                                    pastChats: current.pastChats.map((item, itemIndex) =>
                                      itemIndex === chatIndex ? { ...item, reply: value } : item,
                                    ),
                                  }))
                                }
                                minRows={2}
                              />
                            </fieldset>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-heading">
            <span>普通 NPC 与热点闲聊</span>
            <button
              type="button"
              className="tiny-button"
              aria-label="新增 NPC 话题轮次"
              onClick={addBackgroundFlip}
            >
              <Plus size={14} />
            </button>
          </div>
          <p className="section-help npc-editor-help">
            相同 contactId 会聚合成一名 NPC
            的多轮聊天；内容到达日期后自动进入“已回复”，玩家只阅读、不作答。姓名和全部气泡都支持模板变量。
          </p>
          <div className="npc-flip-editor-list">
            {pack.backgroundFlips.map((flip, index) => (
              <details className="npc-flip-editor" key={index}>
                <summary>
                  <span>{renderTemplateText(flip.fanName, templateVariables)}</span>
                  <span className="npc-flip-editor__meta">
                    第 {flip.day} 日 · {flip.reply !== undefined ? '自动一问一答' : 'NPC 闲聊'}
                  </span>
                </summary>
                <div className="npc-flip-editor__body">
                  <div className="npc-flip-editor__toolbar">
                    <span>{flip.id}</span>
                    <div>
                      <button
                        type="button"
                        className="tiny-button"
                        aria-label={`复制 ${flip.fanName} 为下一轮`}
                        title="复制为同一 NPC 的下一轮"
                        onClick={() => duplicateBackgroundFlip(index)}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        className="tiny-button"
                        aria-label={`删除 NPC 轮次 ${flip.id}`}
                        title="删除该轮次，可使用撤销恢复"
                        onClick={() =>
                          onUpdate((current) => ({
                            ...current,
                            backgroundFlips: current.backgroundFlips.filter(
                              (_, flipIndex) => flipIndex !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="npc-flip-editor__grid">
                    <label className="compact-field">
                      <span>轮次 ID</span>
                      <input
                        value={flip.id}
                        onChange={(event) =>
                          updateBackgroundFlip(index, (current) => ({
                            ...current,
                            id: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="compact-field">
                      <span>稳定 contactId</span>
                      <input
                        value={flip.contactId ?? ''}
                        onChange={(event) =>
                          updateBackgroundFlip(index, (current) => ({
                            ...current,
                            contactId: event.target.value || undefined,
                          }))
                        }
                      />
                    </label>
                    <label className="compact-field">
                      <span>出现日</span>
                      <input
                        type="number"
                        min={1}
                        max={pack.config.totalDays}
                        value={flip.day}
                        onChange={(event) =>
                          updateBackgroundFlip(index, (current) => ({
                            ...current,
                            day: Number(event.target.value) || 1,
                          }))
                        }
                      />
                    </label>
                    <label className="compact-field">
                      <span>互动类型</span>
                      <select
                        value={flip.reply !== undefined ? 'automatic' : 'chatter'}
                        onChange={(event) =>
                          updateBackgroundFlip(index, (current) =>
                            event.target.value === 'chatter'
                              ? {
                                  ...current,
                                  reply: undefined,
                                  continuations: current.continuations ?? [],
                                }
                              : {
                                  ...current,
                                  reply: current.reply ?? '填写成员自动发出的回复。',
                                  continuations: undefined,
                                },
                          )
                        }
                      >
                        <option value="chatter">NPC 闲聊（玩家只读）</option>
                        <option value="automatic">自动展示一问一答</option>
                      </select>
                    </label>
                    <label className="compact-field">
                      <span>NPC 昵称</span>
                      <input
                        value={flip.fanName}
                        onChange={(event) =>
                          updateBackgroundFlip(index, (current) => ({
                            ...current,
                            fanName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="compact-field">
                      <span>属性标签</span>
                      <input
                        value={flip.tag}
                        onChange={(event) =>
                          updateBackgroundFlip(index, (current) => ({
                            ...current,
                            tag: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="compact-field npc-flip-editor__avatar-field">
                      <span>头像路径（可空）</span>
                      <input
                        value={flip.avatar ?? ''}
                        onChange={(event) =>
                          updateBackgroundFlip(index, (current) => ({
                            ...current,
                            avatar: event.target.value || undefined,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <AutoGrowTextarea
                    label="NPC 第一条消息"
                    value={flip.message}
                    onChange={(value) =>
                      updateBackgroundFlip(index, (current) => ({ ...current, message: value }))
                    }
                    helpText="公开争议建议写明“双方说法冲突、尚无定论”，不要把指控写成事实。"
                  />

                  {flip.reply !== undefined ? (
                    <AutoGrowTextarea
                      label="成员自动回复"
                      value={flip.reply}
                      onChange={(value) =>
                        updateBackgroundFlip(index, (current) => ({ ...current, reply: value }))
                      }
                    />
                  ) : (
                    <div className="npc-continuation-editor-list">
                      {(flip.continuations ?? []).map((message, messageIndex) => (
                        <fieldset className="npc-continuation-editor" key={messageIndex}>
                          <legend>连续气泡 {messageIndex + 1}</legend>
                          <div className="npc-continuation-editor__topline">
                            <span>仍由同一 NPC 发出</span>
                            <button
                              type="button"
                              className="tiny-button"
                              aria-label={`删除 NPC 连续气泡 ${messageIndex + 1}`}
                              onClick={() =>
                                updateBackgroundFlip(index, (current) => ({
                                  ...current,
                                  continuations: current.continuations?.filter(
                                    (_, itemIndex) => itemIndex !== messageIndex,
                                  ),
                                }))
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <AutoGrowTextarea
                            label={`NPC 连续消息 ${messageIndex + 1}`}
                            value={message}
                            onChange={(value) =>
                              updateBackgroundFlip(index, (current) => ({
                                ...current,
                                continuations: current.continuations?.map((item, itemIndex) =>
                                  itemIndex === messageIndex ? value : item,
                                ),
                              }))
                            }
                            minRows={2}
                          />
                        </fieldset>
                      ))}
                      <button
                        type="button"
                        className="ghost-button npc-continuation-add"
                        disabled={(flip.continuations?.length ?? 0) >= 4}
                        onClick={() =>
                          updateBackgroundFlip(index, (current) => ({
                            ...current,
                            continuations: [
                              ...(current.continuations ?? []),
                              '填写 NPC 接着发来的下一条消息。',
                            ],
                          }))
                        }
                      >
                        <Plus size={13} /> 新增 NPC 连续气泡
                      </button>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <VariableHints variables={templateVariables} />
      </form>
    </>
  );
}

function NodeTemplatePreview({
  node,
  variables,
  profile,
}: {
  node: StoryNode;
  variables: TemplateVariables;
  profile: PlayerProfile;
}) {
  return (
    <section className="template-preview" aria-labelledby="template-preview-title">
      <div className="template-preview__heading">
        <div>
          <span>变量解析预览</span>
          <strong id="template-preview-title">玩家实际看到的文字</strong>
        </div>
        <span className="preview-identity">{profile.idolName}</span>
      </div>
      <article className="template-preview__message">
        <span>粉丝翻牌</span>
        <p>{renderTemplateText(node.content.text, variables)}</p>
      </article>
      <div className="template-preview__choices">
        {node.choices.map((choice, index) => (
          <article key={choice.id}>
            <span>回复 {index + 1}</span>
            <p>{renderTemplateText(choice.text, variables)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

interface InspectorProps {
  node: StoryNode;
  pack: StoryPack;
  previewProfile: PlayerProfile;
  templateVariables: TemplateVariables;
  onUpdate: (updater: (node: StoryNode) => StoryNode) => void;
  onRename: (nextId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function NodeInspector({
  node,
  pack,
  previewProfile,
  templateVariables,
  onUpdate,
  onRename,
  onDuplicate,
  onDelete,
}: InspectorProps) {
  const [idDraft, setIdDraft] = useState(node?.id ?? '');

  useEffect(() => setIdDraft(node?.id ?? ''), [node?.id]);

  const updateChoice = (choiceId: string, updater: (choice: StoryChoice) => StoryChoice) => {
    onUpdate((current) => ({
      ...current,
      choices: current.choices.map((choice) => (choice.id === choiceId ? updater(choice) : choice)),
    }));
  };

  const addChoice = () => {
    if (node.choices.length >= 4) return;
    const used = new Set(node.choices.map((choice) => choice.id));
    let index = node.choices.length + 1;
    while (used.has(`choice-${index}`)) index += 1;
    onUpdate((current) => ({
      ...current,
      choices: [
        ...current.choices,
        {
          id: `choice-${index}`,
          text: '新的预设回复',
          cost: { energy: 1, mindset: 1 },
          effects: { affinity: { [node.fanId]: 0 }, popularity: 0 },
        },
      ],
    }));
  };

  const updateTriggerCondition = (
    index: number,
    updater: (condition: StoryTriggerCondition) => StoryTriggerCondition,
  ) => {
    onUpdate((current) => ({
      ...current,
      trigger: current.trigger
        ? {
            ...current.trigger,
            conditions: current.trigger.conditions.map((condition, conditionIndex) =>
              conditionIndex === index ? updater(condition) : condition,
            ),
          }
        : undefined,
    }));
  };

  const addTriggerCondition = () => {
    onUpdate((current) => ({
      ...current,
      trigger: {
        match: current.trigger?.match ?? 'all',
        conditions: [
          ...(current.trigger?.conditions ?? []),
          { type: 'expired-flips-at-least', count: 1 },
        ],
      },
    }));
  };

  return (
    <>
      <div className="inspector-header">
        <div>
          <strong>翻牌节点</strong>
          <span>{node.id}</span>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="tiny-button"
            title="复制节点"
            aria-label="复制节点"
            onClick={onDuplicate}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="tiny-button"
            title="删除节点"
            aria-label="删除节点"
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <form className="inspector-body" noValidate onSubmit={(event) => event.preventDefault()}>
        <div className="form-grid">
          <label className="field full">
            <span>节点 ID</span>
            <input
              value={idDraft}
              onChange={(event) => setIdDraft(event.target.value)}
              onBlur={() => onRename(idDraft.trim())}
            />
          </label>
          <label className="field full">
            <span>标题</span>
            <input
              value={node.title}
              onChange={(event) =>
                onUpdate((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label className="field full">
            <span>故事线</span>
            <select
              value={node.fanId}
              onChange={(event) =>
                onUpdate((current) => ({ ...current, fanId: event.target.value }))
              }
            >
              {pack.fans.map((fan) => (
                <option key={fan.id} value={fan.id}>
                  {fan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>发布日期</span>
            <input
              type="number"
              min={1}
              max={pack.config.totalDays}
              value={node.postedDay}
              onChange={(event) =>
                onUpdate((current) => ({ ...current, postedDay: Number(event.target.value) }))
              }
            />
          </label>
          <label className="field">
            <span>回复期限</span>
            <input
              type="number"
              min={1}
              value={node.replyWindowDays}
              onChange={(event) =>
                onUpdate((current) => ({ ...current, replyWindowDays: Number(event.target.value) }))
              }
            />
          </label>
          <AutoGrowTextarea
            label="粉丝翻牌内容"
            value={node.content.text}
            helpText="支持插入下方列出的 {{变量}}，预览区会以当前身份解析。"
            onChange={(value) =>
              onUpdate((current) => ({
                ...current,
                content: { ...current.content, text: value },
              }))
            }
          />
          <label className="field full">
            <span>作者备注（玩家不可见）</span>
            <textarea
              className="resize-none"
              value={node.content.context ?? ''}
              onChange={(event) =>
                onUpdate((current) => ({
                  ...current,
                  content: { ...current.content, context: event.target.value || undefined },
                }))
              }
            />
          </label>
          <label className="checkbox-field full">
            <input
              type="checkbox"
              checked={node.content.public ?? false}
              onChange={(event) =>
                onUpdate((current) => ({
                  ...current,
                  content: { ...current.content, public: event.target.checked || undefined },
                }))
              }
            />
            公开事件（允许影响泛人气）
          </label>
        </div>

        <VariableHints variables={templateVariables} />

        <section className="inspector-section trigger-editor">
          <div className="section-heading">
            <span>日初触发条件</span>
            <button
              type="button"
              className="tiny-button"
              aria-label="新增触发条件"
              onClick={addTriggerCondition}
            >
              <Plus size={14} />
            </button>
          </div>
          <p className="section-help">
            条件只在新一天开始时检查；发布日期、前置连线与这里的条件需要同时满足。
          </p>
          {node.trigger?.conditions.length ? (
            <>
              <label className="compact-field trigger-match-field">
                <span>多条条件</span>
                <select
                  value={node.trigger.match}
                  onChange={(event) =>
                    onUpdate((current) => ({
                      ...current,
                      trigger: current.trigger
                        ? { ...current.trigger, match: event.target.value as 'all' | 'any' }
                        : undefined,
                    }))
                  }
                >
                  <option value="all">全部满足</option>
                  <option value="any">任意满足</option>
                </select>
              </label>
              <div className="trigger-condition-list">
                {node.trigger.conditions.map((condition, index) => (
                  <div className="trigger-condition-row" key={`${condition.type}-${index}`}>
                    <label className="compact-field">
                      <span className="sr-only">触发条件 {index + 1} 类型</span>
                      <select
                        aria-label={`触发条件 ${index + 1} 类型`}
                        value={condition.type}
                        onChange={(event) => {
                          const type = event.target.value as StoryTriggerCondition['type'];
                          updateTriggerCondition(index, () =>
                            type === 'flag-set' || type === 'flag-unset'
                              ? { type, flag: 'new-flag' }
                              : type === 'consecutive-replies-delayed-at-least'
                                ? {
                                    type,
                                    fanId: pack.fans[0]?.id ?? 'fan-id',
                                    count: 2,
                                    turns: 2,
                                  }
                                : { type, count: 1 },
                          );
                        }}
                      >
                        {Object.entries(TRIGGER_TYPE_LABELS).map(([type, label]) => (
                          <option key={type} value={type}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {'flag' in condition ? (
                      <label className="compact-field">
                        <span className="sr-only">触发条件 {index + 1} 标记</span>
                        <input
                          aria-label={`触发条件 ${index + 1} 标记`}
                          value={condition.flag}
                          onChange={(event) =>
                            updateTriggerCondition(index, (current) => ({
                              ...current,
                              flag: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : condition.type === 'consecutive-replies-delayed-at-least' ? (
                      <div className="trigger-delay-fields">
                        <label className="compact-field">
                          <span className="sr-only">触发条件 {index + 1} 粉丝</span>
                          <select
                            aria-label={`触发条件 ${index + 1} 粉丝`}
                            value={condition.fanId}
                            onChange={(event) =>
                              updateTriggerCondition(index, (current) =>
                                current.type === 'consecutive-replies-delayed-at-least'
                                  ? { ...current, fanId: event.target.value }
                                  : current,
                              )
                            }
                          >
                            {pack.fans.map((fan) => (
                              <option key={fan.id} value={fan.id}>
                                {fan.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="compact-field">
                          <span className="sr-only">触发条件 {index + 1} 连续次数</span>
                          <input
                            type="number"
                            min={1}
                            aria-label={`触发条件 ${index + 1} 连续次数`}
                            value={condition.count}
                            onChange={(event) =>
                              updateTriggerCondition(index, (current) =>
                                current.type === 'consecutive-replies-delayed-at-least'
                                  ? { ...current, count: Number(event.target.value) }
                                  : current,
                              )
                            }
                          />
                        </label>
                        <label className="compact-field">
                          <span className="sr-only">触发条件 {index + 1} 等待回合</span>
                          <input
                            type="number"
                            min={1}
                            aria-label={`触发条件 ${index + 1} 等待回合`}
                            value={condition.turns}
                            onChange={(event) =>
                              updateTriggerCondition(index, (current) =>
                                current.type === 'consecutive-replies-delayed-at-least'
                                  ? { ...current, turns: Number(event.target.value) }
                                  : current,
                              )
                            }
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="compact-field">
                        <span className="sr-only">触发条件 {index + 1} 数量</span>
                        <input
                          type="number"
                          min={1}
                          aria-label={`触发条件 ${index + 1} 数量`}
                          value={condition.count}
                          onChange={(event) =>
                            updateTriggerCondition(index, (current) => ({
                              ...current,
                              count: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="tiny-button"
                      aria-label={`删除触发条件 ${index + 1}`}
                      onClick={() =>
                        onUpdate((current) => {
                          if (!current.trigger) return current;
                          const conditions = current.trigger.conditions.filter(
                            (_, conditionIndex) => conditionIndex !== index,
                          );
                          return {
                            ...current,
                            trigger: conditions.length
                              ? { ...current.trigger, conditions }
                              : undefined,
                          };
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="compact-empty-state">无额外条件：到达发布日期并满足前置连线后出现。</p>
          )}
        </section>

        <section className="inspector-section">
          <div className="section-heading">
            <span>预设回复</span>
            <button
              type="button"
              className="tiny-button"
              aria-label="新增预设回复"
              disabled={node.choices.length >= 4}
              onClick={addChoice}
            >
              <Plus size={14} />
            </button>
          </div>
          {node.choices.map((choice, choiceIndex) => (
            <div className="choice-card" key={choice.id}>
              <div className="choice-card-head">
                <span>
                  回复 {choiceIndex + 1} · {choice.id}
                </span>
                {node.choices.length > 1 && (
                  <button
                    type="button"
                    className="tiny-button"
                    title="删除回复"
                    aria-label={`删除回复 ${choiceIndex + 1}`}
                    onClick={() =>
                      onUpdate((current) => ({
                        ...current,
                        choices: current.choices.filter((item) => item.id !== choice.id),
                      }))
                    }
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="form-grid">
                <AutoGrowTextarea
                  label="回复文字"
                  value={choice.text}
                  minRows={2}
                  onChange={(value) =>
                    updateChoice(choice.id, (current) => ({
                      ...current,
                      text: value,
                    }))
                  }
                />
                <label className="field">
                  <span>当前粉丝好感变化</span>
                  <input
                    type="number"
                    aria-label="当前粉丝好感变化"
                    value={choice.effects.affinity?.[node.fanId] ?? 0}
                    onChange={(event) =>
                      updateChoice(choice.id, (current) => ({
                        ...current,
                        effects: {
                          ...current.effects,
                          affinity: {
                            ...current.effects.affinity,
                            [node.fanId]: Number(event.target.value),
                          },
                        },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>泛人气变化</span>
                  <input
                    type="number"
                    aria-label="泛人气变化"
                    value={choice.effects.popularity}
                    onChange={(event) =>
                      updateChoice(choice.id, (current) => ({
                        ...current,
                        effects: {
                          ...current.effects,
                          popularity: Number(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>精力消耗</span>
                  <input
                    type="number"
                    min={1}
                    value={choice.cost.energy}
                    onChange={(event) =>
                      updateChoice(choice.id, (current) => ({
                        ...current,
                        cost: { ...current.cost, energy: Number(event.target.value) },
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>心情消耗</span>
                  <input
                    type="number"
                    min={1}
                    value={choice.cost.mindset}
                    onChange={(event) =>
                      updateChoice(choice.id, (current) => ({
                        ...current,
                        cost: { ...current.cost, mindset: Number(event.target.value) },
                      }))
                    }
                  />
                </label>
                <label className="field full">
                  <span>特殊结局</span>
                  <select
                    aria-label="特殊结局"
                    aria-describedby={`choice-ending-help-${choiceIndex}`}
                    value={choice.endingId ?? ''}
                    onChange={(event) =>
                      updateChoice(choice.id, (current) => ({
                        ...current,
                        endingId: event.target.value || undefined,
                        nextNodeId: event.target.value ? undefined : current.nextNodeId,
                        nextNodeTiming: event.target.value ? undefined : current.nextNodeTiming,
                      }))
                    }
                  >
                    <option value="">不触发特殊结局</option>
                    {pack.earlyEndings.map((ending) => (
                      <option key={ending.id} value={ending.id}>
                        {ending.title} ({ending.id})
                      </option>
                    ))}
                  </select>
                  <small className="field-help" id={`choice-ending-help-${choiceIndex}`}>
                    选择后不再连接后续节点；玩家看完结局会恢复到选择这条回复之前。
                  </small>
                </label>
                <label className="field full">
                  <span>后续节点</span>
                  <select
                    aria-label="后续节点"
                    disabled={Boolean(choice.endingId)}
                    value={choice.nextNodeId ?? ''}
                    onChange={(event) =>
                      updateChoice(choice.id, (current) => ({
                        ...current,
                        nextNodeId: event.target.value || undefined,
                        nextNodeTiming: event.target.value ? current.nextNodeTiming : undefined,
                      }))
                    }
                  >
                    <option value="">结束这条分支</option>
                    {pack.nodes
                      .filter((candidate) => candidate.id !== node.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          D{candidate.postedDay} · {candidate.title} ({candidate.id})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field full">
                  <span>后续节点出现时机</span>
                  <select
                    aria-label="后续节点出现时机"
                    aria-describedby={`choice-next-timing-help-${choiceIndex}`}
                    disabled={Boolean(choice.endingId) || !choice.nextNodeId}
                    value={choice.nextNodeTiming ?? 'day-start'}
                    onChange={(event) =>
                      updateChoice(choice.id, (current) => ({
                        ...current,
                        nextNodeTiming:
                          event.target.value === 'immediate' ? 'immediate' : undefined,
                      }))
                    }
                  >
                    <option value="day-start">下一次日初检查（默认）</option>
                    <option value="immediate">回复后立即出现</option>
                  </select>
                  <small className="field-help" id={`choice-next-timing-help-${choiceIndex}`}>
                    立即出现仍要求目标节点的发布日期不晚于当前游戏日，并满足目标触发条件。
                  </small>
                </label>
                <JsonField<StoryChoice['effects']>
                  label="效果 JSON"
                  value={choice.effects}
                  onCommit={(effects) =>
                    updateChoice(choice.id, (current) => ({
                      ...current,
                      effects: {
                        ...(effects ?? {}),
                        popularity: effects?.popularity ?? 0,
                      },
                    }))
                  }
                />
              </div>
            </div>
          ))}
        </section>

        <NodeTemplatePreview node={node} variables={templateVariables} profile={previewProfile} />

        <section className="inspector-section">
          <JsonField<ExpireOutcome>
            label="过期结果 JSON（空对象表示无结果）"
            value={node.onExpire}
            emptyMeansUndefined
            onCommit={(onExpire) => onUpdate((current) => ({ ...current, onExpire }))}
          />
        </section>
      </form>
    </>
  );
}

interface IssuePanelProps {
  issues: ValidationIssue[];
  onSelectNode: (nodeId: string) => void;
}

function IssuePanel({ issues, onSelectNode }: IssuePanelProps) {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  return (
    <div className="panel-section">
      <div className="section-heading">
        <span>剧情检查</span>
        <span className="count-badge">{issues.length}</span>
      </div>
      {issues.length === 0 ? (
        <div className="all-valid">
          <CheckCircle2 size={16} /> 没有发现问题
        </div>
      ) : (
        <>
          <div className="issue-summary">
            <span className="issue-chip error">{errors} 错误</span>
            <span className="issue-chip warning">{warnings} 提醒</span>
          </div>
          <div className="issue-list">
            {issues.map((issue, index) => (
              <button
                key={`${issue.code}-${issue.nodeId ?? issue.path}-${index}`}
                className={`issue-item ${issue.severity}`}
                onClick={() => issue.nodeId && onSelectNode(issue.nodeId)}
              >
                {issue.message}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DeleteNodeDialog({
  node,
  onCancel,
  onConfirm,
}: {
  node: StoryNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      aria-labelledby="delete-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="delete-title">删除“{node.title}”？</h2>
        <p>节点会被移除，指向它的回复连线也会自动断开。你仍然可以用撤销恢复。</p>
        <div className="modal-actions">
          <button className="ghost-button" autoFocus onClick={onCancel}>
            取消
          </button>
          <button className="danger-button" onClick={onConfirm}>
            删除节点
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function App() {
  const [pack, setPack] = useState<StoryPack>(() => clonePack(defaultStoryPack));
  const [previewProfile, setPreviewProfile] = useState<PlayerProfile>(() =>
    createPreviewProfile(defaultStoryPack),
  );
  const [past, setPast] = useState<StoryPack[]>([]);
  const [future, setFuture] = useState<StoryPack[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [visibleFanIds, setVisibleFanIds] = useState<Set<string>>(
    () => new Set(defaultStoryPack.fans.map((fan) => fan.id)),
  );
  const [fileHandle, setFileHandle] = useState<WritableFileHandle>();
  const [fileName, setFileName] = useState('test-story.json');
  const [dirty, setDirty] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<StoryNode>();
  const [toast, setToast] = useState<{ message: string; error?: boolean }>();
  const importRef = useRef<HTMLInputElement>(null);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);

  const issues = useMemo(() => validateStoryPack(pack), [pack]);
  const selectedNode = pack.nodes.find((node) => node.id === selectedNodeId);
  const directFileAccess = supportsDirectFileAccess();
  const templateVariables = useMemo<TemplateVariables>(() => {
    const usableTeamId = pack.profileSetup.teams.some((team) => team.id === previewProfile.teamId)
      ? previewProfile.teamId
      : pack.profileSetup.teams[0]?.id;
    if (!usableTeamId) {
      return {
        ...pack.globalVariables,
        idolName: previewProfile.idolName,
        idolNickname: buildIdolNickname(previewProfile.idolName),
        teamName: '',
        teamShortName: '',
      };
    }
    return buildTemplateVariables(pack, { ...previewProfile, teamId: usableTeamId });
  }, [pack, previewProfile]);

  useEffect(() => {
    setPreviewProfile((current) => {
      const profileSetup = pack.profileSetup ?? EMPTY_PROFILE_SETUP;
      const idolName =
        current.idolName ||
        profileSetup.namePools.adapted[0] ||
        profileSetup.namePools.original[0] ||
        '测试成员';
      const teamId = profileSetup.teams.some((team) => team.id === current.teamId)
        ? current.teamId
        : (profileSetup.teams[0]?.id ?? '');
      return idolName === current.idolName && teamId === current.teamId
        ? current
        : { idolName, teamId };
    });
  }, [pack.profileSetup]);

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(undefined), 2600);
  }, []);

  const commitPack = useCallback((updater: (current: StoryPack) => StoryPack) => {
    setPack((current) => {
      const next = updater(current);
      setPast((history) => [...history, clonePack(current)].slice(-HISTORY_LIMIT));
      setFuture([]);
      setDirty(true);
      return next;
    });
  }, []);

  const renameFanId = useCallback(
    (previousId: string, nextId: string) => {
      if (previousId === nextId) return;
      commitPack((current) => renameFanReferences(current, previousId, nextId));
      setVisibleFanIds((current) => {
        const next = new Set(current);
        if (next.delete(previousId)) next.add(nextId);
        return next;
      });
    },
    [commitPack],
  );

  const replacePack = useCallback((nextPack: StoryPack, nextName: string) => {
    setPack(clonePack(nextPack));
    setPreviewProfile(createPreviewProfile(nextPack));
    setPast([]);
    setFuture([]);
    setSelectedNodeId(undefined);
    setVisibleFanIds(new Set(nextPack.fans.map((fan) => fan.id)));
    setFileName(nextName);
    setDirty(false);
  }, []);

  const updateNode = useCallback(
    (nodeId: string, updater: (node: StoryNode) => StoryNode) => {
      commitPack((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
      }));
    },
    [commitPack],
  );

  const graphNodes = useMemo<Node[]>(() => {
    const eventDays = new Set(
      pack.turnEvents.map((event) => 1 + (event.turn - 1) * pack.config.turnDays),
    );
    const dayNodes: DayFlowNode[] = Array.from({ length: pack.config.totalDays }, (_, index) => {
      const day = index + 1;
      return {
        id: `__day-${day}`,
        type: 'day',
        data: { day, hasEvent: eventDays.has(day) },
        position: { x: index * DAY_GAP + 70, y: -150 },
        selectable: false,
        draggable: false,
        connectable: false,
        focusable: false,
        zIndex: -1,
      };
    });
    const fanMap = new Map(pack.fans.map((fan) => [fan.id, fan]));
    const storyNodes: StoryFlowNode[] = pack.nodes
      .filter((node) => visibleFanIds.has(node.fanId))
      .flatMap((node) => {
        const fan = fanMap.get(node.fanId);
        if (!fan) return [];
        return [
          {
            id: node.id,
            type: 'story',
            data: { storyNode: node, fan },
            position: {
              x: (node.postedDay - 1) * DAY_GAP,
              y: node.editor?.y ?? pack.fans.findIndex((item) => item.id === node.fanId) * 240,
            },
            selected: node.id === selectedNodeId,
          } satisfies StoryFlowNode,
        ];
      });
    return [...dayNodes, ...storyNodes];
  }, [pack, selectedNodeId, visibleFanIds]);

  useEffect(() => setFlowNodes(graphNodes), [graphNodes, setFlowNodes]);

  const graphEdges = useMemo<Edge[]>(() => {
    const visibleNodes = new Set(
      pack.nodes.filter((node) => visibleFanIds.has(node.fanId)).map((node) => node.id),
    );
    return pack.nodes.flatMap((node) =>
      node.choices.flatMap((choice) => {
        if (
          !choice.nextNodeId ||
          !visibleNodes.has(node.id) ||
          !visibleNodes.has(choice.nextNodeId)
        ) {
          return [];
        }
        return [
          {
            id: `${node.id}--${choice.id}--${choice.nextNodeId}`,
            source: node.id,
            target: choice.nextNodeId,
            label: `${choice.nextNodeTiming === 'immediate' ? '立即 · ' : ''}${
              choice.text.length > 12 ? `${choice.text.slice(0, 12)}…` : choice.text
            }`,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#706f79' },
            style: { stroke: '#706f79', strokeWidth: 1.4 },
            labelStyle: { fill: '#a7a5b0' },
            labelBgPadding: [5, 3],
            labelBgBorderRadius: 5,
          },
        ];
      }),
    );
  }, [pack, visibleFanIds]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((history) => history.slice(0, -1));
    setFuture((history) => [clonePack(pack), ...history].slice(0, HISTORY_LIMIT));
    setPack(previous);
    setDirty(true);
  }, [pack, past]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((history) => history.slice(1));
    setPast((history) => [...history, clonePack(pack)].slice(-HISTORY_LIMIT));
    setPack(next);
    setDirty(true);
  }, [future, pack]);

  useEffect(() => {
    document.title = '剧情工作台 — Clip Simulator';
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  const handleOpen = async () => {
    if (!directFileAccess) {
      importRef.current?.click();
      return;
    }
    try {
      const result = await openStoryFile();
      replacePack(result.pack, result.handle.name);
      setFileHandle(result.handle);
      notify(`已打开 ${result.handle.name}`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      notify(reason instanceof Error ? reason.message : '文件打开失败', true);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      replacePack(await parseImportedFile(file), file.name);
      setFileHandle(undefined);
      notify(`已导入 ${file.name}`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'JSON 导入失败', true);
    }
  };

  const saveToHandle = async (handle: WritableFileHandle) => {
    if (hasValidationErrors(issues)) {
      notify('请先处理剧情检查中的错误，再保存文件', true);
      return;
    }
    await writeStoryFile(handle, pack);
    setFileHandle(handle);
    setFileName(handle.name);
    setDirty(false);
    notify(`已保存 ${handle.name}`);
  };

  const handleSave = async (saveAs = false) => {
    if (hasValidationErrors(issues)) {
      notify('请先处理剧情检查中的错误，再保存文件', true);
      return;
    }
    try {
      if (directFileAccess) {
        const handle = !saveAs && fileHandle ? fileHandle : await chooseSaveHandle(fileName);
        await saveToHandle(handle);
      } else {
        downloadStoryFile(pack, fileName);
        setDirty(false);
        notify(`已下载 ${fileName}`);
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      notify(reason instanceof Error ? reason.message : '保存失败', true);
    }
  };

  const toggleFan = (fanId: string) => {
    setVisibleFanIds((current) => {
      const next = new Set(current);
      if (next.has(fanId)) next.delete(fanId);
      else next.add(fanId);
      return next;
    });
  };

  const createNode = () => {
    const fan = pack.fans.find((item) => visibleFanIds.has(item.id)) ?? pack.fans[0];
    if (!fan) return;
    const used = new Set(pack.nodes.map((node) => node.id));
    let index = pack.nodes.length + 1;
    while (used.has(`${fan.id}-${String(index).padStart(2, '0')}`)) index += 1;
    const id = `${fan.id}-${String(index).padStart(2, '0')}`;
    const node: StoryNode = {
      id,
      fanId: fan.id,
      title: '新的翻牌',
      postedDay: 1,
      replyWindowDays: 7,
      content: { text: '在这里填写粉丝发来的翻牌。' },
      choices: [
        {
          id: 'reply-1',
          text: '在这里填写偶像的预设回复。',
          cost: { energy: 1, mindset: 1 },
          effects: { affinity: { [fan.id]: 1 }, popularity: 0 },
        },
      ],
      onExpire: { affinity: { [fan.id]: -1 } },
      editor: { y: pack.fans.findIndex((item) => item.id === fan.id) * 240 },
    };
    commitPack((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(id);
  };

  const renameSelectedNode = (nextId: string) => {
    if (!selectedNode || nextId === selectedNode.id) return;
    if (!nextId) {
      notify('节点 ID 不能为空', true);
      return;
    }
    if (pack.nodes.some((node) => node.id === nextId)) {
      notify(`节点 ID 已存在：${nextId}`, true);
      return;
    }
    const previousId = selectedNode.id;
    commitPack((current) => ({
      ...current,
      nodes: current.nodes.map((node) => ({
        ...node,
        id: node.id === previousId ? nextId : node.id,
        choices: node.choices.map((choice) => ({
          ...choice,
          nextNodeId: choice.nextNodeId === previousId ? nextId : choice.nextNodeId,
        })),
        onExpire: node.onExpire
          ? {
              ...node.onExpire,
              nextNodeId:
                node.onExpire.nextNodeId === previousId ? nextId : node.onExpire.nextNodeId,
            }
          : undefined,
      })),
    }));
    setSelectedNodeId(nextId);
  };

  const duplicateSelectedNode = () => {
    if (!selectedNode) return;
    const used = new Set(pack.nodes.map((node) => node.id));
    let suffix = 2;
    while (used.has(`${selectedNode.id}-copy-${suffix}`)) suffix += 1;
    const id = `${selectedNode.id}-copy-${suffix}`;
    const duplicate: StoryNode = {
      ...clonePack({ ...pack, nodes: [selectedNode] }).nodes[0]!,
      id,
      title: `${selectedNode.title}（副本）`,
      postedDay: Math.min(pack.config.totalDays, selectedNode.postedDay + 1),
      editor: { y: (selectedNode.editor?.y ?? 0) + 120 },
    };
    commitPack((current) => ({ ...current, nodes: [...current.nodes, duplicate] }));
    setSelectedNodeId(id);
  };

  const deleteSelectedNode = () => {
    if (!deleteCandidate) return;
    const nodeId = deleteCandidate.id;
    commitPack((current) => ({
      ...current,
      nodes: current.nodes
        .filter((node) => node.id !== nodeId)
        .map((node) => ({
          ...node,
          choices: node.choices.map((choice) => ({
            ...choice,
            nextNodeId: choice.nextNodeId === nodeId ? undefined : choice.nextNodeId,
            nextNodeTiming: choice.nextNodeId === nodeId ? undefined : choice.nextNodeTiming,
          })),
          onExpire: node.onExpire
            ? {
                ...node.onExpire,
                nextNodeId:
                  node.onExpire.nextNodeId === nodeId ? undefined : node.onExpire.nextNodeId,
              }
            : undefined,
        })),
    }));
    setSelectedNodeId(undefined);
    setDeleteCandidate(undefined);
    notify(`已删除 ${nodeId}`);
  };

  const selectIssueNode = (nodeId: string) => {
    const node = pack.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setVisibleFanIds((current) => new Set(current).add(node.fanId));
    setSelectedNodeId(nodeId);
  };

  return (
    <div className="editor-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={18} />
          </div>
          <div>
            <strong>翻牌剧情工作台</strong>
            <span>仅限本地开发 · 不进入游戏构建</span>
          </div>
        </div>
        <div className="toolbar-group">
          <button className="tool-button" onClick={handleOpen}>
            {directFileAccess ? <FolderOpen size={15} /> : <Upload size={15} />} 打开
          </button>
          <button className="tool-button" onClick={() => void handleSave(false)}>
            <Save size={15} /> 保存
          </button>
          <button className="tool-button" onClick={() => void handleSave(true)}>
            <Download size={15} /> {directFileAccess ? '另存为' : '下载'}
          </button>
        </div>
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <button
            className="tool-button icon-only"
            title="撤销 Ctrl+Z"
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 size={15} />
          </button>
          <button
            className="tool-button icon-only"
            title="重做 Ctrl+Y"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={15} />
          </button>
        </div>
        <div className="topbar-spacer" />
        <div className="file-state" title={fileName}>
          {dirty && <span className="dirty-dot" />}
          {fileName}
        </div>
        <button className="primary-button" onClick={createNode}>
          <Plus size={15} /> 新建节点
        </button>
        <input
          ref={importRef}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
        />
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <section className="panel-section">
            <div className="section-heading">
              <span>内容包</span>
            </div>
            <h1 className="story-title">{pack.title}</h1>
            <p className="story-meta">
              {pack.config.totalDays} 天 · {pack.config.maxTurns} 回合
              <br />
              {pack.nodes.length} 个核心翻牌 · v{pack.contentVersion}
            </p>
            <button
              type="button"
              className="ghost-button sidebar-action"
              onClick={() => setSelectedNodeId(undefined)}
            >
              编辑内容包与变量
            </button>
          </section>
          <section className="panel-section">
            <div className="section-heading">
              <span>故事线筛选</span>
              <span className="count-badge">
                {visibleFanIds.size}/{pack.fans.length}
              </span>
            </div>
            <div className="filter-list">
              {pack.fans.map((fan) => (
                <label className="filter-row" key={fan.id}>
                  <input
                    type="checkbox"
                    checked={visibleFanIds.has(fan.id)}
                    onChange={() => toggleFan(fan.id)}
                  />
                  <span className="fan-dot" style={{ '--fan-accent': fan.accent } as CSSProperties}>
                    <AvatarPreview avatar={fan.avatar} />
                  </span>
                  <span className="filter-name">{fan.name}</span>
                  <span className="filter-count">
                    {pack.nodes.filter((node) => node.fanId === fan.id).length}
                  </span>
                </label>
              ))}
            </div>
            <button
              className="ghost-button sidebar-action"
              onClick={() =>
                setVisibleFanIds(
                  visibleFanIds.size === pack.fans.length
                    ? new Set()
                    : new Set(pack.fans.map((fan) => fan.id)),
                )
              }
            >
              {visibleFanIds.size === pack.fans.length ? '全部隐藏' : '全部显示'}
            </button>
          </section>
          <IssuePanel issues={issues} onSelectNode={selectIssueNode} />
        </aside>

        <section className="canvas-wrap" aria-label="剧情节点图">
          <div className="canvas-titlebar">
            <GitBranch size={14} /> 横轴固定为自然日；拖动节点会吸附到最近一天
          </div>
          <ReactFlow
            nodes={flowNodes}
            edges={graphEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => node.type === 'story' && setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(undefined)}
            onNodeDragStop={(_, node) => {
              if (node.type !== 'story') return;
              const postedDay = Math.max(
                1,
                Math.min(pack.config.totalDays, Math.round(node.position.x / DAY_GAP) + 1),
              );
              updateNode(node.id, (current) => ({
                ...current,
                postedDay,
                editor: { y: Math.round(node.position.y / 20) * 20 },
              }));
            }}
            defaultViewport={{ x: 44, y: 170, zoom: 0.78 }}
            minZoom={0.12}
            maxZoom={1.4}
            snapToGrid
            snapGrid={[20, 20]}
            nodesConnectable={false}
            deleteKeyCode={null}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(255,255,255,.08)"
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                if (node.type === 'day') return 'transparent';
                const fanId = (node.data as StoryNodeData).fan.id;
                return pack.fans.find((fan) => fan.id === fanId)?.accent ?? '#706f79';
              }}
              maskColor="rgba(12,12,16,.72)"
            />
          </ReactFlow>
        </section>

        <aside className="inspector">
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              pack={pack}
              previewProfile={previewProfile}
              templateVariables={templateVariables}
              onUpdate={(updater) => updateNode(selectedNode.id, updater)}
              onRename={renameSelectedNode}
              onDuplicate={duplicateSelectedNode}
              onDelete={() => setDeleteCandidate(selectedNode)}
            />
          ) : (
            <ContentPackInspector
              pack={pack}
              previewProfile={previewProfile}
              templateVariables={templateVariables}
              onUpdate={commitPack}
              onRenameFanId={renameFanId}
              onPreviewProfileChange={setPreviewProfile}
            />
          )}
        </aside>
      </main>

      <footer className="statusbar">
        <span className={hasValidationErrors(issues) ? 'bad' : 'ok'}>
          {hasValidationErrors(issues) ? '剧情文件存在错误' : '剧情结构可用'}
        </span>
        <span>{pack.nodes.length} 节点</span>
        <span>{graphEdges.length} 条可见连接</span>
        <span className="statusbar-spacer" />
        <span>
          <FileJson size={11} /> 数据不会上传服务器
        </span>
      </footer>

      {deleteCandidate && (
        <DeleteNodeDialog
          node={deleteCandidate}
          onCancel={() => setDeleteCandidate(undefined)}
          onConfirm={deleteSelectedNode}
        />
      )}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.message}</div>}
    </div>
  );
}
