# 隐藏统计文件

游戏会在当前浏览器、当前网站来源（origin）内维护一份聚合统计，文件名为 `clip-simulator-statistics.json`。统计功能没有玩家界面、按钮或路由。

## 能统计什么

- 开始、放弃、完成的周目数，以及标准/拟真模式的开局次数。
- 回复总数、每个剧情节点的选项次数、累计延迟回合数和过期次数。
- 外卖次数、提前结局/总选结局次数与成就次数。
- 总选票数、泛人气票和每名核心粉丝票力的累计值。

只保存剧情包 ID、内容版本、节点/选项/粉丝/结局/成就 ID 和聚合数字。不会保存偶像姓名、队伍、头像、消息文本或时间线明细。

## 周目开始/结束上报

客户端会在以下边界静默尝试 `POST` 一次 JSON：

- 新周目创建后发送 `run_started`。
- 正常总选结局、提前结局或玩家主动放弃时发送 `run_finished`。

默认地址为同源 `/api/statistics`，可以在构建环境中通过 `VITE_STATISTICS_ENDPOINT` 覆盖，示例见 `apps/game/.env.example`。请求使用 `credentials: "omit"`、`referrerPolicy: "no-referrer"` 和 `keepalive: true`；不等待结果、不重试，也不在前端提示成功或失败。接口不存在、离线、超时、CORS 或服务端错误都不会影响游戏，本地 JSON 仍照常记录。

每个事件包含随机 `eventId` 和 `run.id`，服务端应按 `eventId` 幂等去重。上报只包含：

- 剧情包 ID、内容版本、模式和周目开始时间。
- 结束时的结局类型/ID、回合/日期、回复/过期/外卖次数。
- 总选时的总票数、泛人气票和成就 ID。

不发送偶像资料、粉丝消息、选项正文、逐节点选择或稳定设备 ID。

## 在开发时查看文件

游戏打开后，在浏览器开发者工具 Console 中运行：

```js
await __CLIP_STATS__.file();
```

返回浏览器网站私有文件系统（OPFS）中的 `File` 对象。下载为普通 JSON 文件：

```js
__CLIP_STATS__.download();
```

也可以直接在 DevTools 的 Application → Local Storage 中查看键 `clip-simulator:statistics:v1`。Local Storage 是兼容性主存储，OPFS 中的同名 JSON 文件是自动镜像；不支持 OPFS 的浏览器仍会正常统计和导出。

## 文件边界

本地文件仍是每台设备、每个浏览器来源各有一份。浏览器不能静默修改部署目录里的公共 `stats.json`；只有在部署方实现 `POST /api/statistics`（或配置等价端点）后，才能在服务端汇总所有玩家。服务端实现必须自行完成事件去重、限流、存储和统计文件生成。

当前结构版本为 `schemaVersion: 1`。剧情包统计按 `<storyPackId>@<contentVersion>` 分组，内容更新不会污染旧版本数据。
