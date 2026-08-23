---
version: alpha
name: 'Clip Simulator'
description: 'A mobile-first idol reply simulator with a separate local timeline story workshop.'
colors:
  primary: '#F04F72'
  primary-soft: '#FFF0F4'
  secondary: '#7457C8'
  accent: '#2E9F93'
  background: '#F5F3F8'
  surface: '#FFFFFF'
  surface-raised: '#FCFAFF'
  editor-background: '#17161D'
  editor-surface: '#22202A'
  ink: '#27242F'
  muted: '#716C79'
  line: '#DED8E7'
  success: '#19765F'
  warning: '#A65A12'
  danger: '#B93854'
  focus: '#5A42B7'
typography:
  body:
    fontFamily: "Inter, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
  display:
    fontFamily: "ui-rounded, 'SF Pro Rounded', 'PingFang SC', 'Microsoft YaHei', sans-serif"
  utility:
    fontFamily: "'DIN Alternate', Bahnschrift, 'Arial Narrow', sans-serif"
rounded:
  sm: '0.5rem'
  md: '0.875rem'
  lg: '1.25rem'
  pill: '999px'
spacing:
  xs: '0.375rem'
  sm: '0.625rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2rem'
  page-max: '78rem'
components:
  button: {}
  card: {}
  input: {}
  dialog: {}
  toast: {}
  story-node: {}
---

# Clip Simulator Design System

## Overview

### Creative North Star

The player surface should feel like the fictional idol's own member account in a familiar pocket-style fandom app. A first-visit identity card gives only the essential fiction—new member, first election in 30 days, fan flips waiting—then lets the player name the member and choose her team through a color-coded team-mark picker without a redundant preview rail. The game continues inside her profile and daily workbench instead of turning into a rules page; detailed dates, deadlines, and election-ticket information emerge only after the player opens the flip tool. The editor is the same world after the venue closes—a dark production desk where the colorful story nodes become working material.

### Product context and register

- **Audience and primary job:** 48-series fans play a short, meme-friendly reply simulation; the creator authors and validates branching story content.
- **Target market and evidence:** Chinese-speaking web users on mobile, based on the maintained game brief and the UI references in `references/ui-pocket48/`.
- **Locale and language policy:** Simplified Chinese first. Content files own story copy. Mixed Latin abbreviations and fan-community shorthand are permitted when natural.
- **Usage scene:** The game is portrait-phone first and playable in one hand. The editor is desktop-first, with a usable read-only/narrow fallback rather than a compressed desktop canvas.
- **Register:** Two separate products in one workspace. `apps/game` is an expressive player-facing product; `apps/editor` is a utilitarian local authoring tool that shares visual lineage but is never shipped with the game.
- **Memorable signature:** The member identity carries from the first profile card into a coral member-side header, one continuous light account surface, and four operational cards, with “翻牌” as the only primary action. Inside the flip workflow, one status-ordered conversation feed, its quiet “已回复” splitter, and a phone-width fixed action rail carry the product identity alongside the editor date axis without adding another dashboard.
- **Restraint:** Reply reading, choice comparison, form editing, validation, and graph navigation stay quiet and familiar. Only deadlines, outcomes, and milestone transitions receive strong motion or color.
- **Anti-references:** Do not resemble a generic game landing page, gacha lobby, SaaS dashboard, or pixel-art menu. Follow the reference application's member-profile and workbench information architecture closely, while using fictional identity, original gradients, Lucide icons, and no original brand assets.
- **Token ownership/runtime mapping:** `apps/game/src/styles/tokens.css` and `apps/editor/src/styles/tokens.css` are application-specific runtime sources derived from the values in this file. System changes update this file and both applicable token files together; `designmd lint` and the premium audit are drift gates.

## Colors

`primary` is stage coral: human, energetic, and reserved for the main player action and current-day emphasis. `secondary` is microphone violet and owns fan levels, authored connections, and editor selection. `accent` is a deeper mint used for recovery and positive secondary information.

The game uses `background`, `surface`, and `surface-raised`. The editor uses `editor-background` and `editor-surface`, while retaining the same coral, violet, and mint semantic accents. `success`, `warning`, and `danger` communicate meaning with labels/icons as well as color. `focus` is always visible against light and dark surfaces.

## Typography

Body and controls use the Chinese-capable `body` stack with a generous line height. `display` is used sparingly for the game title, day marker, and total-election result. `utility` is used for dates, resource values, node IDs, and vote counts; it never carries long Chinese prose.

Controls use sentence-style Chinese labels. Long fan messages wrap naturally; essential text is never ellipsized without an explicit way to open the full value. Italics are avoided for Chinese copy.

The player surface is non-editable except for the member-name field in first-visit identity setup and the matching profile form in settings. Ordinary game text uses the default pointer, does not expose a blinking text caret, and is not selectable by accidental taps or drags. The identity input and its label/error affordances explicitly restore text selection, the text cursor, a visible caret, and native input-selection behavior. The local editor keeps normal document and form selection behavior.

## Layout

The game is designed from 390 CSS pixels upward, uses safe-area padding, and caps its phone surface near 460 pixels on desktop. When no valid local `PlayerProfile` exists, the entry route is a one-column identity setup page with a compact first-election premise, live member preview, editable name, adjacent random-name action, bounded authored team select, and one primary “进入成员主页” commit. The premise derives its day count from the active story pack and replaces mechanical help copy rather than adding a second onboarding panel. Later visits go directly to the member profile header, account stats, collection row, two-column workbench, and viewport-fixed pocket-style bottom tab bar. Its player-facing surfaces stay in one light theme; the dark production-desk theme belongs only to the separately built editor. The bottom tab bar uses the main account surface, while the workbench surface grows behind it to absorb any remaining viewport height without moving the workbench content. “翻牌” enters the reply inbox immediately, starting or resuming locally as needed; identity editing, display mode, and restart live in the member settings sheet. Restarting a run never removes the member identity. The three unavailable workbench cards remain visibly defocused and non-interactive.

The flip page header keeps the run horizon visible without adding another meter: its right edge reads “离总选结束还剩 X 天”, where `X` is the configured total run days minus the current game day and never drops below zero.

The flip inbox is one continuous, status-ordered conversation feed. “未回复” flips appear first and sort by earliest deadline; a quiet, non-interactive “已回复” splitter then introduces completed history. Every actionable StoryNode owns one pending row, so two flips from the same fan appear as two independently selectable rows rather than a combined contact or count badge. Each pending row carries that flip's own preview and top-right “还有 X 天过期” label. The label is normally muted; on a non-final turn, when advancing to the next scheduled turn would move strictly past that flip's deadline and therefore settle it as expired, the label switches to the `danger` role while retaining the explicit word “过期”, so urgency never depends on color alone. Reaching the deadline exactly remains replyable and does not receive the danger treatment. Below the splitter, replied history remains aggregated by contact: reached core conversations are pinned above ordinary fans and each replied group sorts by recent activity. When a contact's latest exchange expired, its row still previews that flip's concrete incoming text and the top-right status reads “已过期”; generic placeholder copy never replaces the message. Core and ordinary fans share the same row structure without a production-only identity badge.

Each row opens a light, chronological chat transcript containing the resolved history for that contact. A pending row also includes its own selected actionable flip; another pending StoryNode from the same fan remains a separate list entry and choice flow. Every exchange receives its own centered “第 X 日 24:00” marker instead of borrowing a shared day heading. Fan messages sit in left-aligned white bubbles, completed idol replies sit in right-aligned lavender bubbles, and expired entries keep their original incoming body plus an explicit expired status. Reply bubbles and resource costs appear only for the pending flip selected from the feed; ordinary-fan and completed conversations end with a neutral closed state.

Preset long replies remain ordinary choices rather than a separate mode. The mobile choice card, immediate sent-message result, and later idol chat bubble show the complete text with authored paragraph breaks preserved. They do not line-clamp, open a confirmation step, or create an internal card scrollbar; the document remains the only scroll owner and the cost row follows the text. The editor gives a non-blocking reminder after 140 characters, but no hard content limit or extra gameplay field is introduced.

The flip screen is the document/game scroll owner. Its content column stays inside the phone frame and reserves bottom space equal to the fixed action rail's full outer height, including the device safe-area inset, so the last row and focused controls remain reachable above it. The rail is fixed flush to the visual viewport's bottom edge with no exterior offset, even when the conversation feed grows beyond one screen. Its fully opaque surface paints continuously through the safe area and prevents scrolled list content from showing beneath or through it. The rail remains centered and width-capped with the phone frame, keeps “点外卖” beside “几天后”, and does not show the run's accumulated takeout count; on the final turn, “几天后” becomes “进入总选”.

The separately built editor uses a three-region desktop layout: story filters, date canvas, and node inspector. The node inspector is the focused authoring surface and holds a responsive 440–520px desktop width, while the canvas absorbs the remaining space and owns pan/zoom and its internal overflow. Its content-pack view keeps adapted and original name pools in separate count-labeled disclosure sections, including a concise empty state when a pool is unused. On narrow screens, the inspector becomes a normal-flow panel below the canvas and all node edits remain possible without drag.

Spacing is compact but not cramped. Important phone controls target approximately 44 pixels. Date rails and node lanes use stable geometry so selection and validation do not move neighboring controls.

## Elevation & Depth

Game cards use borders and a small tinted shadow to read as stacked reply slips. The workbench header may use restrained translucent color, but text surfaces remain opaque and readable. The editor is mostly flat: selected nodes use a violet outline and slight lift; static panels do not accumulate decorative shadows.

Dialogs use a dedicated overlay and raised surface. Blur is optional and never the sole contrast mechanism.

## Shapes

Member and fan avatars are circular. The member portrait is an original anonymous stage-rehearsal back view, while fan portraits use original candid-photo subjects such as pets, drinks, night scenes, and desk objects; neither surface uses a recognizable real person. Compact status chips are pill-shaped. Message and tool cards use `rounded.md` or `rounded.lg`; buttons do not all become pills. Ticket cards may use small circular edge cut-outs or dashed deadline rails as the signature exception.

## Components

### Foundational visual states

Interactive components define default, hover, focus-visible, active, selected, disabled, busy, warning, and error states without changing geometry. Disabled choices explain resource shortages in visible text. Loading uses a stable app-owned indicator; skeletons are not part of the initial product.

### Buttons and actions

Primary coral buttons commit the current decision. Neutral outline and ghost buttons navigate or expose tools. Mint is reserved for recovery/positive utility actions. Dangerous editor actions stay visually separate and use the danger role only after an app-owned confirmation.

### Navigation and data display

The game uses a compact workbench header and bottom navigation only where it improves orientation. The editor uses labeled toolbar actions and story-line filter buttons; color is never the only indication of the active line. Date progress, affinity, and resources always include text or numeric equivalents.

Reply-option costs pair each signed number with the same battery/brain icons used by the resource meters. Energy keeps the coral role and mindset keeps the violet role; the nearby labeled meters establish their meaning, while accessible labels name both costs explicitly.

Time-sensitive pending labels use the semantic `danger` token only on a non-final turn when the next scheduled turn day is strictly later than their deadline. Their visible and accessible copy continues to say “还有 X 天过期”; color adds urgency but does not supply the status meaning. The final turn enters the election directly and never applies this expiry-warning state.

### Forms and overlays

Editor fields have persistent labels, inline help/errors, and `resize: none` textareas with adequate height. Reply textareas preserve line breaks and show a soft, non-blocking length reminder after 140 characters. Adapted and original name pools use native disclosure sections with visible item counts and the fixed suggestion rule nearby; the player never sees the source category. Simple bounded editor filters keep native selects. The player identity's team picker is an authored Radix Select because its selected team mark, popup width, option states, and keyboard behavior belong to the game visual contract. The identity form uses an owned `noValidate` flow, keeps the random-name action separate from submission, and focuses the first invalid field. Story day values use typed numeric inputs, not a calendar picker. Destructive actions use an app-owned modal dialog.

### Iconography

Use Lucide's rounded two-pixel stroke icons at 16, 18, or 20 pixels. Icons support labels rather than replacing unfamiliar actions. Decorative emoji may appear inside story content but do not serve as core controls.

### Motion

Reply feedback and day advancement use one 180–240 ms entrance/cross-fade. Node dragging follows the graph library. Routine hover motion is limited to color and a subtle one-pixel lift. Reduced-motion mode removes transforms and uses immediate or sub-100 ms opacity changes.

### Content and data visualization

The player voice is concise, conversational, and fandom-aware without requiring an explanation of every joke. Authored player-visible strings may use `{{idolName}}`, `{{teamName}}`, `{{teamShortName}}`, and validated static global variables. One shared resolver owns both game rendering and editor preview; identity or global values are never replaced through scattered screen-local string operations. Unknown variables remain visible in preview and produce a validation error rather than silently disappearing. Editor copy is literal and task-oriented: “保存草稿”, “应用到本地试玩”, “导出内容包”. Vote totals use grouped digits where appropriate; affinity and resource changes always include a sign.

## Do's and Don'ts

- **Do:** Let member identity establish the entry hierarchy, then let dates, deadlines, fan identity, and the next playable action lead inside the flip tool.
- **Do:** Keep the test story fully replaceable through the shared content schema.
- **Do:** Make the entrance believable as a fictional member account; keep “翻牌” as the one unmistakably active workbench tool.
- **Don't:** Turn the member profile/workbench into a game HUD with run length, currencies, inventory, or unexplained meters. The one-time identity setup may state the 30-day first-election premise, but it must not expand into a rules summary.
- **Don't:** hide essential editor actions behind drag-only interactions or unlabeled icons.
- **Don't:** copy the reference screenshots' brand assets, exact gradients, or business terminology wholesale.
