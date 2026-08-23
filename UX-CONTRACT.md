# UX Contract

## Product context

- Audience: Chinese-speaking 48-series fans and the game's story author.
- Primary jobs: finish a short reply-simulation run; separately author, validate, and save story graphs on a developer machine.
- Target market: Chinese-language web distribution.
- Active locales: `zh-CN`.
- Language/content register: conversational fandom-aware game copy; literal task-oriented editor copy.
- Timezone/calendar policy: the game uses fictional numbered natural days (Day 1–30), not device timezones.
- Accessibility target: WCAG 2.2 AA baseline.

## Business-context sources

| Domain / scope                     | Authoritative source               | Source type                         | Reviewed date |
| ---------------------------------- | ---------------------------------- | ----------------------------------- | ------------- |
| Game loop and state                | `docs/GAME_MECHANICS_SPEC.md`      | Maintained product specification    | 2026-08-22    |
| Reference information architecture | `references/ui-pocket48/README.md` | Curated external UI reference notes | 2026-08-22    |
| Current implementation scope       | Current user request in this task  | Explicit product decision           | 2026-08-23    |

The project has no permissions, payments, accounts, remote data retention, or external side effects.

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: runtime CSS canonical; `DESIGN.md` mirrors exact accepted values and intent.
- Runtime token sources: `apps/game/src/styles/tokens.css` and `apps/editor/src/styles/tokens.css`.
- Mapping: semantic CSS custom properties consumed by shared and route components.
- Token drift gate: `designmd lint`, project typecheck/build, premium static audit, and browser screenshots.
- Supported themes: one continuous expressive light game surface and a separate dark editor surface; the player entry never mixes both themes.
- Design-context owner/review policy: update `DESIGN.md` and runtime tokens together for durable visual decisions.

## Canonical UI Map

| Capability     | Canonical owner                                                               | Source of truth              | Allowed variants                  | Verification          |
| -------------- | ----------------------------------------------------------------------------- | ---------------------------- | --------------------------------- | --------------------- |
| Select/Listbox | Radix Select for player team choice; native select for bounded editor filters | This contract                | identity-authored / editor-native | keyboard + open popup |
| Date           | Shared numeric day field                                                      | Game schema + this contract  | typed day 1–30                    | unit + browser        |
| Form           | Shared identity form and editor field classes                                 | Story schema + this contract | first setup / settings / editor   | unit + browser        |
| Scrollbar      | Global rules in `src/styles/global.css`                                       | `DESIGN.md`                  | stable-gutter exception           | computed/browser      |
| Toast          | Shared `ToastRegion`                                                          | This contract                | success / warning / info / error  | component/browser     |
| CRUD           | Local history-backed editor operations                                        | Story schema + this contract | inline inspector                  | unit + browser        |

Table selection is not applicable. There is no server-owned dataset.

## Component behavior

| Component     | Default                        | Hover         | Focus       | Active           | Disabled       | Busy              | Error                |
| ------------- | ------------------------------ | ------------- | ----------- | ---------------- | -------------- | ----------------- | -------------------- |
| Button        | intent + emphasis              | tonal lift    | violet ring | 1px press        | muted + reason | stable label area | inline/status        |
| Icon button   | visible icon + accessible name | tonal lift    | violet ring | 1px press        | muted          | stable            | status               |
| Input         | labeled border                 | darker border | violet ring | n/a              | muted          | n/a               | danger border + text |
| Search/filter | explicit label                 | standard      | standard    | selected chip    | n/a            | n/a               | validation summary   |
| Textarea      | resize none                    | standard      | violet ring | n/a              | muted          | n/a               | danger border + text |
| Story node    | fan/date summary               | lift          | violet ring | selected outline | invalid badge  | n/a               | error badge + panel  |

The player application suppresses document text selection and the browsing/insertion caret outside genuine form controls. The member-name input in first-run setup and settings is an explicit exception: it restores native text selection, the text cursor, a visible caret, and keyboard editing while preserving visible focus. This rule does not apply to the separate editor application, whose fields retain normal document and form selection behavior.

## Dataset navigation

- Story nodes and background flips are bounded and rendered in full.
- The active story-line filter is local editor state; URL persistence is unnecessary because editor drafts and viewport are not shareable content.
- Empty graph, no matching line, invalid import, and validation-error states each provide a direct recovery action.
- Graph pan/zoom is never the only navigation path; filtering and the inspector day/next-node fields provide non-drag access.

## Flow ledger

| Operation         | Trigger                          | Pending                      | Success destination   | Success feedback                     | Failure recovery                       | Focus outcome             | Source ref   |
| ----------------- | -------------------------------- | ---------------------------- | --------------------- | ------------------------------------ | -------------------------------------- | ------------------------- | ------------ |
| Set up identity   | first visit without profile      | local form                   | member profile        | saved name/team in profile header    | inline errors; keep entered values     | first invalid/profile     | current task |
| Edit identity     | profile form in settings         | local form                   | stay in settings      | preview and templated copy refresh   | keep previous profile until valid save | identity heading/field    | current task |
| Open flip tool    | Member workbench “翻牌” card     | immediate local load/init    | flip workbench        | one status-ordered conversation feed | remain on member profile if init fails | workbench heading         | current task |
| Open conversation | Row in the single message feed   | immediate local derivation   | full chat history     | reached messages in date order       | return to the same feed position       | chat heading              | current task |
| Change mode       | Member settings mode card        | immediate local preference   | stay in settings      | selected mode state                  | keep previous mode on storage failure  | selected mode card        | current task |
| Restart game      | “放弃进度，从头开始” in settings | immediate local reset        | flip workbench        | day-one state; identity retained     | keep settings reachable                | workbench heading         | current task |
| Reply             | reply option                     | immediate local commit       | reply result          | inline delta/result                  | disabled reason before action          | result action             | game spec    |
| Advance day       | “几天后” / final “进入总选”      | short transition             | next workbench/finale | date event card or election result   | retain current turn on error           | new-day/finale heading    | game spec    |
| Edit node         | inspector field                  | local history commit         | stay in inspector     | local draft status                   | validation panel + undo                | edited field              | game spec    |
| Create node       | “新增翻牌”                       | immediate                    | selected node         | toast + selected node                | undo                                   | title field/selected node | game spec    |
| Delete node       | “删除节点”                       | confirmation dialog          | graph                 | toast + undo history                 | cancel keeps context                   | next node/graph heading   | game spec    |
| Import pack       | visible file picker              | local parse                  | editor draft          | toast + validation                   | keep current pack; show error          | validation summary        | game spec    |
| Export pack       | “导出内容包”                     | immediate Blob creation      | stay in editor        | toast                                | validation blocks export               | export button/status      | game spec    |
| Save content file | “保存剧情文件”                   | validate then write/download | stay in editor        | local-save status                    | keep draft; show validation/file error | validation summary/button | game spec    |

## Navigation and responsive behavior

- Products and titles: the deployed game owns `成员口袋 — 工作台`; the local editor owns `剧情工坊 — Clip Simulator`.
- The game and editor are separate Vite applications and separate build outputs. Neither links to or routes into the other.
- A first visit without a valid local `PlayerProfile` opens identity setup before the member profile. The form starts with a content-pack name suggestion, lets the player type or request another constrained-random name from `profileSetup.namePools`, and chooses one `profileSetup.teams` entry through an authored Select. The trigger shows only the selected content-defined team mark; the equal-width popup presents every team without a redundant preview rail. The first three suggestions in one form session use the adapted pool; the automatic first-visit suggestion counts as the first. When both pools contain names, later aligned five-suggestion groups shuffle exactly two adapted and three original sources; when the original pool is empty, every request falls back to adapted. The current test pack uses only 70 adapted names, one fictionalized candidate per active member in the four-team SNH48 roster snapshot. Existing-profile settings do not draw until the random button is pressed, and closing a form ends that cosmetic suggestion sequence. Source categories stay invisible to players and never enter profile or run state. Above the form, one short premise identifies the player as a new fictional 48 idol, derives the first-election countdown from `config.totalDays`, and asks how she will answer fan flips; it does not expand resources, affinity, votes, or other rules. A returning player with a valid profile skips setup and opens the fictional member profile/workbench. The profile uses an original anonymous idol back-view image, and fan conversations use bundled original social-avatar photography rather than external hotlinks or identifiable people. Clicking “翻牌” directly resumes a playing save or creates a new run from the saved display preference. Identity editing, mode selection, and “放弃进度，从头开始” live in the member settings sheet.
- The first-visit team popup portals to the document overlay layer. The settings variant portals to the modal dialog but outside its `.settings-sheet__content` scroll owner, so Radix focus management cannot change the page or sheet scroll position when the popup opens or closes.

- Story-node trigger conditions are evaluated only at initial day setup and when a later day begins. The day-start order is: advance the numbered day, expire overdue pending flips and apply their effects, apply the scheduled turn event and recovery, then activate every dated/unlocked node whose trigger expression passes. Replying, changing flags, or ordering takeout during a day records state but does not inject a newly eligible conditional node until the next day-start check. The configured takeout early-ending threshold remains an immediate ending rule and is not delayed, because it is not a story-node trigger.
- The identity form uses `noValidate` and app-owned inline validation. The trimmed idol name is required and limited to 16 characters; team ID must match a team in the active content pack. Errors preserve both values, associate text through `aria-invalid`/`aria-describedby`, and focus the first invalid field. The random-name control is `type="button"`, never submits the form, and leaves its result editable. Radix Select owns the team popup geometry, collision behavior, and keyboard interaction.
- Game page depth is mirrored into the browser History API without changing the shareable URL. Browser Back and every in-game back control consume the same stack: settings closes before leaving the member profile, a conversation returns to the single message feed with its pre-open scroll position and row context, and the flip workbench returns to the member profile before the browser can leave the game. Committing a reply replaces its actionable conversation entry with the result entry, so Back cannot reopen an already submitted choice; returning to the feed resolves focus to that conversation's current row even when its status and position changed.
- Browser Forward restores valid game layers from the current in-memory/local save. Stale reply/result entries fall back to the nearest valid workbench or ending instead of rendering an obsolete action.
- “翻牌” is the only actionable workbench card. The other three cards are non-interactive placeholders with explicit unavailable treatment, and no secondary quick-tool row is shown.
- The flip page header's top-right status reads “离总选结束还剩 X 天”. It derives `X` as `max(0, totalDays - currentDay)` from the active story pack and save rather than from device time, and updates after every turn transition.
- The flip workbench is one continuous message feed; pending/replied status controls ordering only and is not a selectable view. “未回复” flips appear first and sort by earliest deadline. A visible, non-interactive splitter labeled “已回复” separates them from replied history; the splitter never hides content, receives focus, or behaves like a filter. Every actionable StoryNode appears as its own row above the splitter, while reached history below the splitter is aggregated by contact; core-fan conversations remain pinned before ordinary fans and each replied group sorts by recent activity. Both groups use the same conversation-row grammar, and no player-facing copy identifies ordinary fans as NPCs. An inline empty state applies only to its own group and never replaces the other group.
- Each pending row exposes that flip's own message preview and a top-right “还有 X 天过期” label whose accessible name includes the same remaining-day value and the word “过期”. On a non-final turn, when `nextTurnDay > deadlineDay`, advancing would settle that flip as expired and the label uses the semantic danger color; when the two days are equal, the flip remains replyable next turn and the label stays muted. The final turn enters the election directly and never applies this expiry-warning state. The wording is unchanged in the danger state, so status and consequence remain understandable without color. Two pending flips from the same fan appear as two rows, with no aggregate count badge; either row can be opened and handled independently. Resolving or expiring one removes only that pending row and does not hide or reorder the other except through the normal deadline sort.
- When the latest exchange in a replied contact is expired, its list row previews that flip's concrete incoming body and the top-right status reads “已过期”; neither position uses generic “错过回复” placeholder copy. A conversation uses a light chronological chat-thread layout and includes the contact's resolved history plus the pending StoryNode selected from the feed, when present. Another pending flip from the same contact remains a separate list entry and never shares the current choice group. A centered day marker appears when the transcript enters a new content day; multiple exchanges on that day share it. Fan content is the left message, completed idol replies are right messages, and author-only context is not rendered. Every expired exchange keeps its original body and adds its own centered “这条翻牌已于第 X 日 24:00 过期” status, where `X` is that node's deadline. Ordinary-fan and completed conversations never expose reply options. Every reply cost exposes both a visible signed number plus the corresponding energy/mindset icon and a complete accessible label.
- Preset reply text is always read before commitment and remains the same text in the candidate card, immediate sent-message result, and historical idol bubble. Long replies render in full with authored paragraph breaks and safe word wrapping. They never use line clamping, an expand/confirmation step, or an internal card scrollbar; the page/document owns scrolling, and the cost row remains after the complete text. The player never receives a free-text input.
- The member profile's pocket navigation is fixed to the visual viewport bottom, width-capped with the phone surface, and uses the main white account surface. The member-profile workbench grows to and behind that navigation, owning its reserved bottom/safe-area space so no main-surface gap appears between them.
- The flip workbench uses a separate fixed bottom action rail with “点外卖” and “几天后”; on the final turn the latter is labeled “进入总选”. It is fixed at visual-viewport `bottom: 0` with no outside margin or desktop-only bottom offset. The action rail uses exactly the phone frame's outer width/max-width and stays centered with it on wide viewports; it must not stretch to the desktop viewport when the phone frame is capped. Its opaque background continues through the device bottom safe-area inset so list content cannot remain visible below or through the rail. The flip screen reserves at least the rail's full outer height (controls plus inset), allowing the final row, empty state, scrollbar endpoint, and focused controls to scroll completely above it. The rail may show the recovery amount and whether takeout is available this turn, but never shows the accumulated takeout count.
- Game is phone-first and centered on wide screens. Editor is desktop-first; below 900px the inspector follows the canvas in document flow.
- Focused controls must not sit behind the mobile action bar; safe-area and scroll margins are mandatory.
- Unknown hash routes return to a small app-owned not-found surface with links to game/editor.

## Identity and template resolution

- `PlayerProfile` contains only `idolName` and the stable `teamId`. It is stored under an independent guarded local-storage key with in-memory fallback, not inside `GameState`, achievements, or the content pack. Restarting or replacing a run never clears it; clearing site data does. If its team no longer exists in the active pack or its name fails validation, the game returns to identity setup instead of guessing a team.
- Saving a valid identity from settings applies immediately without restarting or changing resources, affinity, story flags, or vote logic. Because content is resolved at render/load time rather than snapshotted into the save, changing identity re-renders both historical and future player-visible text with the new profile.
- The reserved runtime variables are `{{idolName}}`, `{{teamName}}`, and `{{teamShortName}}`; `teamName` and `teamShortName` come from the profile's selected team. The content pack may add literal strings through top-level `globalVariables`, but cannot override a reserved name.
- One story-core resolver builds the variable context and transforms every supported player-visible content field for both the game and editor preview. Raw JSON and saved choice IDs remain unresolved. Resolution is a single pass: values inserted from a profile or `globalVariables` are treated as literal text and are not parsed again as templates.
- The editor provides a local preview identity, renders resolved text beside authoring context, and keeps raw placeholders in the saved pack. Unknown or malformed variables stay visible in preview and produce a persistent validation error that blocks validated export/apply; the runtime never silently replaces them with an empty string.

## Overlays and feedback

- Dialog primitive: app-owned wrapper around native HTML `dialog`, with explicit title/actions, Escape handling, and focus restoration.
- Destructive confirmation: deleting a node is recoverable through editor history but still receives a warning confirmation because edges may change.
- Toasts: one bottom-center live region, deduplicated; routine messages dismiss automatically and are never the only error source.
- Unsaved changes: editor changes stay in memory until explicitly saved/downloaded. A dirty indicator and browser leave warning protect the draft; the game never reads editor memory.
- Layer order: graph < sticky toolbars < inspector < dialog < toast.

## Async and resilience

- No remote mutations exist.
- Game saves use guarded `localStorage` access with in-memory fallback for the current session.
- The independent `PlayerProfile` uses the same guarded-storage behavior but a separate key and lifecycle from the run save. A storage write failure keeps the accepted profile for the current in-memory session and never erases the active run.
- Editor drafts use guarded local storage, while explicit save writes or downloads a validated JSON content file. Import/open failures never replace the active draft.
- Multi-tab edits use last-local-write-wins; the first version does not claim collaborative consistency.
- File import is parsed and validated before commit. No automatic retries or background jobs exist.

## Validation

- Zod owns structural content validation; graph validation owns references, cycles, dates, reachability, and pacing warnings.
- Story-pack validation owns unique teams, the adapted-pool minimum and cross-pool uniqueness of configured profile names, valid static variable names, reserved-name collisions, and unknown/malformed template references. The original pool may be empty. Template errors include the source path and node ID when applicable.
- Editor fields update the local draft immediately; validation updates after each committed change.
- Reply text longer than 140 characters produces an editor warning, not a schema error; it never blocks save/export. The editor and player preserve authored paragraph breaks.
- Import and apply-preview actions show a persistent validation summary and do not rely on toasts.
- Forms use `noValidate`; textareas use `resize: none`; invalid controls expose visible text and ARIA state.

## Verification

- Required commands: format check, typecheck, unit tests, production build, premium audit, browser playtest.
- Browser matrix: Chromium desktop editor, Chromium 390×844 game, reduced-motion check, keyboard-only core flows.
- Component/state coverage: first-visit identity setup; manual/constrained-random name; adapted-only fallback with an empty original pool; separate 20/0 editor pools and explicit empty state; 16-character and empty-name boundaries; authored team selection; stable page/sheet scroll while its popup opens and closes; keyboard selection/caret behavior; profile persistence across reload and restart; settings edits; invalid stored team recovery; reserved/global/unknown template variables in game and editor preview; total-election remaining-day copy at the first, intermediate, and zero-day boundaries; single-feed pending/replied ordering; the non-interactive splitter; one and several pending StoryNode rows from the same fan; per-row expiry labels below, equal to, and above the strict `nextTurnDay > deadlineDay` danger threshold; the no-warning final-turn exception; concrete expired-row previews and “已过期” status; grouped chat-day markers and per-expired-exchange deadline status; independent selection; replied-contact aggregation; long replies with paragraphs and over-140 warning; no clamp, confirmation, or nested scrollbar; conversation status movement; long-list fixed action-rail coverage and safe area; hidden accumulated takeout count; mode selection; insufficient resources; affinity display modes; expiration; takeout ending; election ending; plus editor-only open/save errors, graph filtering, empty data, and invalid content.
- Canonical sibling comparison: game workbench/reply result share player feedback; editor create/edit/delete share one inspector and toast system.
