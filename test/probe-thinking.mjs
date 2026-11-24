const BASE = 'https://ws-1pqxsqiw8lnjc2uf.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
import { readFileSync } from 'node:fs'
const CREDENTIALS = 'C:\\Users\\30410\\.dsh\\.credentials.yaml'
const KEY = (() => {
  const text = readFileSync(CREDENTIALS, 'utf8')
  const match = /^\s+ALIYUN_API_KEY:\s*(\S+)\s*$/m.exec(text)
  return match?.[1]?.replace(/^["']|["']$/g, '')
})()
if (!KEY) throw new Error('ALIYUN_API_KEY missing')
const prompt = '用 TypeScript 写一个带泛型和边界检查的 LRU 缓存类，并给出两个关键单测用例。'
const messages = [
  { role: 'system', content: '你是一个严谨的中文技术助理，回答要可直接使用。' },
  { role: 'user', content: prompt },
]
for (const [label, extra] of [
  ['absent', {}],
  ['enable_false', { enable_thinking: false }],
  ['enable_true', { enable_thinking: true }],
  ['enable_budget', { enable_thinking: true, thinking_budget: 1843 }],
  ['reasoning_high', { reasoning_effort: 'high' }],
]) {
  const started = Date.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-v4.1-flash-1017', messages, max_tokens: 4096, ...extra }),
  })
  const data = await res.json()
  const msg = data.choices?.[0]?.message ?? {}
  console.log(label, {
    status: res.status,
    finish: data.choices?.[0]?.finish_reason,
    content: (msg.content ?? '').length,
    reasoning: (msg.reasoning_content ?? '').length,
    usage: data.usage,
    ms: Date.now() - started,
  })
}
