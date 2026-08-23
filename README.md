# Clip Simulator

一个手机端 48 小偶像翻牌叙事游戏，以及一个只在开发者电脑运行的剧情节点编辑器。

## 项目边界

- `apps/game`：玩家入口。纯静态、手机优先、使用 `localStorage` 存档。
- `apps/editor`：开发者本地入口。负责打开、编辑、校验和保存剧情 JSON。
- `packages/story-core`：两端共享的数据类型、剧情校验器和纯逻辑引擎。
- `content/test-story.json`：当前测试内容包，也是游戏构建时读取的唯一剧情文件。

游戏和编辑器拥有不同入口、不同开发服务器与不同构建产物。发布玩家端时只发布 `apps/game/dist`；不要发布 `apps/editor/dist`。

## 开发命令

```powershell
npm install
npm run dev:game
npm run dev:editor
```

- 游戏：http://localhost:4173
- 编辑器：http://localhost:4174

生产构建与检查：

```powershell
npm run validate:content
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## 修改剧情的工作流

1. 启动 `npm run dev:editor`。
2. 在编辑器中打开 `content/test-story.json`。
3. 修改节点并处理左侧“剧情检查”中的错误。
4. 使用“保存”写回原文件；不支持直接写文件的浏览器会下载 JSON，需要手动覆盖原文件。
5. 刷新游戏开发页，或重新执行 `npm run build:game`。

编辑器草稿不会自动进入游戏，也不会被游戏运行时读取。只有保存到 `content/test-story.json` 并重新刷新/构建后，玩家端内容才会改变。

## 文档

- [游戏机制规范](docs/GAME_MECHANICS_SPEC.md)
- [剧情数据格式](docs/STORY_DATA_FORMAT.md)
- [核心粉丝人设档案](docs/CORE_FAN_PERSONAS.md)
- [视觉设计系统](DESIGN.md)
- [交互契约](UX-CONTRACT.md)
