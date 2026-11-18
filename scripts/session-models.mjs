/**
 * Read the CURRENT session log and report which model actually produced each
 * assistant message — evidence, not recollection.
 *
 * Session logs are `.jsonl.zstd`; Node's zlib can decompress in-process.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/**
 * Session logs are a *sequence of concatenated zstd frames* (one per append).
 * `zstdDecompressSync` only decodes the first frame, so split on the zstd magic
 * number and decode every frame, then join.
 */
function decompressAllFrames(buffer) {
  const MAGIC = Buffer.from([0x28, 0xB5, 0x2F, 0xFD])
  const starts = []
  let index = buffer.indexOf(MAGIC, 0)
  while (index !== -1) {
    starts.push(index)
    index = buffer.indexOf(MAGIC, index + 4)
  }
  if (starts.length === 0) return zstdDecompressSync(buffer).toString('utf8')
  const parts = []
  for (let position = 0; position < starts.length; position += 1) {
    const end = position + 1 < starts.length ? starts[position + 1] : buffer.length
    try {
      parts.push(zstdDecompressSync(buffer.subarray(starts[position], end)))
    } catch {
      // A magic number inside compressed payload: skip that candidate frame.
    }
  }
  return Buffer.concat(parts).toString('utf8')
}

const ROOT = 'C:\\Users\\30410\\.dsh\\sessions'
const WORKSPACE = '--D-SoftCache-DeepSeekHareness-~9ED8~8BA4~5DE5~4F5C~533A--'

function newestSession(dir) {
  const files = readdirSync(dir, { withFileTypes: true })
  let best
  for (const entry of files) {
    const path = join(dir, entry.name)
    const stat = statSync(path)
    if (entry.isDirectory()) {
      const inner = newestSession(path)
      if (inner && (!best || inner.mtime > best.mtime)) best = { ...inner, mtime: inner.mtime }
      if (inner && inner.mtime > (best?.mtime ?? 0)) best = inner
      continue
    }
    if (!/\.jsonl(\.zstd)?$/.test(entry.name)) continue
    if (!best || stat.mtimeMs > best.mtime) best = { path, mtime: stat.mtimeMs, size: stat.size }
  }
  return best
}

function readLog(path) {
  const raw = readFileSync(path)
  if (path.endsWith('.zstd')) return decompressAllFrames(raw)
  return raw.toString('utf8')
}

const session = newestSession(join(ROOT, WORKSPACE))
if (!session) {
  console.error('no session log found')
  process.exit(1)
}
console.log('session file :', session.path.replace(ROOT, '~/.dsh/sessions'))
console.log('modified     :', new Date(session.mtime).toLocaleString())
console.log('size         :', (session.size / 1024).toFixed(1), 'KB')

const lines = readLog(session.path).split('\n').filter(line => line.trim().length > 0)
console.log('log lines    :', lines.length)

/** Walk any JSON value and collect model sources. */
function collectModels(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) collectModels(item, out)
    return
  }
  if (value === null || typeof value !== 'object') return
  const source = value.source
  if (source && typeof source === 'object' && source.kind === 'model'
    && typeof source.provider === 'string' && typeof source.model === 'string') {
    out.push({ provider: source.provider, model: source.model })
  }
  for (const key of Object.keys(value)) {
    if (key === 'source') continue
    collectModels(value[key], out)
  }
}

const events = []
for (const line of lines) {
  let record
  try { record = JSON.parse(line) } catch { continue }
  const found = []
  collectModels(record, found)
  if (found.length === 0) continue
  const at = record.at ?? record.time ?? record.createdAt ?? record.timestamp
  events.push({ at: typeof at === 'number' ? at : (typeof at === 'string' ? Date.parse(at) : undefined), ...found[0] })
}

if (events.length === 0) {
  console.log('\n没有找到带 model source 的助手消息（会话可能尚未产生助手回复）')
  process.exit(0)
}

// Aggregate + preserve first-appearance order.
const order = []
const counts = new Map()
for (const event of events) {
  const key = `${event.provider} / ${event.model}`
  if (!counts.has(key)) {
    counts.set(key, { count: 0, first: event.at, last: event.at })
    order.push(key)
  }
  const entry = counts.get(key)
  entry.count += 1
  if (event.at !== undefined) {
    entry.first = entry.first ?? event.at
    entry.last = event.at
  }
}

const fmt = (ms) => (typeof ms === 'number' ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '—')
console.log('\n=== 本次会话实际使用的模型（按首次出现排序）===')
for (const key of order) {
  const entry = counts.get(key)
  console.log(`  ${key}`)
  console.log(`     助手消息 ${entry.count} 条 | 首次 ${fmt(entry.first)} | 最近 ${fmt(entry.last)}`)
}

console.log('\n=== 使用顺序（每次切换只显示一次）===')
let previous
for (const event of events) {
  const key = `${event.provider}/${event.model}`
  if (key !== previous) {
    console.log(`  ${fmt(event.at)}  →  ${key}`)
    previous = key
  }
}

// The plugin's route is provider `bailian-auto`; a `bailian` provider message is
// llm-pi-ai talking to the endpoint directly, NOT through this router.
const viaPlugin = events.filter(event => event.provider === 'bailian-auto' || event.model === 'bailian-auto')
console.log(`\n经本插件虚拟模型 bailian-auto 的助手消息: ${viaPlugin.length} 条`)
console.log(`直连 provider(不经插件)的助手消息: ${events.length - viaPlugin.length} 条`)
console.log(`总计助手消息: ${events.length} 条`)
if (viaPlugin.length === 0) {
  console.log('\n→ 本次会话没有走插件：会话默认模型是直连 provider,虚拟模型未被选中。')
}