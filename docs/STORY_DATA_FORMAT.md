# 剧情数据格式 v15

当前游戏读取一个完整的 JSON 内容包：`content/test-story.json`。编辑器和游戏共享这份格式，但不共享入口或 UI 代码。v15 为每名核心粉丝和每个普通 NPC 联系人增加必填的应用内头像 ID，并要求不同角色不能共用；玩家实际选择的身份仍独立保存在浏览器本地，不写入内容包。

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
├─ backgroundFlips[]   普通粉丝的自动一问一答或只读闲聊
├─ electionEndings[]   总选票数结局
├─ earlyEndings[]      提前结局及可选配图
└─ achievements[]      成就条件
```

正式类型定义见 `packages/story-core/src/types.ts`，运行时结构与图校验见 `packages/story-core/src/validation.ts`。

v15 内容包必须设置 `"schemaVersion": 15`，并提供以下顶层字段：

```json
{
  "schemaVersion": 15,
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

## 核心粉丝与人物标签

`fans[]` 中的每名核心粉丝必须提供 `tags` 数组：

```json
{
  "id": "fan-a",
  "name": "夜航灯塔",
  "handle": "@应援会还缺两个人",
  "bio": "从出道起一直在线的应援会组织者。",
  "avatarId": "fan-lighthouse",
  "tags": ["应援会饭头", "组织者", "老河粉"],
  "pastChats": [
    {
      "id": "fan-a-past-01",
      "timeLabel": "三个月前",
      "message": "call 词第二版发你了，唱段的位置我重新让开了。",
      "reply": "收到，原来 call 词还要给唱段让路，我又学到一课。"
    }
  ]
}
```

- `tags` 是人物属性，不是拼接进 `bio` 的展示文案；一名核心粉丝必须包含 1–4 个标签。
- 每个标签去除首尾空格后必须非空，最多 12 个字符，同一粉丝不得重复。
- 标签按内容包中的顺序展示。优先放最能帮助玩家做判断的身份、关系位置或投入特征。
- 核心粉丝标签会同时出现在消息列表和聊天页联系人标题中。普通粉丝继续使用每条 `backgroundFlips[].tag`，进入会话展示层后同样转换为标签数组。
- `avatarId` 必须引用 `packages/story-core/src/fan-avatars.ts` 中的一个内置头像，并且不能与其他核心粉丝或普通 NPC 联系人重复。

每名核心粉丝还必须提供 `pastChats` 数组；刚刚出现、没有关系基础的角色可以使用空数组：

- 每条记录包含稳定 `id`、玩家可见的 `timeLabel`、粉丝旧消息 `message` 和成员旧回复 `reply`。
- 同一粉丝的记录 ID 不得重复，每名粉丝最多 8 条；数组顺序就是聊天中的展示顺序。
- 过往聊天在周目开始时直接显示于“已回复”，位于当前总选月节点之前，不进入 `GameState`，也不改变好感、资源、票数或触发条件。
- `timeLabel` 使用“三个月前”“出道第 18 天”等关系时间，不使用“第 0 日”。
- 已经认识数月的角色建议提供 2–5 条；真正首次出现的角色保留空数组，避免伪造共同记忆。
- 编辑器的“内容包与变量 → 核心粉丝档案”可以修改稳定 ID、昵称、账号、标签与过往聊天。修改稳定 ID 时，编辑器会同步重写节点归属、好感/票力效果和延迟回复触发中的引用。

### `PlayerProfile`

`PlayerProfile` 不是 `StoryPack` 或 `GameState` 的子对象，而是玩家端独立保存的数据：

```json
{
  "idolName": "沈星禾",
  "teamId": "team-n",
  "avatarId": "cafe"
}
```

- `idolName`：去除首尾空格后的玩家偶像姓名，必填，最多 16 个字符。
- `teamId`：必须引用当前内容包 `profileSetup.teams[].id`。
- `avatarId`：可选的应用内头像 ID，由游戏内置头像清单解析，不属于剧情内容包；旧存档缺少或值无效时回退到游戏默认头像。
- 重开周目、总选结算或周目存档失效不会删除身份；无效身份会让玩家重新进入身份设置。

## 文本模板与全局变量

### 保留变量

| 占位符              | 来源                                   |
| ------------------- | -------------------------------------- |
| `{{idolName}}`      | `PlayerProfile.idolName`               |
| `{{idolNickname}}`  | 姓名去除首尾空格后，最后一个字重复两次 |
| `{{teamName}}`      | 当前 `teamId` 对应队伍的 `name`        |
| `{{teamShortName}}` | 当前 `teamId` 对应队伍的 `shortName`   |

这四个名称由运行时保留，`globalVariables` 不得声明同名键。昵称仅在运行时动态生成，不单独写入玩家身份或周目存档；玩家改名后，含 `{{idolNickname}}` 的文案会使用新姓名重新解析。

### 静态全局变量

- `globalVariables` 是 `Record<string, string>`，用于团名、剧场名等不会随周目变化的公共文案。
- 变量名必须匹配 `[A-Za-z][A-Za-z0-9_]*`，引用时使用 `{{variableName}}`；占位符内部允许无意义的首尾空白，但导出时建议使用无空白的标准形式。
- 全局变量值按字面插入，不再次解析其中的 `{{...}}`，因此模板是单次解析，不支持递归或嵌套。
- 玩家输入的姓名同样作为字面文本插入，不得将其再次当作模板或 HTML 解释。

### 可使用模板的字段

集中解析器扫描以下内容字符串，原始 ID、flags、条件、对象键和数值字段不参与模板解析：

- `StoryPack.title` / `description` 与泛人气票力档位 `label`；
- `fans[].name` / `handle` / `bio` / `tags[]` 及其票力档位 `label`；
- `fans[].pastChats[].timeLabel` / `message` / `reply`；
- `nodes[].title`、`content.text`、`content.context`、`choices[].text`、`choices[].note`；
- `turnEvents[].title` / `description`；
- `backgroundFlips[].fanName` / `tag` / `message` / `reply` / `continuations[]`；
- 总选结局的 `rankLabel` / `title` / `description`；
- 提前结局的 `title` / `description` / `image.alt` 与成就的 `title` / `description`。

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
        "popularity": 0,
        "setFlags": ["fan-a-admitted-mistake"]
      },
      "nextNodeId": "fan-a-04",
      "nextNodeTiming": "immediate"
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
- `{ "type": "first-nodes-replied-on-time", "fanId": "fan-a", "count": N }`：指定粉丝故事线的前 N 个节点（按发布日期与包内顺序排序）都在出现当回合就被回复。用于奖励“第一时间秒回”的玩法分支。

带 `trigger` 的节点在初始日、每次进入新一天、以及每次回复翻牌后都会检查，哪个时刻先满足就在哪个时刻进入收件箱（秒回奖励当场弹出）。新一天先结算过期翻牌，再应用当天事件和资源恢复，最后检测节点；普通连线节点仍按日初或 `nextNodeTiming` 规则出现，不因其他节点的回复而提前。目标的 `postedDay` 不能晚于当前日，且 `trigger` 必须已满足；未满足时节点仍保持解锁，等待之后的检查。外卖坏结局属于独立的立即判定，不受此规则影响。

- `effects.affinity`：以粉丝 ID 为键，可一次影响一到两名粉丝。
- `effects.popularity`：改变泛人气。每条回复都必须显式填写整数；不影响泛人气时写 `0`，需要影响时可以填正数或负数。
- `effects.resources`：立即改变精力或心情，允许负数。
- `effects.setFlags` / `unsetFlags`：设置或移除隐藏剧情标记。
- `effects.voteBonus`：总选时的稀疏额外票力修正。
- `nextNodeId`：解锁后续节点；默认在之后的日初检查中出现，并仍需等到自己的 `postedDay`。
- `nextNodeTiming`：可选值为 `"day-start"` 或 `"immediate"`。省略等同 `"day-start"`；`"immediate"` 表示回复效果结算后马上检查并加入符合日期与触发条件的目标节点。没有 `nextNodeId` 时不能单独填写此字段。
- `endingId`：立即展示 `earlyEndings[]` 中对应的特殊结局。它与 `nextNodeId` 互斥；结局收录后，玩家恢复到选择该回复之前，可改走其他分支。

每个回复的 `effects.affinity` 必须显式包含当前节点的 `fanId`，即使变化为 `0` 也要写出，以保证编辑器和结算页拥有明确的好感度数值。影响其他粉丝的交叉效果可以继续放在同一个对象中。每个回复还必须显式设置 `effects.popularity`；编辑器会把当前粉丝好感和泛人气作为两个并列数值输入框，并与效果 JSON 保持同一份数据。

每个回复必须至少消耗 1 点精力和 1 点心情。好感度与泛人气由引擎限制在配置范围内。回复结果只记录变化：标准模式显示带正负号的好感数值，拟真模式显示“上升 / 下降 / 不变”，两种模式都用图标和文字表达方向，不生成评语。

`choices[].text` 可以包含换行和长文。游戏在候选卡、发送结果和历史气泡中展示同一份完整文本并保留段落，不折叠、不二次确认、不建立卡片内部滚动区。编辑器在文本超过 140 个字符时给出软提醒；这不是 schema 错误，也不阻止保存或导出。

## 根节点、收拢与跨线

- 没有任何入边的节点是根节点，会在发布日期自动出现。
- 多个选项可以指向同一个后续节点，以此收拢分支。
- 剧情图不允许循环。
- 跨粉丝影响优先使用 `affinity` 和 flags；避免把玩家强制跳进另一位粉丝的中间节点。

## 普通 NPC 会话与热点闲聊

```json
{
  "id": "ordinary-01",
  "contactId": "milk-tea-fan",
  "day": 1,
  "fanName": "奶茶去冰",
  "avatarId": "fan-milktea",
  "tag": "冒泡",
  "message": "我去，公告看了三遍，计算器先申请退河了。这到底是作品赛，还是数学竞赛披了件 MV 外套？已老实，先等成片。",
  "reply": "哈哈哈哈计算器比我先退河🤣规则我也看不懂，先等饭头翻译。"
}
```

- `id` 标识一条具体消息，必须唯一。
- `contactId` 是可选的稳定联系人 ID；同一联系人跨日期或改名时应保持不变。
- `avatarId` 是必填的内置头像 ID；同一 `contactId` 的多轮聊天必须保持一致。
- 不同普通 NPC 联系人之间、普通 NPC 与核心粉丝之间都不能共用 `avatarId`。
- 游戏按 `contactId ?? fanName` 聚合聊天历史，因此旧内容包不填写该字段也能继续读取。
- 当前内容包统一使用一问一答：`message` 写粉丝消息（要聊多件事就合并成一条长消息），`reply` 写成员回复；真人翻牌每条都会得到回复。
- `reply` 可选：填写时在聊天中显示 NPC 左侧消息和成员右侧回复。
- 不填写 `reply` 时，该轮是玩家只读的 NPC 闲聊。`continuations` 可选，包含 1–4 条同一 NPC 紧接着发出的左侧气泡；只有第一条 `message` 也合法。该形态保留为格式能力，内容包不再使用。
- `reply` 与 `continuations` 不能同时存在，避免把热点玩梗误写成玩家回复后的跟进。
- 普通 NPC 内容在 `day <= currentDay` 后自动进入“已回复”，不进入待回复数量、不提供选择、不设置过期，也不写入周目状态。
- 使用相同 `contactId`、不同 `day` 可以创作同一 NPC 的多轮对话；后续轮次允许调整 `fanName` 与 `tag`，聊天标题使用当前日期已到达的最新资料。
- `fanName`、`message`、`reply` 和 `continuations[]` 均支持 `{{idolName}}` / `{{idolNickname}}` 等模板变量，因此可以创作“{{idolName}}的狗”“阿卷（恩师{{idolName}}）”一类名称联动。
- 热点素材的来源、日期和未决争议写作边界记录在 `docs/SIBA_TOPIC_SOURCES.md`。

## 特殊结局与配图

回复选项可以直接引用一个已有特殊结局：

```json
{
  "id": "risky-reply",
  "text": "发出这条可能翻车的回复。",
  "cost": { "energy": 2, "mindset": 2 },
  "effects": { "affinity": { "fan-a": -10 }, "popularity": -5 },
  "endingId": "takeout-idol"
}
```

编辑器在每个回复卡片中提供“特殊结局”“后续节点”和“后续节点出现时机”下拉框。选择结局时会清除并禁用后续节点及其出现时机，防止一条回复同时声明两种去向；清空后续节点时也会清除孤立的时机配置。

```json
{
  "id": "takeout-idol",
  "title": "胖成一条蛆，耻辱退团",
  "description": "第四份外卖送到时，公司也送来了退团通知。",
  "image": {
    "src": "/assets/endings/takeout-shame-post.png",
    "alt": "JBS48超话投稿截图：用外卖满减、舞台和胖成一条蛆的梗轻松吐槽，右下角配有嫌弃猫表情。"
  },
  "trigger": { "takeoutCountAtLeast": 4 }
}
```

- `image` 可省略；存在时必须同时提供非空的 `src` 与 `alt`。
- `src` 指向游戏构建内可访问的本地静态资源，不使用第三方热链。
- `alt` 描述图片中承载的剧情信息并支持文本模板，不能只写“结局图片”。
- 图片区域预留固定比例，加载前后不会推动结局标题或操作按钮。

## 文件版本与存档

- v15 把 `fans[].avatar` 和可选的 `backgroundFlips[].avatar` 资源路径改为必填 `avatarId`。迁移时为每个核心粉丝及每个唯一 `contactId ?? fanName` 分配不同的内置 ID；同一联系人的多轮记录复用该 ID，再把 `schemaVersion` 改为 `15`。
- v14 移除 `nodes[].choices[].feedback`。从 v13 迁移时，删除每条回复的 `feedback`，保留好感和泛人气数值，再把 `schemaVersion` 改为 `14`。
- v13 要求每个 `nodes[].choices[].effects` 显式包含整数 `popularity`。从 v12 迁移时，为没有泛人气效果的回复补 `"popularity": 0`，保留已有非零数值，再把 `schemaVersion` 改为 `13`。
- v12 为每个 `nodes[].choices[]` 增加必填 `feedback.headline` 与 `feedback.summary`，并要求 `effects.affinity` 显式包含节点所属粉丝。编辑器把这三项作为结构化表单维护；从 v11 迁移时必须为每条回复补齐后再把 `schemaVersion` 改为 `12`。
- v11 为 `nodes[].choices[]` 增加可选 `nextNodeTiming`。从 v10 迁移时只需把 `schemaVersion` 改为 `11`；省略该字段即可保持原有日初节奏，需要连聊的选项再设为 `"immediate"`。
- v10 为 `nodes[].choices[]` 增加可选 `endingId`。从 v9 迁移时只需把 `schemaVersion` 改为 `10`；需要特殊结局的回复再填写现有结局 ID。
- v9 为提前结局增加可选的 `image.src` 与 `image.alt`；从 v8 迁移时可以不增加图片，或补齐两个字段后将 `schemaVersion` 改为 `9`。
- v8 增加必填的核心粉丝 `pastChats`。从 v7 迁移时，为每名粉丝补充数组；没有赛前关系的角色填写 `[]`。
- v7 移除普通 NPC 的 `choices` 和周目内 `backgroundReplies`。从 v6 迁移互动菜单时，删除全部玩家选项，把 NPC 想说的内容写入 `message` 与 `continuations[]`，再把 `schemaVersion` 改为 `7`；已有 `reply` 自动一问一答可原样保留。
- 改文案但不破坏进度时，保持 `contentVersion` 不变。
- 删除节点、重命名节点或改变关键分支后，递增 `contentVersion`。旧本地存档会被视为不兼容并重新开局。
- 改变数据结构时才递增 `schemaVersion`，并同步类型、校验器和迁移策略。

## 校验

```powershell
npm run validate:content
```

保存与构建会检查结构、重复 ID、角色头像 ID 唯一性、同一 NPC 多轮头像一致性、缺失引用、越界日期、循环、不可达节点、票力上限、身份配置、静态变量、未知模板引用和内容规模。超过 140 个字符的回复由编辑器显示非阻塞软提醒，不属于内容包结构错误。剧情文件只能包含声明式 JSON，不能嵌入任意 JavaScript。

## 修订记录

| 版本 | 日期       | 内容                                                                                       |
| ---- | ---------- | ------------------------------------------------------------------------------------------ |
| v1   | 2026-08-22 | 建立单一 StoryPack、翻牌节点、普通粉丝会话、分支与校验约定。                               |
| v2   | 2026-08-23 | 增加身份姓名库、队伍、独立 PlayerProfile、静态全局变量、集中模板解析及长回复编辑器软提醒。 |
| v3   | 2026-08-23 | 将姓名库拆为改编与原创两池；增加前三次改编、后续每五次两改编三原创的受约束随机规则。       |
| v3.1 | 2026-08-23 | 允许原创池为空；当前测试包移除全部原创候选，姓名建议统一回退到改编池。                     |
| v3.2 | 2026-08-23 | 测试包改编池扩充为 SNH48 四队现役快照对应的 70 个日常化虚构姓名。                          |
| v4   | 2026-08-23 | 增加队伍队标/主题色、普通粉丝头像，以及日初统一检查的可扩展节点触发条件。                  |
| v5   | 2026-08-23 | 核心粉丝增加结构化多标签属性，并统一映射到消息列表和聊天页。                               |
| v5.1 | 2026-08-23 | 独立 PlayerProfile 增加可选应用内头像 ID；头像清单仍由游戏拥有，不进入 StoryPack。         |
| v6   | 2026-08-23 | 普通 NPC 增加轻量话题菜单、跟进气泡、跨日期多轮会话和编辑器结构化编辑。                    |
| v7   | 2026-08-23 | 热点改为按日期自动进入已回复的 NPC 只读闲聊；支持同一轮多个连续 NPC 气泡。                 |
| v8   | 2026-08-23 | 核心粉丝增加赛前过往聊天，并支持编辑器原子修改粉丝 ID、标签和历史记录。                    |
| v9   | 2026-08-23 | 提前结局增加带无障碍替代文本的可选本地配图。                                               |
| v10  | 2026-08-23 | 回复选项可直接触发特殊结局；结局收录后恢复触发前的周目快照。                               |
| v11  | 2026-08-23 | 回复选项可指定后续节点在日初检查或回复后立即出现；即时节点仍服从日期与触发条件。           |
| v12  | 2026-08-23 | 每条回复增加必填的好感结算大标题、小评语及当前粉丝好感变化数值。                           |
| v13  | 2026-08-23 | 每条回复显式设置可手动编辑的泛人气变化值；无变化时保存为 0。                               |
| v14  | 2026-08-23 | 移除回复结算评语；游戏根据好感变化值显示中性的增减记录。                                   |
| v15  | 2026-08-30 | 核心粉丝和普通 NPC 改用必填的内置头像 ID，并校验跨角色唯一与同联系人多轮一致。             |
