<div align="center">

# dsh-auto-router

**多厂商智能路由 · 一个 API key，自动帮你挑模型**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-%E2%89%A50.2.0-1f6feb)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

在 DSH 的模型列表里选 **`bailian-auto`（智能路由 Auto Router）**，
插件就用你的账号（默认百炼，也支持硅基流动 / OpenRouter / 火山方舟 / 智谱等），按问题类型自动挑最合适的模型来回答，不用你手动切来切去。

</div>

---

> **第一次用?** 配置面板在本页**最下方**,往下滚到「账号与更新 / 路由与策略 / 模型池与限额 / 自检与日志」四个页签。
> 右下角还有一个小浮窗,随时显示当前 key、模型池和「上次决策」,点「收起」可以缩成一个小胶囊。

---

### 0.9.10 更新:浮窗可以拖动，点外面自动收起

- **右下角「智能路由」胶囊支持拖动**：按住胶囊拖到顺手的位置，松手即记住；拖动超过 4px 才生效，轻点仍然是展开。
- **位置会保存**：存在本机 `localStorage`，刷新页面或重启 DSH 后仍在原处；拖出屏幕边缘时会自动夹回可见范围。
- **展开后点外面自动收起**：点聊天区、侧栏或页面空白处，卡片立即缩回胶囊；点卡片内部的按钮、排序下拉和日志不会被误关。
- 拖拽结束后的那次 click 会被抑制，不会出现“刚拖完就弹开”的情况。
- 移动端 `0.7.3` 已同步同样的拖拽与外部收起代码，等手机接上后再做真机部署和点击回归。


### 0.9.9 更新:浮窗跟着当前会话走

- **浮窗不再只认全局最后一次路由**：现在按侧栏当前打开的会话读取「上次决策」和执行模型；切到另一个会话，不会再把上一个会话的模型和 token 当成当前会话。
- 当前会话还没有路由记录时，浮窗显示「本会话还没有路由记录」，不再拿别的会话记录冒充。
- 设置页、首页这类没有当前会话的界面，仍显示全局最新一条，并标成「最近」。
- 同一会话内的多模型聚合保留：仍会显示每个实际执行过的模型和次数。


### 0.9.8 更新:学生 300 元券保护（默认不碰现金模型）

- **新增 `allowCouponIneligibleModels`，默认 `false`**：学生认证 300 元券不能抵扣的模型族默认不进候选池，避免为了试 Omni/语音/画图把现金余额扣成负数。
- 默认排除 **Omni 全模态、语音、OCR/翻译/角色/研究、向量排序、万相/Happy/图像、云市场三方**等商品；普通对话模型（`qwen3.8-max`、`qwen-plus`、`qwen-flash`、`deepseek-v4.1-flash` 等）不受影响。
- 只对**阿里云百炼端点**生效；硅基流动、OpenRouter 等其它厂商不会被误伤。
- 面板「模型池与限额」新增中文开关，默认不勾选；需要这些能力时由用户自己打开，费用按现金结算。



### 0.9.2 更新:缓存、成本与回退

- **决策模型只从可用模型里选**:候选先过滤冷却、额度超限、连续失败;`UNKNOWN_MODEL` / `INVALID_REQUEST` 等坏模型停用 6 小时,不再每轮重试。
- **成本护栏**:简单题 3、普通 4、复杂 8、深度 12(¥/百万 token 估算)。一句口号或「9.11 和 9.9 哪个大」不会再选 12¥/M 旗舰;跨文件重构、完整迁移方案才放开高价模型。
- **任务分类以规则为准**:决策模型只负责选模型,不再把数学比较标成代码。
- **回退链一定包含 fallback**:坏模型不能吃光重试次数;`INVALID_REQUEST` 未输出前可切换,已经输出后不切换。
- **缓存**:同会话固定模型,只有价格超带、能力不足、图片输入、冷却或达到上限才重选;复杂任务可升级,简单任务可降级。浮窗与日志显示「缓存 X%」。
- **浮窗上次决策**:标题、摘要、工具续写等后台调用只进台账,不覆盖用户主任务记录。

---

## 这个插件是干什么的

你有一个 API key（百炼、硅基流动、OpenRouter、火山方舟、智谱……任选），里面能访问很多模型：写作的、写代码的、推理的、画图的、语音的……
平时你得自己猜「这个问题该用哪个模型」，很麻烦，还容易盯着一个贵的模型一直用。

装上这个插件后，DSH 的模型列表里会多出一个 **`bailian-auto`**。选它之后，你正常提问就行：

- 插件先让一个「决策模型」快速判断这是什么任务（写作 / 代码 / 推理 / 翻译 / 看图 / 闲聊）；
- 然后自动转交给**你账号里**最适合的那个模型去回答；
- 难题自动开大推理强度，简单问题关掉推理，省钱省时；
- 某个模型额度用完 / 报错 / 限流，自动悄悄换下一个，你不用管；
- 同一类问题会在几个差不多好的模型之间轮流用，不会盯着一个最强的薅；用量相近时优先用更强的那个。

**全程只用你这一个 API key 下的模型，不会跳到别的 key、别的账号。**

## 0.6 新增（大版本）

- **配置页分成四个页签**：账号与连接 / 路由与策略 / 模型池与限额 / 日志与自检，不用一长条往下滚。
- **五种挑模型顺序**：智能（默认）、价格优先（便宜先用）、能力优先（旗舰先用）、速度优先、免费额度轮转。
  免费额度轮转 = 按“已用 token / 桶大小”的比例，优先用当前最空、最便宜的轻量模型（如 qwen-flash、qwen3.8-flash、deepseek-v4.1-flash），轮着遍历每个可用模型；不是把某个模型先烧满 1M 才换。桶大小和「算不算用完」的容差都能调，全用完自动进下一周期。
- **每模型行内限额**：在模型池表格里直接填「次数 / token」上限，不用手写 JSON；到上限自动换下一个。
- **每-key 用量台账**：本地记每个 key 在每个模型上花了多少 token，换 key 不丢历史（各 key 独立记账，不跨 key 混算）。
- **自己指定模型**：对话里发 `/model 模型id` 或 `@model:模型id`，这一条就固定用该模型，下一条恢复自动；
  日志会标「用户指定 / 自动」、所用策略和回答 token。
- **账号下拉合并去重**：保存的账号 + profile 连接合在一个下拉里，自动过滤插件自身、按接口+凭据去重，不再重复卡片。
- 决策 / 回退模型改成下拉选；清空某任务候选 = 按价格优先自动填充。

## 0.7 改进（按反馈重做）

- 账号下拉**可搜索**、显示你起的名字/厂商名，选中后不再跳回「默认」；删掉了重复的「阿里云连接」栏。
- 决策/回退/各任务候选都改成**下拉选模型**，不用手敲 id；模型池每行可直接设限额，「1M」一键设 100 万 token，不用写 JSON。
- 页脚小组件实时显示上次用的模型/token，并能快捷切换排序。
- 检查更新按钮有明确反馈；「自检与日志」页签集中自检和历史。

## 0.9 新增（账号显示与聊天浮窗）

- 账号/连接统一显示「**显示名: provider id**」（如 `PackyCode: cc-switch-packy-code`）。显示名来自「设置 → 模型」里的厂商名，冒号后才是内部标识；不再显示 `CC_SWITCH_...` 这类凭据引用串。
- 插件面板与聊天页浮窗**使用同一份账号状态**：在哪边切换，另一边立刻同步，不再各选一个账号。
- 聊天页浮窗新增**上次决策可视化**：任务类型 → 决策模型 → 执行模型，附来源、策略、重试次数、决策/回答 token 与成功失败；近 8 次迷你趋势和成功率。
- 浮窗的排序切换/刷新即时生效并给出反馈（成功或失败原因），不再"点了没反应"。
- 删除「继承旧 key 台账」：各 key 各记各的，不做跨 key 合并。

### 0.9.1 修正（换 key / 缓存 / 逐页验收）

- **上次决策按 key 隔离**：浮窗和日志只显示当前 key 的记录，换账号不会再看到上一个 key 的任务、模型或理由。
- **同会话不再反复问决策模型**：同一会话在 50 次模型调用内沿用已选模型（即使追问被启发式判成写作/翻译也不换），直接跳过决策调用（每轮省约 800–1000 prompt token），保护厂商前缀缓存；只有图片输入需要视觉、模型冷却、超上下文或达到上限才重选。
- **浮窗显示缓存命中率**：执行完成后显示「缓存 X%」，日志每条也带缓存百分比；厂商不返回缓存明细时显示 0%，不再假装有缓存。
- 删除历史遗留的重复插件配置（旧 `bailian-auto-router` 行），避免同一插件两个实例同时写一份状态。
- **简单请求不再花决策费**：简单对话/写作/翻译直接按任务规则选性价比模型（只在中低价位候选里挑，避免简单周报模板被分到 qwen-max 旗舰），每轮省约 800–1000 决策 token；复杂代码/推理仍交给决策模型。
- **普通代码优先快模型**：单文件实现、示例、单测先选 `deepseek-v4.1-flash`，只有跨文件重构、复杂算法、线上故障才用 pro；新增 TypeScript/实现/泛型/单测等代码识别词，不再把“用 TypeScript 实现 LRU”误判成通用对话。
- **不再被隐藏思考吃满输出**：无思考开关的模型（DeepSeek flash/pro 在阿里云）显式下发 `enable_thinking:false`；此前一次代码请求 4096 token 全花在 reasoning、可见回答 0 字的问题已修复。
- 实测（阿里云 key，同一提示词）：写作插件 128 tok / 直连 1168，代码插件 1892 tok（5.3s）/ 直连 4165（19.5s），三轮同会话 2098 / 直连 2058；第三轮缓存命中 256，费用没有异常放大。
- 断言 464。

## 0.8 新增（大版本）

- **设置重启不丢**：排序、选中账号、连接中文名、每模型限额、保存的账号等全部持久化到
  `~/.dsh/auto-router/prefs.json`，重启 DSH 后自动恢复（此前宿主 volatile 配置重启即回默认）。
  prefs 损坏自动忽略回退，不影响插件激活；文件仅本机保存，与 profile 配置同级信任。

## 0.7.1 / 0.7.2 改进

- 连接可**改中文名**（「检测到的连接」卡），下拉与列表同步显示；默认显示「厂商中文名 · 凭据引用」。
- 限额改**万 token** 单位，旧小值自动迁移（修复「填 100 意为 100 万却被当 100 token、秒触发冷却」的根因）。
- **右下角浮窗小组件**：主页 / 会话页 / 插件页全应用可见，可收起，快捷排序 / 换账号 / 刷新。
- 组件 id / 状态目录彻底去 bailian（`auto-router`），旧数据自动迁移不丢；界面固定中文。

## 费用提示（重要）

- 选智能路由**会加快余额消耗**：复杂问题会被派给更强（也更贵）的模型，单题成本可能高于固定用一个便宜模型，但处理效果更优。想省钱选「价格优先」。
- **免费额度轮转**是亮点：按“已用 token / 桶大小”的比例，优先用当前最空、最便宜的轻量模型，轮着遍历每个可用模型，而不是把某个模型先烧满 1M 再换。台账按 key 记忆，切换排序不重置、只有换 key 才重置；换 key 又换回可能让该 key 超出免费额度，建议配合厂商「用完即停」。
- **学生 300 元券默认保护**：券不能抵扣的全模态/语音/图像/向量/三方等模型默认不进池，详见下节；没有券或愿意现金付费的用户可在面板打开开关。

### 学生认证 300 元券（重要）

如果你用的是阿里云「云工开物」学生认证 300 元抵扣金，先看这一节：

- **券没丢，也不是所有模型都能抵**。2026-07-14 之后领取的 300 元券，官方明确有 8 类商品不支持抵扣：三方直供模型、Happy 系列、万相、向量排序、垂类、百聆语音、千问语音、千问全模态。官方页面给的是示例，**最终以账单里的「商品名称」为准**。
- **插件默认不路由这些模型**。`allowCouponIneligibleModels=false` 时，`buildPool` 会按下列前缀把它们挡在候选池外，面板「查看被排除的模型」会标注「学生券不抵扣」：
  - 全模态：`qwen3.5-omni*`、`qwen3.8-omni*`、`qwen3-omni*`、`qwen3-s2s*`
  - 语音：`qwen3-asr*`、`qwen3-tts*`、`qwen-audio*`、`fun-asr*`、`fun-cosyvoice*`、`cosyvoice*`
  - 垂类/OCR/翻译/角色/研究：`qwen-mt*`、`qwen3.5-ocr*`、`qwen-vl-ocr*`、`qwen3.8-livetranslate*`、`qwen3.5-livetranslate*`、`qwen3-livetranslate*`、`qwen-flash-character*`、`qwen-plus-character*`、`qwen-doc-turbo*`、`gui-plus*`、`qwen-deep-research*`、`qwen-deep-search-planning*`、`tongyi-xiaomi-analysis*`
  - 向量/排序：`qwen3.7-text-embedding*`、`qwen3.7-text-rerank*`、`qwen3-vl-embedding*`、`qwen3-vl-rerank*`、`tongyi-embedding-vision*`
  - 图像/视频/万相/Happy：`wan2.7*`、`wan3.0*`、`happyhorse*`、`qwen-image*`、`z-image*`
  - 云市场三方：`vanchin/*`、`siliconflow/*`、`MiniMax/*`、`kimi/*`、`ZHIPU/*`、`stepfun/*`、`unisound/*`、`antdigital/*`、`Xing/*`、`xiaomi/*`、`cmaas-*`
- **想用这些模型怎么办**：面板「模型池与限额」勾选「允许使用『学生 300 元券不抵扣』的模型（默认关闭）」，或把 `allowCouponIneligibleModels` 设为 `true`。打开后插件不再替你挡，产生的费用按现金结算。
- **只对百炼生效**：硅基流动、OpenRouter、火山方舟等其它端点不会套用这份排除表。
- **券是代金券，不是现金余额**：后付费会冻结当月消费，现金余额不足时，即使券里还有钱也可能停机；已经欠费停机的账户，券不能直接补欠费，需要先充值结清。
- 官方规则：[账单查询与费用管理](https://help.aliyun.com/zh/model-studio/bill-query-and-cost-management)、[云工开物 300 元券说明](https://help.aliyun.com/zh/model-studio/introduction-to-yungongkaiwu)、[欠费处理](https://help.aliyun.com/zh/user-center/timely-handling-of-arrears)。

> 如果券是 **2026-07-14 之前**领取的，排除规则可能不同，请先按账单「商品名称」核对，不要直接照这份清单停用。插件默认仍按保护策略排除，需要时再打开开关。

## 适配范围（重要）

- **现在适配**：任何「一个 API key 下能访问多个模型」的 OpenAI 兼容平台——阿里云百炼（默认）、硅基流动、OpenRouter、火山方舟、智谱开放平台、Moonshot、DeepSeek 官方，以及其它通用 OpenAI 兼容网关。**不绑定百炼**。
- **自动识别**：插件按你填的接口地址自动认出是哪家平台（也可在面板「厂商预设」里手动指定），并套用该平台正确的思考参数写法。
- **不会凭空造模型**：插件只认你账号 `GET /models` 真实返回的模型。账号里没有的（比如 gpt）不会出现，也不会被路由到。

## 支持的平台

| 平台 | 默认接口地址 | 凭据环境变量 | 思考参数写法 |
| --- | --- | --- | --- |
| 阿里云百炼（默认） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `BAILIAN_API_KEY` / `DASHSCOPE_API_KEY` / `ALIYUN_API_KEY` | `enable_thinking` + `thinking_budget` |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `SILICONFLOW_API_KEY` | `enable_thinking` |
| OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `reasoning_effort` |
| 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | `ARK_API_KEY` / `VOLCENGINE_API_KEY` | `reasoning_effort` |
| 智谱开放平台 | `https://open.bigmodel.cn/api/paas/v4` | `ZHIPU_API_KEY` / `BIGMODEL_API_KEY` | `enable_thinking` |
| Moonshot | `https://api.moonshot.cn/v1` | `MOONSHOT_API_KEY` | 不下发思考参数 |
| DeepSeek 官方 | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | `reasoning_effort` |
| 通用 OpenAI 兼容 | 你自己的网关地址 | 你配置的那个 | `reasoning_effort` |

换平台只需改接口地址 + 对应 key（或在面板选厂商预设），其余路由 / 均衡 / 额度 / 自检逻辑完全通用。

## 使用前提

> **⚠️ Base URL 必须和 API Key 是同一计费方案配套的，否则会 401；各地域、各业务空间的 Key 不互通。**

阿里云百炼的 OpenAI 兼容端点有四类，按你的 Key 类型选对的那一个：

| 域名 | 适用的 Key |
|---|---|
| `https://dashscope.aliyuncs.com/compatible-mode/v1` | 跨业务空间的**共享域名** Key |
| `https://{WorkspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1` | **仅限**该业务空间自己的 Key |
| `trial.{region}.maas.aliyuncs.com` | 试用空间 Key |
| Token Plan / Coding Plan 专属域名 | 仅限交互式工具，**不适用于**本插件的普通对话路由 |

本插件会扫描 profile 里所有指向阿里云（`aliyuncs.com`）的 OpenAI 兼容接入，**自动沿用**第一个能解析出凭据的那个端点 + Key，你不需要重复填。它不绑定任何特定包名，也不依赖 `llm-pi-ai` 之类的外部插件。

本机当前用的是**业务空间专属域名** `ws-0ha4etpemr33xny3.cn-beijing.maas.aliyuncs.com`，
所以 `BAILIAN_API_KEY` 必须是**这个业务空间**的 Key；如果填成跨空间的共享 Key 或 dashscope Key，会 401。

凭据查找顺序：接入自带的凭据引用 → `BAILIAN_API_KEY` → `DASHSCOPE_API_KEY` → `ALIYUN_API_KEY`
（DSH 凭据服务优先，其次启动环境变量）。

## 功能一览（大白话）

| 功能 | 说明 |
|---|---|
| **自动挑模型** | 决策模型（默认 `deepseek-v4.1-flash` 系列）判断任务类型，转交账号里最合适的模型；判断失败就用回退模型或规则排序，不会卡住对话 |
| **推理强度自适应** | 难题开大、简单题关掉，按复杂度自动调（off/low/medium/high/max），也可手动锁定 |
| **额度用完自动换** | 429 / 额度耗尽 / 网络错误，在还没开始输出前悄悄换下一个模型；已经开始输出后失败则直接报错，不重复输出 |
| **负载均衡** | 同类问题在几个差不多好的模型间按近期用量轮流用；用量相近时优先用更强的那个，不会一直薅一个旗舰 |
| **学生券保护** | 默认不让学生 300 元券不能抵扣的全模态/语音/图像/向量/三方模型进池；需要时可在面板打开，费用现金结算 |
| **画图** | 「画一张…」自动走图像生成接口，图片存到工作区 `.dsh-media/` 并回传链接 |
| **视频提示** | 账号没有视频模型时，直接告诉你没有 + 给替代方案，不白烧 token 去写脚本；「视频脚本 / 分镜 / 封面 / 剪辑」这类要文稿或图的请求不会被误拦 |
| **会话不跳模型** | 同一轮对话尽量固定一个模型，避免上下文缓存失效、工具调用格式漂移；长对话每 N 轮或上下文快满时重选 |
| **换账号零配置** | 换个百炼账号，模型池和冷却自动重置；配置的模型在新账号不存在就自动替代并提示 |
| **选 API 账号** | 面板顶部「当前 API 账号」下拉一键切换；可在插件里直接添加/保存/删除多厂商账号（端点 + API Key 或凭据引用），不用先去 DSH 设置里配 |
| **面板** | 插件页能看模型池、冷却状态、最近 50 条路由记录，能改配置、刷新模型、管理并切换 API 账号 |
| **零运行时依赖** | 不需要 `node_modules` 就能安装运行，不会因缺包激活失败 |

## 安装

```sh
# 本地目录（开发/自用，link 方式）
dsh plugin --profile web add link:/path/to/dsh-auto-router

# GitHub 仓库
dsh plugin --profile web add github:interested3041/dsh-auto-router

# 本地已 clone 的目录
dsh plugin --profile web add /path/to/dsh-auto-router
```

安装后**重启** `dsh web` / Desktop（宿主插件的新模块版本需要重启加载）。

## 配置

三种方式等价：插件页面板、profile 的 `cordis.patch.yml`、或凭据服务/环境变量。

| 字段 | 默认 | 说明 |
|---|---|---|
| `decisionModel` | `deepseek-v4.1-flash-1017` | 决策模型；**不在当前账号时自动替代** |
| `fallbackModel` | `deepseek-v4.1-flash-1017` | 决策失败时的回退执行模型 |
| `decisionTimeoutMs` | `12000` | 决策超时，超时即回退 |
| `maxAttempts` | `4` | 单请求最多尝试的模型数 |
| `taskRoutes` | 内置表 | 各任务类型的**首选**模型（其后的由打分决定） |
| `models` | `[]` | 自定义执行模型池（JSON），可覆盖视觉/上下文/标签 |
| `excludeModels` | `[]` | 排除规则，支持 `前缀*` 通配 |
| `allowCouponIneligibleModels` | `false` | 是否允许「学生 300 元券不抵扣」模型进池；默认关闭，仅百炼端点生效 |
| `balanceStrategy` | `balanced` | `balanced` 按 token 轮转；`quality` 始终用最优 |
| `balanceWindow` | `6` | 参与轮转的候选个数 |
| `balanceBand` | `0` | 分数保护带（0=关闭），避免旗舰与低价小模型混排 |
| `balanceWindowHours` | `24` | 用量统计窗口，超期自然衰减 |
| `thinkingEffort` | `auto` | 思考档位策略：auto / off / low / medium / high / max |
| `enableDecision` | `true` | 关闭后仅按启发式规则路由 |
| `quotaCooldownMinutes` | `30` | 额度耗尽/不可调用模型的冷却时长 |
| `rateLimitCooldownSeconds` | `120` | 限流/网络类失败的冷却时长 |
| `enableMediaRouting` | `true` | 图像生成意图是否走 `/images/generations` |
| `stickySession` | `true` | 同一会话固定首选模型；关闭后每请求按均衡轮转 |
| `sessionTurnLimit` | `50` | 同会话每 N 次模型调用允许重选一次；Agent 工具循环也算调用，默认 50 避免中途换模型打断缓存 |
| `autoSyncPool` / `poolSyncIntervalHours` | `true` / `24` | 模型池自动同步 |
| `accounts` | `[]` | 已保存的百炼账号列表（名称 + 端点 + API Key 或凭据引用），面板可增删改 |
| `activeAccountId` | `''` | 当前账号 id；空 = 用默认接口/自动沿用 profile 连接 |

### 改决策模型 / 候选池

- **只换决策模型**：面板「决策模型」填任意你账号里存在的 id，保存即生效；
- **只调某类任务的候选**：面板「各任务类型候选模型」按优先级填 id，逗号或换行分隔；
- **整体换池**：在「自定义模型池」粘贴 JSON 数组，`[{ "id": "...", "vision": true, "tags": ["code"] }]`；
- **想让某类任务只用固定模型**：`balanceStrategy=quality` + 该类候选只填一个 id。

### 选 / 换 API 账号

- **顶部下拉**：面板顶部「当前 API 账号」可在「默认接口/自动沿用」「已保存账号」「profile 已有连接」之间一键切换，切换后自动重新同步模型池并重置冷却。
- **插件内多账号管理**：在「API 账号管理」里添加账号（名称 + 接口地址 + 凭据）。凭据二选一：直接填 **API Key**，或只填**凭据引用**（环境变量名，走 DSH 凭据服务/环境）。可编辑、启用、删除；编辑时 Key 留空即保留原 Key。
- **profile 连接**：面板「阿里云连接」仍列出 profile 里所有阿里云兼容接入，点「切到这个账号」即切换。
- 旧账号的模型池与冷却会自动清空；配置的模型在新账号不存在时自动替代并提示，配置值本身不被改写。

> **Key 安全**：直接填的 API Key 以 `secret` 形式存于本机 profile 配置，面板只打码显示末四位（`••••xxxx`），**绝不写入 `state.json`、日志或跨 RPC 传输**。想让 Key 完全不落 profile，就用「凭据引用」型账号或环境变量。

## 视觉能力怎么判定

面板「视觉」列是三态，不是简单的有/无：

- **✓ / ✗**：来自内置目录或自定义模型池里的显式 `vision` 声明，属于“已核实”；
- **—**：目录里没有这个模型（多为账号 `/models` 同步来的新 id），只能按 id 关键词
  （`vl` / `vision` / `qvq` / `omni` / `ocr`）推断，面板如实标成“未核实”；
- 运行时还会学习：图片请求成功会记为“确认可用”，模型明确拒绝图片则记为 veto，
  之后不再把它当视觉模型推荐。

所以别名/同族模型要显式写对 `vision`，否则会出现“同族一个 ✓、一个 —”的观感差异。

## 面板里能做什么（0.3.0 现状）

- 顶部「当前 API 账号」下拉，一键切换账号；
- 添加 / 编辑 / 启用 / 删除多厂商账号（端点 + API Key 或凭据引用）；
- 看账号识别到多少模型、多少能对话、多少视觉模型；
- 看每个模型的**本地冷却状态（启发式，非真实配额）**、连败、调用次数；
- 改决策模型 / 回退模型 / 冷却时长 / 均衡策略 / 推理档位；
- 按任务类型设候选模型优先级；
- 一键刷新模型列表、解除冷却；
- 看最近 50 条路由决策（任务类型、决策来源、尝试链、原因）。

> 说明：面板里的「冷却状态」是插件根据失败/限流做的**本地启发式判断**，不是百炼后台的真实剩余配额。

## 路线图

**已落地**（0.4.0 / 0.5.0）：分类展开面板、每模型额度上限、一键完整性自检、多厂商适配（见上表）。
**dshgo 移动端移植已发布**：独立仓库 [`dsh-auto-router-dshgo`](https://github.com/interested3041/dsh-auto-router-dshgo) v0.1.0（engine ≥0.2.2-rc.1），路由逻辑与本插件一致，真机适配进行中。

**后续计划**（尚未实现）：

- **dshgo 真机适配回传**：移动端剩余平台差异由 dshgo 自行适配修复后回传 `dsh-auto-router-dshgo` 迭代；
- **更多厂商预设**：按社区反馈补充端点识别与思考参数写法；
- **路由可解释性**：面板展示每次决策的候选打分与降级原因明细。

## 测试

```sh
npm install
npm run build      # tsc（宿主 + 客户端两套 tsconfig）+ 校验 client.js 为经典脚本（不含 ESM 语法）
npm test           # 冒烟 + 分类/排序 + 路由 + 换账号 + 多账号管理 + 多厂商预设 + 均衡/档位/媒体/视频闸门/会话粘 + 额度上限 + 学生券默认关闭/opt-in
npm run test:live  # 用本机真实凭据与端点跑通完整链路（会计费，按需）
```

`lib/client.js` 必须能被浏览器当作**经典脚本**求值（它通过 `window.__ModuleLoader__.load({...})` 自注册），构建后会强制校验，防止 `SyntaxError: Unexpected token 'export'` 再次发生。

## 目录结构

| 路径 | 职责 |
|---|---|
| `src/index.ts` | 插件入口：注册适配器、RPC 服务、池同步定时器 |
| `src/adapter.ts` | `bailian-auto` 虚拟模型（元数据 + 思考档位阶梯） |
| `src/router.ts` | 路由核心：决策、额度冷却、静默回退、媒体分发、会话粘模型、能力学习 |
| `src/decision.ts` | 输入分析、复杂度与档位映射、候选构建、视频闸门、决策 Prompt |
| `src/pool.ts` | 模型池构建、按任务排序、token 均衡轮转、媒体池 |
| `src/classify.ts` | 由模型 id 推断端点类别 / 视觉 / 规模 / 任务亲和度 |
| `src/wire.ts` | harness ⇄ OpenAI 兼容 wire 的消息与流转换 |
| `src/http.ts` | chat-completions（流式）、`/models`、`/images/generations`、错误分类 |
| `src/media.ts` | 图像生成落盘与 Markdown 回传 |
| `src/store.ts` | 本地状态：池、冷却、用量、会话绑定、能力学习 |
| `src/connection.ts` | 从 profile 已有接入发现并沿用连接 |
| `src/service.ts` / `src/remote.ts` | RPC 服务与通用 codec 透传 |
| `src/vendors.ts` | 多厂商预设、端点自动识别、思考参数风格 |
| `src/home.ts` | DSH home 路径解析（移动端兜底） |
| `src/client.ts` | Web 配置 + 状态面板（经典脚本 bundle） |

## 更新与部署

插件由 DSH 在启动时一次性加载并缓存模块身份，**不要边跑边覆盖安装目录**，否则会短暂出现
`duplicate factory registration` / 模块解析失败之类报错。固定流程：

1. 构建测试：`npm run build` + `npm test`；
2. 一键部署：`powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`
   （脚本依次：停止 DSH NEXT / 经典版 → 覆盖 `lib/docs/locale/src/test` 与 `package.json/CHANGELOG/README`
   → 启动 DSH NEXT → 打印版本与进程数）；
3. 打开插件详情确认版本号、配置面板与「包含的组件」运行状态。

只部署不重启用 `-SkipStop`；只停不启用 `-NoStart`；安装目录不同用 `-InstallDir` 覆盖。

## 已知限制

- **语音合成/识别不可用**：本网关 HTTP 面未提供（`/audio/speech` 404、chat 带 `voice` 返回 400、omni 忽略 audio），这些端点只登记不路由；
- `wan2.7-image` 等模型可能返回 `403 AccessDenied.Unpurchased`，会按额度类失败冷却并换下一个；
- `/models` 里存在但实际不可调用的模型会以 `UNKNOWN_MODEL` 进入 30 分钟冷却；
- 图像输入依赖模型真实支持；不支持时会记录并停止把它作为视觉模型推荐；
- **视频生成未接入**：账号若没有视频模型，插件只做能力说明与替代方案（零 token），不调用任何视频接口；视频接口多为异步任务 + 轮询，计划在后续版本接入；
- **状态文件只保证单进程**：`state.json` 采用 tmp + rename 原子写，没有跨进程锁；同一 `DSH_HOME` 下同时跑多个 DSH 进程时，后写者会覆盖先写者的冷却/会话绑定。多进程场景请分开 `DSH_HOME`。

## License

[MIT](LICENSE) © 2026 interested3041




