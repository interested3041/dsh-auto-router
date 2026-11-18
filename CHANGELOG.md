# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-11-18

### 新增

- **选 API 账号(多账号管理)**:面板顶部新增「当前 API 账号」下拉,可在默认接口/自动沿用、
  已保存账号、profile 已有连接之间一键切换;切换后自动重新同步模型池并重置冷却。
- **插件内添加/保存/删除百炼账号**:每个账号 = 名称 + 接口地址 + 凭据。凭据二选一:
  直接填 API Key(以 `secret` 角色存于本机 profile 配置),或只填凭据引用(环境变量名,走 DSH 凭据服务/环境)。
  新增 RPC `upsertAccount` / `removeAccount` / `activateAccount`;编辑账号时留空 Key 即保留原 Key。
- 配置项 `accounts`(已保存账号列表)与 `activeAccountId`(当前账号,空=默认/自动沿用)。

### 安全

- **API Key 全程打码**:面板状态视图只返回 `hasKey` 与末四位提示(`••••xxxx`),明文 Key 绝不跨 RPC、
  绝不写入 `state.json` 或日志;明文仅存于本机 profile 配置的 secret 字段。
- 切换账号的作用域含账号标识(`baseURL|acct:<id>`),不同账号的模型池/冷却/会话绑定互不串用。

### 变更

- **README 重写**:去掉架构图与 provider/上层路由术语,改大白话;显式写明适配范围(当前百炼,
  目标任何"一个 key 多模型"的 OpenAI 兼容平台)与路线图(分类展开面板/每模型额度上限/一键完整性自检/多厂商/dshgo)。
- 测试增至 **256 条断言**(新增 `test/accounts.test.mjs` 30 条:配置解析/直连 Key/作用域/打码视图/增删改与启用)。

## [0.2.0] - 2026-11-18

### 新增

- **视频意图能力闸门**:识别"生成/制作/合成……视频/短片/动画"等生成意图;账号无可用视频模型时
  **零 token 短路**回复(能力说明 + 替代方案),路由记录记为 `decisionSource: "notice"`。
  排除词(脚本/文案/分镜/提示词/大纲/封面/海报/缩略图/首帧/演示/PPT/编码/格式/剪辑)优先:
  "生成视频脚本""视频封面图""剪辑这段视频"会降级为对话或图像,不会误短路。
- **会话粘模型路由**:同一 `sessionId` 固定首选模型,避免连续轮换打掉 provider 的 prompt cache 与
  tool-call 格式稳定性;同会话每 N 轮(默认 8,`sessionTurnLimit`)或上下文接近绑定模型窗口时允许重选以保持均衡;
  缺失 `sessionId` 时降级为请求级轮转;绑定 TTL 24h、上限 200 条、换账号清空。

### 修复

- 恢复 `postbuild` 经典脚本校验(`npm run build` 末尾执行),防止 `lib/client.js` 被追加
  `export {}` 导致客户端 `SyntaxError: Unexpected token 'export'`;`prepublishOnly` 改为 build + test。
- 错误记录写入端白名单:路由记录只持久化 `model / ok / code`;同步错误入库前经
  `redactSecrets()` 打码;测试断言 `state.json` 不含 `sk-` / `Bearer` / `apiKey` 明文。

### 变更

- 面板额度状态措辞改为「本地冷却状态(启发式,非真实配额)」,`decisionSource` 在面板中中文化,
  `notice` 显示为「未调用模型(能力闸门)」。
- 视频替代方案文案不再承诺本机 ffmpeg 合成,改为「另行安排(需你确认)」。

## [0.1.0] - 2026-11-18

首个发布版本。

### 新增

- **虚拟模型 `bailian-auto`(百炼智能路由)**:通过 `ctx.llm.registerAdapter` 注册,出现在 DSH 模型选择器。
- **请求前决策**:决策模型(默认 `deepseek-v4.1-flash-1017`)分析模态与任务类型,输出
  `{"selected_model","reasoning"}`;无效输出回落启发式排序。
- **账号模型池**:池成员来自账号自身 `GET /models`(实测 182 个 → 140 个可对话),
  内置目录仅提供元数据;`/models` 之外的 id 不会被虚构。
- **端点能力分类**:TTS / ASR / s2s / realtime / embedding / rerank / 图像 / 视频 / 音乐
  按能力分流,不再无差别丢弃。
- **图像生成路由**:媒体意图 → `POST /images/generations`,落盘到工作区 `.dsh-media/` 并回传 Markdown 链接。
- **负载均衡**:同一任务在排名前 N 的同类模型间按近期 token 消耗轮转,避免固定使用单一旗舰。
- **思考档位自适应**:`auto` 按复杂度在 `off/low/medium/high/max` 间切换,也可手动锁定;
  下游不接受该参数时自动记住并去参重试。
- **额度冷却与静默回退**:429 / 额度耗尽 / 不可调用模型进入冷却并切换;已输出内容后失败则直接报错。
- **能力学习**:带图失败记为"不支持图片",成功记为"支持";换账号时清空。
- **换账号零配置**:按 `baseURL|凭据引用` 记录作用域,切号自动重置池与冷却;配置模型不存在时自动替代。
- **面板**:插件页配置 + 额度状态 + 最近 50 条路由决策;设置 → 模型底部状态卡片。
- **零运行时依赖**:安装为普通目录亦可运行,不需要 `node_modules`。

### 修复

- `lib/client.js` 被 TypeScript 追加 `export {};` 导致浏览器
  `SyntaxError: Unexpected token 'export'`;构建新增后处理并强制校验为经典脚本。
- 负载均衡的记账桶(决策任务)与轮转桶(启发式任务)不一致,导致轮转从不生效。
- 同分比较让冷却中的模型抢回首位,违反冷却语义。