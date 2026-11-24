/**
 * Live acceptance against the 阿里云 (aliyun) provider: pool sync, three task
 * routes, and a three-turn plugin session compared with a direct-model
 * session that does not use the plugin. Prints usage (including prompt-cache
 * reads) and the answers, never the credential.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = name => import(pathToFileURL(join(root, 'lib', name)).href)
const { Router } = await lib('router.js')
const { RouterStore } = await lib('store.js')
const { BailianAutoAdapter } = await lib('adapter.js')

const CREDENTIALS = 'C:\\Users\\30410\\.dsh\\.credentials.yaml'
const BASE_URL = 'https://ws-1pqxsqiw8lnjc2uf.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
const KEY_ENV = 'ALIYUN_API_KEY'
const DEFAULT_MODEL = 'deepseek-v4.1-flash-1017'

function credential(ref) {
  const text = readFileSync(CREDENTIALS, 'utf8')
  const match = new RegExp(`^\\s+${ref}:\\s*(\\S+)\\s*$`, 'm').exec(text)
  if (!match) throw new Error(`credential ${ref} not found`)
  return match[1].replace(/^["']|["']$/g, '')
}

const apiKey = credential(KEY_ENV)
console.log('provider   : 阿里云 / aliyun')
console.log('endpoint   :', BASE_URL)
console.log('credential :', KEY_ENV, `(${apiKey.slice(0, 3)}…)`)

const ctx = {
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  llm: { fileRequestText: ref => `[file ${ref?.attachmentId ?? '?'}]` },
  fiber: {},
  effect() {}, on() { return () => {} }, get() { return undefined }, provide() {}, inject() {},
}

const config = {
  baseURL: BASE_URL,
  apiKeyEnv: KEY_ENV,
  enableDecision: true,
  decisionModel: DEFAULT_MODEL,
  decisionTimeoutMs: 20000,
  decisionInputMaxChars: 4000,
  fallbackModel: DEFAULT_MODEL,
  maxAttempts: 4,
  quotaCooldownMinutes: 30,
  rateLimitCooldownSeconds: 120,
  streamIdleTimeoutMs: 60000,
  autoSyncPool: true,
  poolSyncIntervalHours: 24,
  adoptProfileProvider: false,
  taskRoutes: {
    image: ['qwen3.8-max-0902', 'qwen3-vl-plus', 'qwen3.8-omni-flash'],
    writing: ['glm-5.2', 'qwen3.8-max-0902'],
    translation: ['qwen-mt-plus', 'qwen3.8-max-0902'],
    code: ['deepseek-v4-pro', 'qwen3.8-max-0902'],
    reasoning: ['deepseek-v4-pro', 'qwen3.8-max-0902'],
    general: [DEFAULT_MODEL, 'qwen3.8-flash'],
  },
  models: [],
}

process.env[KEY_ENV] = apiKey
const tmp = await mkdtemp(join(tmpdir(), 'bar-live-aliyun-'))
const store = RouterStore.create(join(tmp, 'state.json'))
await store.ready
const router = new Router(ctx, config, store)
const adapter = new BailianAutoAdapter(router)

const checks = []
const check = (ok, message) => {
  checks.push({ ok: Boolean(ok), message })
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`)
}

const sync = await router.syncPool(true)
check(sync.ok, `模型池同步: ${sync.message}`)
const poolIds = store.state.pool.map(entry => entry.id)
check(poolIds.includes(DEFAULT_MODEL), `决策模型在池中: ${DEFAULT_MODEL}`)
console.log('   可对话模型:', store.state.pool.length)

/** One plugin-routed request. Pass `history` to continue one conversation. */
async function pluginTurn(label, sessionId, text, { maxTokens = 1200, history = null } = {}) {
  const messages = history ?? [
    { role: 'system', id: 's', content: [{ type: 'text', text: '你是一个严谨的中文技术助理，回答要可直接使用。' }], source: { kind: 'system' } },
  ]
  messages.push({ role: 'user', id: `u-${label}-${Date.now()}`, content: [{ type: 'text', text }], source: { kind: 'user' } })
  const options = { provider: 'bailian-auto', model: 'bailian-auto', messages, maxTokens, sessionId }
  const chunks = []
  const started = Date.now()
  for await (const chunk of adapter.stream(options)) chunks.push(chunk)
  const answer = chunks.filter(c => c.type === 'text-delta').map(c => c.text).join('')
  const reasoning = chunks.filter(c => c.type === 'reasoning-delta').map(c => c.text).join('')
  const finish = chunks.at(-1)
  if (history !== null) history.push({ role: 'assistant', id: `a-${label}-${Date.now()}`, content: [{ type: 'text', text: answer }], source: { kind: 'assistant' } })
  const record = store.state.history.at(-1)
  console.log(`\n=== 插件 / ${label} ===`)
  console.log('   session  :', sessionId)
  console.log('   task     :', record?.task, '| source:', record?.decisionSource, '| final:', record?.finalModel)
  console.log('   attempts :', record?.attempts.map(a => `${a.model}${a.ok ? '✓' : `✗${a.code}`}`).join(' -> '))
  console.log('   tokens   :', `in=${record?.inputTokens} out=${record?.outputTokens} cache=${record?.cacheReadTokens} total=${record?.tokens}`)
  console.log('   decision :', record?.decisionTokens, 'tok |', record?.reasoning)
  console.log('   latency  :', Date.now() - started, 'ms')
  console.log('   finish   :', JSON.stringify(finish?.reason ?? null), `text=${answer.length} reasoning=${reasoning.length}`)
  console.log('   answer   :', answer.replace(/\s+/g, ' ').slice(0, 240))
  check(answer.trim().length > 0, `${label}: 收到回答`)
  check(record?.ok === true, `${label}: 路由成功`)
  return { record, answer, latencyMs: Date.now() - started }
}

// Isolated task probes.
const writing = await pluginTurn('中文写作', 'qa-writing', '请写一段 120 字左右的咖啡店开业文案，语气温暖，结尾带号召。')
const code = await pluginTurn('代码任务', 'qa-code', '用 TypeScript 写一个带泛型和边界检查的 LRU 缓存类，并给出两个关键单测用例。', { maxTokens: 4096 })
const general = await pluginTurn('通用对话', 'qa-general', '你好，请用两句话介绍你自己，并说明你能帮我做什么。')
console.log('\n任务路由结果:', { writing: writing.record?.finalModel, code: code.record?.finalModel, general: general.record?.finalModel })

// Direct baseline for the same three isolated prompts: no plugin, default model.
async function directProbe(label, text, maxTokens) {
  const messages = [
    { role: 'system', content: '你是一个严谨的中文技术助理，回答要可直接使用。' },
    { role: 'user', content: text },
  ]
  const started = Date.now()
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: DEFAULT_MODEL, messages, max_tokens: maxTokens }),
  })
  if (!response.ok) throw new Error(`direct ${label} ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const data = await response.json()
  const answer = data.choices?.[0]?.message?.content ?? ''
  const usage = data.usage ?? {}
  console.log(`\n=== 直连基线 / ${label} ===`)
  console.log('   model    :', DEFAULT_MODEL)
  console.log('   tokens   :', `in=${usage.prompt_tokens ?? 0} out=${usage.completion_tokens ?? 0} total=${usage.total_tokens ?? 0}`)
  console.log('   latency  :', Date.now() - started, 'ms')
  console.log('   answer   :', answer.replace(/\s+/g, ' ').slice(0, 240))
  return { answer, usage, latencyMs: Date.now() - started }
}
const directWriting = await directProbe('中文写作', '请写一段 120 字左右的咖啡店开业文案，语气温暖，结尾带号召。', 2000)
const directCode = await directProbe('代码任务', '用 TypeScript 写一个带泛型和边界检查的 LRU 缓存类，并给出两个关键单测用例。', 4096)
const directGeneral = await directProbe('通用对话', '你好，请用两句话介绍你自己，并说明你能帮我做什么。', 2000)
const pluginSpend = row => (row.record?.tokens ?? 0) + (row.record?.decisionTokens ?? 0)
console.log('\n开/关插件对比:', {
  writing: { plugin: pluginSpend(writing), direct: directWriting.usage.total_tokens, pluginMs: writing.latencyMs, directMs: directWriting.latencyMs },
  code: { plugin: pluginSpend(code), direct: directCode.usage.total_tokens, pluginMs: code.latencyMs, directMs: directCode.latencyMs },
  general: { plugin: pluginSpend(general), direct: directGeneral.usage.total_tokens, pluginMs: general.latencyMs, directMs: directGeneral.latencyMs },
})

// Multi-turn cache behavior: same session, same model is expected after turn 1.
const sessionId = 'qa-cache-session'
const turns = [
  '我们先做一个需求：给一个小团队写一份 5 条以内的周报模板。',
  '把模板里的“风险”一栏改成三个具体检查问题。',
  '再给这份周报模板写一句 20 字以内的使用提示。',
]
const pluginTurns = []
const cacheHistory = [
  { role: 'system', id: 's', content: [{ type: 'text', text: '你是一个严谨的中文技术助理，回答要可直接使用。' }], source: { kind: 'system' } },
]
for (const [index, text] of turns.entries()) {
  pluginTurns.push(await pluginTurn(`缓存第 ${index + 1} 轮`, sessionId, text, { maxTokens: 2000, history: cacheHistory }))
}
const pluginModels = pluginTurns.map(row => row.record?.finalModel)
console.log('   粘性模型序列:', pluginModels.join(' → '))
check(new Set(pluginModels).size === 1, '同一会话三轮保持同一执行模型')
const cacheHits = pluginTurns.map(row => row.record?.cacheReadTokens ?? 0)
console.log('   缓存读取序列:', cacheHits.join(' → '))
if (cacheHits.slice(1).some(value => value > 0)) {
  console.log('   ok  第二轮起出现提示缓存命中')
} else {
  console.log('   note 本轮上下文不足 1024 token 或本次隐式缓存未命中;长前缀对照见 test/live-cache.mjs')
}

// Direct baseline: identical three-turn conversation, no plugin, default model.
const baselineMessages = [
  { role: 'system', content: '你是一个严谨的中文技术助理，回答要可直接使用。' },
]
async function directTurn(text, maxTokens = 2000) {
  baselineMessages.push({ role: 'user', content: text })
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: DEFAULT_MODEL, messages: baselineMessages, max_tokens: maxTokens }),
  })
  if (!response.ok) throw new Error(`direct ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const data = await response.json()
  const answer = data.choices?.[0]?.message?.content ?? ''
  baselineMessages.push({ role: 'assistant', content: answer })
  const usage = data.usage ?? {}
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
  console.log(`\n=== 直连 / 第 ${baselineMessages.filter(m => m.role === 'user').length} 轮 ===`)
  console.log('   tokens   :', `in=${(usage.prompt_tokens ?? 0) - cached} cache=${cached} out=${usage.completion_tokens ?? 0} total=${usage.total_tokens ?? 0}`)
  console.log('   answer   :', answer.replace(/\s+/g, ' ').slice(0, 240))
  return { answer, usage, cached }
}
const baselineTurns = []
for (const text of turns) baselineTurns.push(await directTurn(text))
const baselineCached = baselineTurns.map(row => row.cached)
console.log('   直连缓存序列:', baselineCached.join(' → '))
const baselineTotal = baselineTurns.reduce((sum, row) => sum + (row.usage.total_tokens ?? 0), 0)
const pluginTotal = pluginTurns.reduce((sum, row) => sum + (row.record?.tokens ?? 0) + (row.record?.decisionTokens ?? 0), 0)
console.log('\n三轮总量对比:', { plugin: pluginTotal, direct: baselineTotal })

console.log('\n--- 插件第 3 轮 vs 直连第 3 轮 ---')
console.log('PLUGIN:', pluginTurns[2].answer.replace(/\s+/g, ' ').slice(0, 500))
console.log('DIRECT:', baselineTurns[2].answer.replace(/\s+/g, ' ').slice(0, 500))

const failed = checks.filter(row => !row.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)
if (failed.length > 0) console.log('失败:', failed.map(row => row.message).join('; '))

await store.dispose()
await rm(tmp, { recursive: true, force: true })
process.exit(failed.length > 0 ? 1 : 0)
