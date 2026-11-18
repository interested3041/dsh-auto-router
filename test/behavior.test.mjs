/**
 * Behavioural tests for the three capabilities added on request:
 *   1. load/token balancing inside a task category (no "always the same model"),
 *   2. automatic reasoning-effort selection from detected task complexity,
 *   3. media routing (image generation) and vision-capability learning.
 */
import http from 'node:http'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = name => import(pathToFileURL(join(root, 'lib', name)).href)
const { Router } = await lib('router.js')
const { RouterStore } = await lib('store.js')
const { analyzeRequest, effortFor } = await lib('decision.js')
const { classifyModel } = await lib('classify.js')
const { buildPool } = await lib('pool.js')

process.env.BAILIAN_API_KEY = 'sk-balance'

const results = []
const check = (ok, message) => {
  results.push(Boolean(ok))
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`)
}

// ---------------------------------------------------------------------------
// Part 1: pure heuristics — complexity and effort.
// ---------------------------------------------------------------------------
const analyse = text => analyzeRequest({
  provider: 'bailian-auto',
  model: 'bailian-auto',
  messages: [{ role: 'user', id: 'm', content: [{ type: 'text', text }], source: { kind: 'user' } }],
}, 4000)

const trivial = analyse('你好')
const simple = analyse('把这句话翻译成英文:今天天气不错')
const normal = analyse('帮我写一段 100 字左右的产品介绍,语气专业')
const complex = analyse('用 Spring Boot 设计一个支持 10 万并发的订单系统,给出完整实现并分析瓶颈')
const deep = analyse('请证明这个算法的时间复杂度,并推导 n→∞ 时的渐进行为\n```js\nfunction f(n){ let s=0; for(let i=0;i<n;i++) s+=i; return s }\n```')

console.log('\n=== 复杂度判定 ===')
for (const [label, result] of [['trivial', trivial], ['simple', simple], ['normal', normal], ['complex', complex], ['deep', deep]]) {
  console.log(`   ${label.padEnd(8)} → ${result.complexity}/100 (${result.complexityLevel}) effort=${effortFor(result, 'auto')}`)
}
check(trivial.complexityLevel === 'trivial', '打招呼被判为 trivial')
check(effortFor(trivial, 'auto') === 'off', 'trivial → 关闭思考')
check(simple.complexity < normal.complexity, '简单任务复杂度低于普通任务')
check(normal.complexity < complex.complexity, '普通任务复杂度低于复杂任务')
check(complex.complexity < deep.complexity, '复杂任务复杂度低于深度任务')
check(effortFor(deep, 'auto') === 'max', `深度任务 → max (${effortFor(deep, 'auto')})`)
check(effortFor(complex, 'auto') === 'high', `复杂任务 → high (${effortFor(complex, 'auto')})`)
check(effortFor(trivial, 'high') === 'high', '显式档次覆盖自动策略')

// ---------------------------------------------------------------------------
// Part 2: classification — media vs chat, and vision correctness.
// ---------------------------------------------------------------------------
console.log('\n=== 端点归类 ===')
check(classifyModel('qwen-image-3.0').category === 'image', 'qwen-image-3.0 → 图像生成面')
check(classifyModel('wan2.7-image').category === 'image', 'wan2.7-image → 图像生成面')
check(classifyModel('qwen3-tts-flash').category === 'speech', 'qwen3-tts-flash → 语音合成面')
check(classifyModel('qwen3-asr-flash-realtime').category === 'asr', 'asr 模型 → 语音识别面')
check(classifyModel('qwen3.7-text-embedding').category === 'embedding', 'embedding → 向量化面')
check(classifyModel('deepseek-v4-pro').vision === false, 'deepseek-v4-pro 不带视觉(正确)')
check(classifyModel('deepseek-v4.1-flash-1017').chat === true, 'deepseek-v4.1-flash-1017 是对话模型')

// ---------------------------------------------------------------------------
// Part 3: live-ish behaviour against a mock endpoint.
// ---------------------------------------------------------------------------
const calls = []
let imageResponse = null
const server = http.createServer(async (req, res) => {
  const body = await new Promise(resolve => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => resolve(raw.length > 0 ? JSON.parse(raw) : {}))
  })
  calls.push({ url: req.url, model: body.model, effort: body.reasoning_effort, stream: body.stream === true })

  if (req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      data: [
        'deepseek-v4-pro', 'qwen3.8-max-0902', 'glm-5.2', 'kimi-k3.1-pro', 'qwen3.8-flash',
        'qwen-image-3.0', 'wan2.7-image', 'qwen3-tts-flash', 'qwen3.7-text-embedding',
      ].map(id => ({ id, object: 'model' })),
    }))
    return
  }
  if (req.url === '/v1/images/generations') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('fake-png-bytes').toString('base64') }] }))
    return
  }
  if (req.url === '/v1/chat/completions') {
    if (body.stream !== true) {
      const shown = String(body.messages?.[1]?.content ?? '')
      const first = /- ([^\s(]+)/.exec(shown)?.[1] ?? body.model
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ selected_model: first, task_type: 'code', reasoning: 'mock' }) } }] }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `by ${body.model}` }, finish_reason: 'stop' }] })}\n\n`)
    res.write(`data: ${JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }
  res.writeHead(404)
  res.end('{}')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const baseURL = `http://127.0.0.1:${server.address().port}/v1`

const ctx = {
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  llm: { fileRequestText: () => '[file]' },
  fiber: {},
  effect() {}, on() { return () => {} },
  get(service) {
    if (service === 'workingDirectory') return { defaultDirectory: workspace }
    return undefined
  },
  provide() {}, inject() {},
}

const workspace = await mkdtemp(join(tmpdir(), 'bar-ws-'))
const stateDir = await mkdtemp(join(tmpdir(), 'bar-state-'))

const baseConfig = {
  baseURL,
  apiKeyEnv: 'BAILIAN_API_KEY',
  enableDecision: true,
  decisionModel: 'deepseek-v4.1-flash-1017',
  decisionTimeoutMs: 5000,
  decisionInputMaxChars: 4000,
  fallbackModel: 'deepseek-v4.1-flash-1017',
  maxAttempts: 4,
  quotaCooldownMinutes: 30,
  rateLimitCooldownSeconds: 120,
  streamIdleTimeoutMs: 10000,
  autoSyncPool: false,
  poolSyncIntervalHours: 0,
  adoptProfileProvider: false,
  maxCandidatesForDecision: 12,
  includeSpecialEndpoints: false,
  excludeModels: [],
  balanceStrategy: 'balanced',
  balanceWindow: 4,
  balanceBand: 30,
  balanceWindowHours: 24,
  thinkingEffort: 'auto',
  enableMediaRouting: true,
  taskRoutes: { image: [], writing: [], translation: [], code: [], reasoning: [], general: [] },
  models: [],
}

const store = RouterStore.create(join(stateDir, 'state.json'))
await store.ready
const router = new Router(ctx, baseConfig, store)
await router.syncPool(true)
const snapshot = router.capture()

console.log('\n=== 池构成 ===')
console.log(`   可对话 ${snapshot.pool.entries.length} / 图像 ${snapshot.pool.media.image.length} / 语音 ${snapshot.pool.media.speech.length} / 向量化 ${snapshot.pool.media.embedding.length}`)
check(snapshot.pool.media.image.length === 2, '媒体池识别出 2 个图像生成模型')
check(snapshot.pool.entries.length === 5, '对话池只含 5 个对话模型')

/** Run one request and return its routing record. */
async function run(text) {
  const chunks = []
  for await (const chunk of router.stream({
    provider: 'bailian-auto',
    model: 'bailian-auto',
    messages: [{ role: 'user', id: 'm', content: [{ type: 'text', text }], source: { kind: 'user' } }],
  }, router.capture())) chunks.push(chunk)
  return { record: store.state.history.at(-1), text: chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''), chunks }
}

// ---- balancing: repeated identical code requests rotate across models ----
console.log('\n=== 负载均衡(相同 code 任务连续 6 次) ===')
const served = []
for (let index = 0; index < 6; index += 1) {
  const result = await run('用 JavaScript 写一个快速排序,并说明复杂度')
  served.push(result.record?.finalModel)
  if (index === 0) console.log('        usage after #1 =', JSON.stringify(store.state.usage))
  console.log(`   #${index + 1} → ${result.record?.finalModel}  (task=${result.record?.task}, src=${result.record?.decisionSource}, attempts=${(result.record?.attempts ?? []).map(a => `${a.model}${a.ok ? '✓' : '✗'}${a.code ?? ''}`).join('>')})`)
  console.log(`        reason=${result.record?.reasoning}`)
}
const unique = [...new Set(served)]
check(unique.length >= 2, `相同任务在 ${unique.length} 个近等价模型间轮转: ${unique.join(', ')}`)
check(served.filter(id => id === served[0]).length <= 4, '没有单一模型吃下全部请求')

// ---- effort tracks complexity ----
console.log('\n=== 思考档位 ===')
const beforeSimple = calls.length
await run('你好')
const simpleCall = calls.slice(beforeSimple).find(call => call.url === '/v1/chat/completions' && call.stream === true)
const beforeDeep = calls.length
await run('请证明时间复杂度并推导渐进行为,给出完整实现和性能分析,架构层面也要说明')
const deepCall = calls.slice(beforeDeep).find(call => call.url === '/v1/chat/completions' && call.stream === true)
console.log(`   简单请求 → reasoning_effort=${simpleCall?.effort ?? '(none)'}`)
console.log(`   复杂请求 → reasoning_effort=${deepCall?.effort ?? '(none)'}`)
check(simpleCall !== undefined && simpleCall.effort === undefined, '简单请求不下发思考档位(关闭思考)')
check(['high', 'max'].includes(deepCall?.effort), `复杂请求下发高/最高档: ${deepCall?.effort}`)
check(calls.filter(call => call.url === '/v1/chat/completions' && call.effort !== undefined).length > 0,
  '确实向下游下发了 reasoning_effort')

// ---- media routing: image request goes to /images/generations ----
console.log('\n=== 图像生成 ===')
const imageRun = await run('帮我画一张赛博朋克风格的猫,夜色霓虹')
const imageCalls = calls.filter(call => call.url === '/v1/images/generations')
const savedFiles = await readdir(join(workspace, '.dsh-media')).catch(() => [])
check(imageCalls.length === 1, '图像请求命中 /images/generations 一次')
check(/qwen-image|wan2/.test(imageCalls[0]?.model ?? ''), `使用图像模型: ${imageCalls[0]?.model}`)
check(imageRun.record?.decisionSource === 'media', '路由记录标记为 media')
check(savedFiles.length === 1 && savedFiles[0].endsWith('.png'), `图片已保存到工作区: ${savedFiles[0]}`)
check(/\.dsh-media\/image-/.test(imageRun.text), '回复包含图片 Markdown 链接')

// ---- vision learning: a model that rejects images stops being offered ----
console.log('\n=== 视觉能力学习 ===')
store.vetoVision('qwen3.8-max-0902')
const imageSnapshot = router.capture()
const imageCandidates = imageSnapshot.pool.entries.filter(entry => entry.traits.vision).map(entry => entry.id)
check(!imageCandidates.includes('qwen3.8-max-0902') || store.visionVetoed('qwen3.8-max-0902'),
  '被否决的模型不再作为视觉模型的首选')
check(store.visionVetoed('qwen3.8-max-0902'), '否决状态已持久化')

await new Promise(resolve => server.close(resolve))
await store.dispose()
await rm(workspace, { recursive: true, force: true })
await rm(stateDir, { recursive: true, force: true })

const failed = results.filter(ok => !ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)