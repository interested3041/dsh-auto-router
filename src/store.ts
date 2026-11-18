/**
 * Persistent router state: the synced model pool, per-model quota/cooldown
 * status, and the recent routing history shown by the status panel.
 *
 * The file lives at `~/.dsh/bailian-auto-router/state.json` (honoring
 * `$DSH_HOME`), is written atomically (tmp + rename) with a small debounce,
 * and tolerates partial corruption by falling back to a fresh state.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** One synced-from-endpoint pool entry. */
export interface PoolModel {
  id: string
  name?: string
  vision?: boolean
  contextWindow?: number
  /** Where the entry came from. */
  source: 'sync' | 'user'
  syncedAt?: number
}

/** Per-model quota / cooldown status. */
export interface QuotaState {
  /** Epoch ms until which the model is skipped by the router; absent = available. */
  cooldownUntil?: number
  /** Failure code that started the current cooldown. */
  lastFailCode?: string
  lastFailAt?: number
  lastOkAt?: number
  /** Consecutive failures (reset on success). */
  fails: number
  /** Lifetime routed-call counters since installation. */
  calls: number
}

/** One routing decision record for the status panel. */
export interface RouteRecord {
  at: number
  task: string
  modality: 'text' | 'image'
  /** 'model' = decision model chose; 'heuristic' = rules chose; 'fallback' = decision failed. */
  decisionSource: 'model' | 'heuristic' | 'fallback' | 'media'
  decisionModel?: string
  reasoning?: string
  /** Models tried in order. */
  attempts: { model: string; ok: boolean; code?: string }[]
  finalModel?: string
  ok: boolean
  /** Tokens spent on the decision call for this request. */
  decisionTokens?: number
}

/** Recent consumption of one model inside one task category. */
export interface UsageEntry {
  /** Routed calls in the balancing window. */
  calls: number
  /** Input+output tokens consumed in the balancing window. */
  tokens: number
  /** Epoch ms of the last routed call. */
  lastAt: number
}

/** Complete persisted state. */
export interface RouterState {
  version: 1
  /** Endpoint + credential identity the pool and quota belong to. */
  scope?: string
  pool: PoolModel[]
  lastSyncAt?: number
  lastSyncError?: string
  quota: Record<string, QuotaState>
  history: RouteRecord[]
  /** Token usage per task category per model, for load balancing and rotation. */
  usage: Record<string, Record<string, UsageEntry>>
  /** Models the provider rejected for image input (epoch ms). */
  visionVeto: Record<string, number>
  /** Models that accepted image input (epoch ms). */
  visionOk: Record<string, number>
  /** Models that rejected a reasoning-effort parameter (epoch ms). */
  effortUnsupported: Record<string, number>
}

const STATE_VERSION = 1 as const
const MAX_HISTORY = 50

function freshState(): RouterState {
  return {
    version: STATE_VERSION,
    pool: [],
    quota: {},
    history: [],
    usage: {},
    visionVeto: {},
    visionOk: {},
    effortUnsupported: {},
  }
}

function sanitize(raw: unknown): RouterState {
  const state = freshState()
  if (typeof raw !== 'object' || raw === null) return state
  const data = raw as Partial<RouterState>
  if (Array.isArray(data.pool)) {
    state.pool = data.pool.filter((entry): entry is PoolModel =>
      typeof entry?.id === 'string' && entry.id.length > 0)
  }
  if (typeof data.scope === 'string') state.scope = data.scope
  if (typeof data.lastSyncAt === 'number') state.lastSyncAt = data.lastSyncAt
  if (typeof data.lastSyncError === 'string') state.lastSyncError = data.lastSyncError
  if (typeof data.quota === 'object' && data.quota !== null) {
    for (const [id, entry] of Object.entries(data.quota)) {
      if (typeof entry !== 'object' || entry === null) continue
      state.quota[id] = {
        fails: Number.isFinite(entry.fails) ? entry.fails : 0,
        calls: Number.isFinite(entry.calls) ? entry.calls : 0,
        ...(typeof entry.cooldownUntil === 'number' ? { cooldownUntil: entry.cooldownUntil } : {}),
        ...(typeof entry.lastFailCode === 'string' ? { lastFailCode: entry.lastFailCode } : {}),
        ...(typeof entry.lastFailAt === 'number' ? { lastFailAt: entry.lastFailAt } : {}),
        ...(typeof entry.lastOkAt === 'number' ? { lastOkAt: entry.lastOkAt } : {}),
      }
    }
  }
  if (typeof data.usage === 'object' && data.usage !== null) {
    for (const [task, models] of Object.entries(data.usage)) {
      if (typeof models !== 'object' || models === null) continue
      const row: Record<string, UsageEntry> = {}
      for (const [model, entry] of Object.entries(models)) {
        if (typeof entry !== 'object' || entry === null) continue
        row[model] = {
          calls: Number.isFinite(entry.calls) ? entry.calls : 0,
          tokens: Number.isFinite(entry.tokens) ? entry.tokens : 0,
          lastAt: Number.isFinite(entry.lastAt) ? entry.lastAt : 0,
        }
      }
      state.usage[task] = row
    }
  }
  for (const key of ['visionVeto', 'visionOk', 'effortUnsupported'] as const) {
    const raw = data[key]
    if (typeof raw !== 'object' || raw === null) continue
    for (const [id, at] of Object.entries(raw)) {
      if (typeof at === 'number' && Number.isFinite(at)) state[key][id] = at
    }
  }
  if (Array.isArray(data.history)) {
    state.history = data.history.filter((entry): entry is RouteRecord =>
      typeof entry?.at === 'number' && Array.isArray(entry.attempts)).slice(-MAX_HISTORY)
  }
  return state
}

/** Live state handle over one JSON file. */
export class RouterStore {
  /** Current state; mutate through the methods below, then `scheduleWrite()`. */
  state: RouterState = freshState()
  /** Settles once the initial file load completed (successfully or not). */
  readonly ready: Promise<void>
  private writeTimer: ReturnType<typeof setTimeout> | undefined
  private writing: Promise<void> = Promise.resolve()
  private disposed = false

  private constructor(readonly file: string) {
    this.ready = this.load()
  }

  /** Create the handle and start loading in the background (see `ready`). */
  static create(file: string): RouterStore {
    return new RouterStore(file)
  }

  /** Load (or create) the state file. Corrupt content falls back to fresh state. */
  static async open(file: string): Promise<RouterStore> {
    const store = new RouterStore(file)
    await store.ready
    return store
  }

  private async load(): Promise<void> {
    try {
      this.state = sanitize(JSON.parse(await readFile(this.file, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.warn(`[dsh-bailian-auto-router] state file unreadable, starting fresh: ${String((error as Error)?.message ?? error)}`)
      }
    }
  }

  /** Quota entry of one model, created on demand. */
  quotaOf(model: string): QuotaState {
    return this.state.quota[model] ??= { fails: 0, calls: 0 }
  }

  /** Whether the model is in cooldown at the given time. */
  inCooldown(model: string, now = Date.now()): boolean {
    const until = this.state.quota[model]?.cooldownUntil
    return typeof until === 'number' && until > now
  }

  /** Put one model into cooldown after a classified failure. */
  markFailure(model: string, code: string, cooldownMs: number, now = Date.now()): void {
    const quota = this.quotaOf(model)
    quota.fails += 1
    quota.lastFailCode = code
    quota.lastFailAt = now
    quota.cooldownUntil = now + cooldownMs
    this.scheduleWrite()
  }

  /** Record a successful routed call. */
  markSuccess(model: string, now = Date.now()): void {
    const quota = this.quotaOf(model)
    quota.fails = 0
    quota.calls += 1
    quota.lastOkAt = now
    delete quota.cooldownUntil
    delete quota.lastFailCode
    this.scheduleWrite()
  }

  /** Clear cooldown of one model, or of every model when omitted. */
  resetCooldown(model?: string): void {
    if (model === undefined) {
      for (const entry of Object.values(this.state.quota)) {
        delete entry.cooldownUntil
        delete entry.lastFailCode
        entry.fails = 0
      }
    } else {
      const entry = this.state.quota[model]
      if (entry) {
        delete entry.cooldownUntil
        delete entry.lastFailCode
        entry.fails = 0
      }
    }
    this.scheduleWrite()
  }

  /** Append one routing record, capped to the most recent 50. */
  recordRoute(record: RouteRecord): void {
    this.state.history.push(record)
    if (this.state.history.length > MAX_HISTORY) {
      this.state.history.splice(0, this.state.history.length - MAX_HISTORY)
    }
    this.scheduleWrite()
  }

  clearHistory(): void {
    this.state.history = []
    this.scheduleWrite()
  }

  /**
   * Bind the stored pool/quota to one connection identity. Switching accounts
   * (a different endpoint or credential reference) invalidates the previous
   * account's model list and cooldowns, which would otherwise suppress or
   * resurrect models that no longer exist there.
   * @param scope - `baseURL|credentialRef` of the connection in use.
   * @returns whether the scope changed (callers then resync).
   */
  bindScope(scope: string): boolean {
    if (this.state.scope === scope) return false
    const first = this.state.scope === undefined
    this.state.scope = scope
    if (!first) {
      this.state.pool = []
      this.state.quota = {}
      this.state.usage = {}
      this.state.visionVeto = {}
      this.state.visionOk = {}
      this.state.effortUnsupported = {}
      delete this.state.lastSyncAt
      delete this.state.lastSyncError
    }
    this.scheduleWrite()
    return !first
  }

  /** Replace the synced pool listing. */
  setPool(models: PoolModel[], now = Date.now()): void {
    this.state.pool = models
    this.state.lastSyncAt = now
    delete this.state.lastSyncError
    this.scheduleWrite()
  }

  setSyncError(message: string): void {
    this.state.lastSyncError = message.slice(0, 500)
    this.scheduleWrite()
  }

  /** Record one routed call and its token use for balancing. */
  recordUsage(task: string, model: string, tokens: number, now = Date.now()): void {
    const row = this.state.usage[task] ??= {}
    const entry = row[model] ??= { calls: 0, tokens: 0, lastAt: 0 }
    entry.calls += 1
    entry.tokens += Math.max(0, Math.round(tokens))
    entry.lastAt = now
    this.scheduleWrite()
  }

  /**
   * Decayed usage of one model inside one task, used to rotate load.
   * Entries older than the window contribute nothing, so the balancing state
   * follows "recent" consumption rather than a lifetime total.
   */
  recentUsage(task: string, model: string, windowMs: number, now = Date.now()): UsageEntry {
    const entry = this.state.usage[task]?.[model]
    if (entry === undefined) return { calls: 0, tokens: 0, lastAt: 0 }
    if (now - entry.lastAt > windowMs) return { calls: 0, tokens: 0, lastAt: entry.lastAt }
    return entry
  }

  /** Remember that a model rejected image input. */
  vetoVision(model: string, now = Date.now()): void {
    this.state.visionVeto[model] = now
    delete this.state.visionOk[model]
    this.scheduleWrite()
  }

  /** Remember that a model accepted image input. */
  confirmVision(model: string, now = Date.now()): void {
    this.state.visionOk[model] = now
    delete this.state.visionVeto[model]
    this.scheduleWrite()
  }

  /** Whether the provider has proven this model cannot read images. */
  visionVetoed(model: string): boolean {
    return this.state.visionVeto[model] !== undefined
  }

  /** Whether the provider has proven this model reads images. */
  visionConfirmed(model: string): boolean {
    return this.state.visionOk[model] !== undefined
  }

  /** Remember that a model rejects the reasoning-effort parameter. */
  markEffortUnsupported(model: string, now = Date.now()): void {
    this.state.effortUnsupported[model] = now
    this.scheduleWrite()
  }

  /** Whether a reasoning-effort parameter must be omitted for this model. */
  effortUnsupported(model: string): boolean {
    return this.state.effortUnsupported[model] !== undefined
  }

  /** Debounced atomic persistence. */
  scheduleWrite(): void {
    if (this.disposed || this.writeTimer !== undefined) return
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined
      this.writing = this.flush()
    }, 400)
    this.writeTimer.unref?.()
  }

  /** Write immediately and wait for completion. */
  async flush(): Promise<void> {
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer)
      this.writeTimer = undefined
    }
    const tmp = join(dirname(this.file), `.state-${process.pid}-${Date.now()}.tmp`)
    try {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8')
      await rename(tmp, this.file)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') {
        console.warn(`[dsh-bailian-auto-router] state write failed: ${String((error as Error)?.message ?? error)}`)
      }
    }
  }

  /** Stop timers and persist one final time. */
  async dispose(): Promise<void> {
    this.disposed = true
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer)
      this.writeTimer = undefined
    }
    await this.writing.catch(() => {})
    await this.flush()
  }
}
