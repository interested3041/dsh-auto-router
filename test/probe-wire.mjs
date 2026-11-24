import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = name => import(pathToFileURL(join(root, 'lib', name)).href)
const { Router } = await lib('router.js')
const { RouterStore } = await lib('store.js')
const { BailianAutoAdapter } = await lib('adapter.js')
const CREDENTIALS = 'C:\\Users\\30410\\.dsh\\.credentials.yaml'
const BASE_URL = 'https://ws-1pqxsqiw8lnjc2uf.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
const KEY_ENV = 'ALIYUN_API_KEY'
const apiKey = /^\s+ALIYUN_API_KEY:\s*(\S+)\s*$/m.exec(readFileSync(CREDENTIALS, 'utf8'))?.[1]?.replace(/^["']|["']$/g, '')

const ctx = {
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  llm: { fileRequestText: ref => `[file ${ref?.attachmentId ?? '?'}]` },
  fiber: {}, effect() {}, on() { return () => {} }, get() { return undefined }, provide() {}, inject() {},
}
const config = {
  baseURL: BASE_URL, apiKeyEnv: KEY_ENV, enableDecision: true,
  decisionModel: 'deepseek-v4.1-flash-1017', decisionTimeoutMs: 20000,
  decisionInputMaxChars: 4000, fallbackModel: 'deepseek-v4.1-flash-1017',
  maxAttempts: 4, quotaCooldownMinutes: 30, rateLimitCooldownSeconds: 120,
  streamIdleTimeoutMs: 60000, autoSyncPool: true, poolSyncIntervalHours: 24,
  adoptProfileProvider: false, taskRoutes: {
    image: ['qwen3.8-max-0902', 'qwen3-vl-plus'],
    writing: ['glm-5.2', 'qwen3.8-max-0902'],
    translation: ['qwen-mt-plus', 'qwen3.8-max-0902'],
    code: ['deepseek-v4-pro', 'qwen3.8-max-0902'],
    reasoning: ['deepseek-v4-pro', 'qwen3.8-max-0902'],
    general: ['deepseek-v4.1-flash-1017', 'qwen3.8-flash'],
  }, models: [],
}
process.env[KEY_ENV] = apiKey
const store = RouterStore.create(join(await mkdtemp(join(tmpdir(), 'bar-probe-')), 'state.json'))
await store.ready
const router = new Router(ctx, config, store)
const adapter = new BailianAutoAdapter(router)
await router.syncPool(true)

const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (init?.body) {
    try {
      const body = JSON.parse(String(init.body))
      console.log('WIRE', JSON.stringify({
        model: body.model, stream: body.stream, max_tokens: body.max_tokens,
        enable_thinking: body.enable_thinking, thinking_budget: body.thinking_budget,
        reasoning_effort: body.reasoning_effort,
      }))
    } catch {}
  }
  return realFetch(url, init)
}

const messages = [
  { role: 'system', id: 's', content: [{ type: 'text', text: '你是一个严谨的中文技术助理，回答要可直接使用。' }], source: { kind: 'system' } },
  { role: 'user', id: 'u', content: [{ type: 'text', text: '用 TypeScript 写一个带泛型和边界检查的 LRU 缓存类，并给出两个关键单测用例。' }], source: { kind: 'user' } },
]
const chunks = []
for await (const chunk of adapter.stream({ provider: 'bailian-auto', model: 'bailian-auto', messages, maxTokens: 4096 })) chunks.push(chunk)
const answer = chunks.filter(c => c.type === 'text-delta').map(c => c.text).join('')
console.log('RESULT', JSON.stringify({
  record: store.state.history.at(-1),
  answerLength: answer.length,
  finish: chunks.at(-1)?.reason,
}))
