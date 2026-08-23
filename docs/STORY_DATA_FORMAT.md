# 剧情数据格式 v4

当前游戏读取一个完整的 JSON 内容包：`content/test-story.json`。编辑器和游戏共享这份格式，但不共享入口或 UI 代码。v4 在双姓名池基础上增加队伍视觉字段、可选普通粉丝头像，以及只在日初检查的可扩展剧情节点触发器；玩家实际选择的身份仍独立保存在浏览器本地，不写入内容包。

## 顶层结构

```text
StoryPack
├─ schemaVersion       数据结构版本
├─ id / contentVersion 存档兼容标识
├─ profileSetup        随机姓名库与可选队伍
├─ globalVariables     作者定义的静态文本变量
├─ config              周目、资源、外卖、泛人气配置
├─ fans[]              核心粉丝与好感→票力表
├─ nodes[]             翻牌剧情有向无环图
├─ turnEvents[]        指定回合事件
├─ backgroundFlips[]   普通粉丝的自动回复消息
├─ electionEndings[]   总选票数结局
├─ earlyEndings[]      提前结局
└─ achievements[]      成就条件
```

正式类型定义见 `packages/story-core/src/types.ts`，运行时结构与图校验见 `packages/story-core/src/validation.ts`。

v4 内容包必须设置 `"schemaVersion": 4`，并提供以下顶层字段：

```json
{
  "schemaVersion": 4,
  "profileSetup": {
    "namePools": {
      "adapted": ["孙可恬", "周夏雨", "陈静扬"],
      "original": ["林见夏", "沈星遥", "周予晴"]
    },
    "teams": [
      {
        "id": "team-n",
        "name": "Team N",
        "shortName": "N",
        "mark": "N",
        "color": "#8E6AD8"
      },
      {
        "id": "team-h",
        "name": "Team H",
        "shortName": "H",
        "mark": "H",
        "color": "#F29A61"
      }
    ]
  },
  "globalVariables": {
    "groupName": "S48",
    "theaterName": "星光剧场"
  }
}
```

## 玩家身份配置

### `profileSetup.namePools`

- `adapted` 保存参考 48 系现役成员命名气质后重新组合的虚构姓名，至少包含 3 项。
- `original` 保存完全原创的虚构姓名，允许为空；当前测试包为空。
- 姓名去除首尾空格后必须非空且不超过 16 个字符。
- 两个池内部及跨池均不得出现去除首尾空格后相同的姓名。
- 姓名库只提供建议。玩家可以手动输入其他合法姓名，随机结果也仍可编辑。

姓名来源规则属于固定产品机制，不作为内容参数开放：

1. 每次打开身份表单会创建一段独立的姓名建议序列。
2. 首次身份设置自动填入的姓名计为第 1 次建议；已有身份的设置表单不会自动消耗建议次数。
3. 序列前 3 次建议都从 `adapted` 抽取。
4. 当两个池都有内容时，从第 4 次开始每 5 次为一个对齐分组；每组先把 2 个 `adapted` 与 3 个 `original` 来源标记洗牌，再依次取用。
5. 每个来源池使用独立洗牌袋，并在存在其他候选时避开当前输入和上一次建议，减少连续重复。
6. `original` 为空时，所有来源请求安全回退到 `adapted`，因此当前测试包只会生成改编姓名。

当前测试包的 `adapted` 收录 70 个候选，对应 SNH48 Team SII、NII、HII、X 现役快照的一人一名虚构化结果；真人与虚构名映射只保存在 `references/name-pool/README.md`，不属于运行时剧情数据。

建议序列只控制可选的外观姓名，不进入 `PlayerProfile`、`GameState` 或剧情结算。关闭并重新打开表单会开始新序列。

### `profileSetup.teams`

每个队伍包含：

| 字段        | 类型     | 说明                                                   |
| ----------- | -------- | ------------------------------------------------------ |
| `id`        | `string` | 稳定且唯一的队伍 ID，写入 `PlayerProfile`。            |
| `name`      | `string` | 完整显示名称，对应 `{{teamName}}`。                    |
| `shortName` | `string` | 简称，对应 `{{teamShortName}}`。                       |
| `mark`      | `string` | 1–3 个字符的虚构队标文字，用于队伍徽章。               |
| `color`     | `string` | 六位十六进制主题色，例如 `#8E6AD8`，用于徽章与选中态。 |

队伍数组至少包含一项。`id` 参与本地身份兼容判断，发布后不应仅为改文案而重命名；只需调整显示文字时修改 `name` 或 `shortName`。

### `PlayerProfile`

`PlayerProfile` 不是 `StoryPack` 或 `GameState` 的子对象，而是玩家端独立保存的数据：

```json
{
  "idolName": "沈星禾",
  "teamId": "team-n"
}
```

- `idolName`：去除首尾空格后的玩家偶像姓名，必填，最多 16 个字符。
- `teamId`：必须引用当前内容包 `profileSetup.teams[].id`。
- 重开周目、总选结算或周目存档失效不会删除身份；无效身份会让玩家重新进入身份设置。

## 文本模板与全局变量

### 保留变量

| 占位符              | 来源                                 |
| ------------------- | ------------------------------------ |
| `{{idolName}}`      | `PlayerProfile.idolName`             |
| `{{teamName}}`      | 当前 `teamId` 对应队伍的 `name`      |
| `{{teamShortName}}` | 当前 `teamId` 对应队伍的 `shortName` |

这三个名称由运行时保留，`globalVariables` 不得声明同名键。

### 静态全局变量

- `globalVariables` 是 `Record<string, string>`，用于团名、剧场名等不会随周目变化的公共文案。
- 变量名必须匹配 `[A-Za-z][A-Za-z0-9_]*`，引用时使用 `{{variableName}}`；占位符内部允许无意义的首尾空白，但导出时建议使用无空白的标准形式。
- 全局变量值按字面插入，不再次解析其中的 `{{...}}`，因此模板是单次解析，不支持递归或嵌套。
- 玩家输入的姓名同样作为字面文本插入，不得将其再次当作模板或 HTML 解释。

### 可使用模板的字段

集中解析器扫描以下内容字符串，原始 ID、flags、条件、对象键和数值字段不参与模板解析：

- `StoryPack.title` / `description` 与泛人气票力档位 `label`；
- `fans[].name` / `handle` / `bio` 及其票力档位 `label`；
- `nodes[].title`、`content.text`、`content.context`、`choices[].text`、`choices[].note`；
- `turnEvents[].title` / `description`；
- `backgroundFlips[].fanName` / `tag` / `message` / `reply`；
- 总选结局的 `rankLabel` / `title` / `description`；
- 提前结局与成就的 `title` / `description`。

游戏和编辑器必须调用 story-core 的同一集中解析器，从原始内容包生成解析后的内容副本。不得在组件中分散调用字符串替换，也不得把解析后的文案覆盖回 JSON 或写入周目存档。

编辑器使用本地预览身份显示解析结果，但导出仍保留原始占位符。变量名格式错误、覆盖保留名或引用未知变量属于内容校验错误，必须给出字段路径和节点 ID（如适用），并阻止有效导出/应用；预览保留原始未知占位符，不静默替换为空字符串。

## 翻牌节点

```json
{
  "id": "fan-a-03",
  "fanId": "fan-a",
  "title": "她发现你忘了约定",
  "postedDay": 7,
  "replyWindowDays": 7,
  "trigger": {
    "match": "all",
    "conditions": [
      { "type": "flag-set", "flag": "fan-a-promised" },
      { "type": "expired-flips-at-least", "count": 1 }
    ]
  },
  "content": {
    "text": "你是不是忘记答应过我什么了？",
    "context": "仅供作者查看的语境备注",
    "public": false
  },
  "choices": [
    {
      "id": "apologize",
      "text": "对不起，我真的忘记了……",
      "cost": { "energy": 2, "mindset": 2 },
      "effects": {
        "affinity": { "fan-a": 5 },
        "setFlags": ["fan-a-admitted-mistake"]
      },
      "nextNodeId": "fan-a-04"
    }
  ],
  "onExpire": {
    "affinity": { "fan-a": -10 },
    "setFlags": ["fan-a-ignored"],
    "nextNodeId": "fan-a-04"
  },
  "editor": { "y": 240 }
}
```

## 日初触发条件与效果

`trigger` 是可选字段；不填写表示节点没有额外状态条件。填写时：

- `match: "all"`：所有 `conditions` 均满足。
- `match: "any"`：任一 `conditions` 满足。
- `{ "type": "flag-set", "flag": "..." }`：指定剧情标记已存在。
- `{ "type": "flag-unset", "flag": "..." }`：指定剧情标记不存在。
- `{ "type": "expired-flips-at-least", "count": N }`：本周目累计至少 N 条核心翻牌过期。
- `{ "type": "takeout-orders-at-least", "count": N }`：本周目累计至少点过 N 顿外卖。
- `{ "type": "consecutive-replies-delayed-at-least", "fanId": "fan-a", "count": N, "turns": T }`：指定粉丝最近连续 N 次已回复翻牌，从进入收件箱到回复都至少经过了 T 次回合推进。其他粉丝的回复不打断该粉丝自己的连续记录；一次更及时的回复会打断延迟序列，过期翻牌不计入已回复次数。

所有节点触发条件只在初始日或进入新一天时检查。新一天先结算过期翻牌，再应用当天事件和资源恢复，最后检测节点；因此刚刚回复产生的 flag 或当天刚点的外卖不会在同一天中途弹出节点。`postedDay`、剧情前置连线和 `trigger` 三者必须同时满足。外卖坏结局属于独立的立即判定，不受此日初规则影响。

- `effects.affinity`：以粉丝 ID 为键，可一次影响一到两名粉丝。
- `effects.popularity`：改变泛人气；私人回复通常不填写。
- `effects.resources`：立即改变精力或心态，允许负数。
- `effects.setFlags` / `unsetFlags`：设置或移除隐藏剧情标记。
- `effects.voteBonus`：总选时的稀疏额外票力修正。
- `nextNodeId`：解锁后续节点；后续节点仍需等到自己的 `postedDay`。

每个回复必须至少消耗 1 点精力和 1 点心态。好感度与泛人气由引擎限制在配置范围内。

`choices[].text` 可以包含换行和长文。游戏在候选卡、发送结果和历史气泡中展示同一份完整文本并保留段落，不折叠、不二次确认、不建立卡片内部滚动区。编辑器在文本超过 140 个字符时给出软提醒；这不是 schema 错误，也不阻止保存或导出。

## 根节点、收拢与跨线

- 没有任何入边的节点是根节点，会在发布日期自动出现。
- 多个选项可以指向同一个后续节点，以此收拢分支。
- 剧情图不允许循环。
- 跨粉丝影响优先使用 `affinity` 和 flags；避免把玩家强制跳进另一位粉丝的中间节点。

## 普通粉丝会话

```json
{
  "id": "ordinary-01",
  "contactId": "milk-tea-fan",
  "day": 1,
  "fanName": "奶茶去冰",
  "avatar": "/assets/avatars/fan-milktea.webp",
  "tag": "冒泡",
  "message": "今天吃了吗？",
  "reply": "吃了，吃的是经纪人的画饼。"
}
```

- `id` 标识一条具体消息，必须唯一。
- `contactId` 是可选的稳定联系人 ID；同一联系人跨日期或改名时应保持不变。
- `avatar` 是可选的头像资源路径；缺省时游戏按联系人 ID 从内置原创头像池稳定分配。
- 游戏按 `contactId ?? fanName` 聚合聊天历史，因此旧内容包不填写该字段也能继续读取。
- 普通粉丝消息在到达日期后视为已经回复，只展示预设 `reply`，不提供玩家选择，也不写入周目存档。

## 文件版本与存档

- v4 内容包必须包含 `profileSetup.namePools`、带 `mark`/`color` 的队伍和 `globalVariables`。旧 v3 内容包需要为队伍补齐视觉字段，并把旧 `requirements` 手动转换为 `trigger.conditions` 后再导入。
- 改文案但不破坏进度时，保持 `contentVersion` 不变。
- 删除节点、重命名节点或改变关键分支后，递增 `contentVersion`。旧本地存档会被视为不兼容并重新开局。
- 改变数据结构时才递增 `schemaVersion`，并同步类型、校验器和迁移策略。

## 校验

```powershell
npm run validate:content
```

保存与构建会检查结构、重复 ID、缺失引用、越界日期、循环、不可达节点、票力上限、身份配置、静态变量、未知模板引用和内容规模。超过 140 个字符的回复由编辑器显示非阻塞软提醒，不属于内容包结构错误。剧情文件只能包含声明式 JSON，不能嵌入任意 JavaScript。

## 修订记录

| 版本 | 日期       | 内容                                                                                       |
| ---- | ---------- | ------------------------------------------------------------------------------------------ |
| v1   | 2026-08-22 | 建立单一 StoryPack、翻牌节点、普通粉丝会话、分支与校验约定。                               |
| v2   | 2026-08-23 | 增加身份姓名库、队伍、独立 PlayerProfile、静态全局变量、集中模板解析及长回复编辑器软提醒。 |
| v3   | 2026-08-23 | 将姓名库拆为改编与原创两池；增加前三次改编、后续每五次两改编三原创的受约束随机规则。       |
| v3.1 | 2026-08-23 | 允许原创池为空；当前测试包移除全部原创候选，姓名建议统一回退到改编池。                     |
| v3.2 | 2026-08-23 | 测试包改编池扩充为 SNH48 四队现役快照对应的 70 个日常化虚构姓名。                          |
| v4   | 2026-08-23 | 增加队伍队标/主题色、普通粉丝头像，以及日初统一检查的可扩展节点触发条件。                  |
