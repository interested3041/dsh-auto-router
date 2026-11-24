/**
 * Live prompt-cache acceptance for the 阿里云 endpoint.
 *
 * Sends a >1024-token identical prefix twice, once direct and once through the
 * plugin, and compares `prompt_tokens_details.cached_tokens`. Aliyun enables
 * implicit prefix caching automatically (minimum 1024 tokens); this proves the
 * plugin's serialization and sticky model do not break that cache.
 *
 * Run manually: `node test/live-cache.mjs` (reads ALIYUN_API_KEY from
 * ~/.dsh/.credentials.yaml, never prints it, costs a few thousand tokens).
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
const MODEL = 'qwen3.8-flash'

function credential(ref) {
  const text = readFileSync(CREDENTIALS, 'utf8')
  const match = new RegExp(`^\\s+${ref}:\\s*(\\S+)\\s*$`, 'm').exec(text)
  if (!match) throw new Error(`credential ${ref} not found`)
  return match[1].replace(/^["']|["']$/g, '')
}
const apiKey = credential(KEY_ENV)

// ~2.5k Chinese characters => >1024 tokens, the provider's cache threshold.
const paragraph = '项目背景：这是一个面向小型团队的周报系统，需要支持任务拆解、风险跟踪、成本核算与交付验收。'
const longText = Array.from({ length: 50 }, (_, i) => `${i + 1}. ${paragraph}`).join('\n')
console.log('prefix chars :', longText.length)

async function direct(question) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: longText },
        { role: 'user', content: question },
      ],
      max_tokens: 80,
      temperature: 0,
    }),
  })
  if (!response.ok) throw new Error(`direct ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const data = await response.json()
  const usage = data.usage ?? {}
  const details = usage.prompt_tokens_details ?? {}
  console.log('direct usage :', JSON.stringify({ prompt: usage.prompt_tokens, cached: details.cached_tokens, created: details.cache_creation_input_tokens, output: usage.completion_tokens }))
  return data
}

const direct1 = await direct('请用一句话说明这个项目的目标。')
const direct2 = await direct('请用两句话说明这个项目的主要风险。')

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
  decisionModel: 'deepseek-v4.1-flash-1017',
  fallbackModel: 'deepseek-v4.1-flash-1017',
  decisionTimeoutMs: 12000,
  maxAttempts: 4,
  quotaCooldownMinutes: 30,
  rateLimitCooldownSeconds: 120,
  streamIdleTimeoutMs: 60000,
  autoSyncPool: true,
  adoptProfileProvider: false,
  stickySession: true,
  sessionTurnLimit: 50,
  taskRoutes: { image: [], writing: [], translation: [], code: [], reasoning: [], general: [MODEL] },
  models: [],
}
process.env[KEY_ENV] = apiKey
const tmp = await mkdtemp(join(tmpdir(), 'bar-cache-'))
const store = RouterStore.create(join(tmp, 'state.json'))
await store.ready
const router = new Router(ctx, config, store)
const adapter = new BailianAutoAdapter(router)
const sync = await router.syncPool(true)
console.log('pool sync    :', sync.ok, sync.message, '| models:', store.state.pool.length)

const history = []
async function plugin(question) {
  history.push({ role: 'user', id: `u-${Date.now()}`, content: [{ type: 'text', text: question }], source: { kind: 'user' } })
  const messages = [
    { role: 'system', id: 's', content: [{ type: 'text', text: longText }], source: { kind: 'system' } },
    ...history,
  ]
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'bailian-auto', model: 'bailian-auto', messages, maxTokens: 80, sessionId: 'cache-probe' })) chunks.push(chunk)
  const answer = chunks.filter(c => c.type === 'text-delta').map(c => c.text).join('')
  history.push({ role: 'assistant', id: `a-${Date.now()}`, content: [{ type: 'text', text: answer }], source: { kind: 'assistant' } })
  const record = store.state.history.at(-1)
  console.log('plugin usage :', JSON.stringify({ model: record?.finalModel, source: record?.decisionSource, prompt: record?.inputTokens, cached: record?.cacheReadTokens, out: record?.outputTokens, decision: record?.decisionTokens }))
  return record
}

const plugin1 = await plugin('请用一句话说明这个项目的目标。')
const plugin2 = await plugin('请用两句话说明这个项目的主要风险。')

const directCached = [direct1.usage?.prompt_tokens_details?.cached_tokens ?? 0, direct2.usage?.prompt_tokens_details?.cached_tokens ?? 0]
const pluginCached = [plugin1?.cacheReadTokens ?? 0, plugin2?.cacheReadTokens ?? 0]
const models = [plugin1?.finalModel, plugin2?.finalModel]
console.log('\nSUMMARY:', JSON.stringify({ directCached, pluginCached, models }))

let failed = 0
const check = (ok, message) => {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`)
}
check(new Set(models).size === 1, '同会话两次调用保持同一模型')
if (directCached[1] > 0) {
  check(pluginCached[1] > 0, `直连命中 ${directCached[1]} tok,插件也命中 ${pluginCached[1]} tok(未破坏缓存)`)
} else {
  console.log('note  直连本次也未命中(隐式缓存非保证命中);仅对照,不据此判定插件')
}

await store.dispose()
await rm(tmp, { recursive: true, force: true })
process.exit(failed > 0 ? 1 : 0)
