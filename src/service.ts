/**
 * The `bailianRouter` RPC service consumed by the Web panel through the
 * Typert gateway: state reads, configuration edits (persisted through the
 * harness config editor), pool sync, and quota resets.
 */
import type { TaskType } from './catalog.js'
import { TASK_TYPES } from './catalog.js'
import type { ConfigModel } from './config.js'
import { invalidateConnectionCache, listConnections } from './connection.js'
import type { HostContext } from './context.js'
import { apiKeyConfigured } from './router.js'
import type { Router } from './router.js'
import type { RouterStore } from './store.js'

/** One pool model as the panel displays it. */
export interface PoolModelView {
  id: string
  name: string
  vision: boolean
  contextWindow: number | null
  source: 'user' | 'builtin' | 'sync'
}

/** One model's local quota status. */
export interface QuotaView {
  model: string
  available: boolean
  cooldownUntil: number | null
  cooldownRemainingMs: number
  fails: number
  calls: number
  lastFailCode: string | null
  lastFailAt: number | null
  lastOkAt: number | null
}

/** One routing decision record. */
export interface HistoryView {
  at: number
  task: string
  modality: 'text' | 'image'
  decisionSource: 'model' | 'heuristic' | 'fallback' | 'media' | 'notice'
  decisionModel: string | null
  reasoning: string | null
  attempts: { model: string; ok: boolean; code: string | null }[]
  finalModel: string | null
  ok: boolean
  decisionTokens: number
}

/** Editable configuration fields (plain values). */
export interface ConfigView {
  baseURL: string
  apiKeyEnv: string
  apiKeyConfigured: boolean
  enableDecision: boolean
  /** Effective decision model (auto-replaced when the configured one is absent). */
  decisionModel: string
  /** The value stored in the profile, which may not exist in this account. */
  decisionModelConfigured: string
  decisionTimeoutMs: number
  decisionInputMaxChars: number
  fallbackModel: string
  fallbackModelConfigured: string
  maxAttempts: number
  quotaCooldownMinutes: number
  rateLimitCooldownSeconds: number
  streamIdleTimeoutMs: number
  autoSyncPool: boolean
  poolSyncIntervalHours: number
  balanceStrategy: 'balanced' | 'quality'
  balanceWindow: number
  balanceBand: number
  balanceWindowHours: number
  thinkingEffort: 'auto' | 'off' | 'low' | 'medium' | 'high' | 'max'
  enableMediaRouting: boolean
  stickySession: boolean
  sessionTurnLimit: number
  maxCandidatesForDecision: number
  includeSpecialEndpoints: boolean
  excludeModels: string[]
  taskRoutes: Record<string, string[]>
  models: ConfigModel[]
}

/** Complete state snapshot returned by every RPC method. */
export interface RouterStateView {
  provider: string
  model: string
  modelName: string
  config: ConfigView
  pool: {
    models: PoolModelView[]
    /** Chat-capable models the router may pick. */
    count: number
    /** Every id the endpoint listed. */
    total: number
    /** Vision-capable models in the pool. */
    visionCount: number
    lastSyncAt: number | null
    lastSyncError: string | null
    /** Ids kept out of routing because they are not chat models. */
    excluded: { id: string; reason: string }[]
    /** Media endpoints the router can call directly, by surface. */
    media: { image: string[]; speech: string[]; asr: string[]; realtime: string[]; embedding: string[]; rerank: string[]; video: string[]; music: string[] }
  }
  quota: QuotaView[]
  history: HistoryView[]
  /** Connection reused from an existing profile provider, when adopted. */
  adopted: { entryId: string; providerId: string; baseURL: string; apiKeyEnv: string | null } | null
  /** Aliyun-compatible connections found in this profile. */
  candidates: { entryId: string; providerId: string; baseURL: string; apiKeyEnv: string | null; current: boolean }[]
  /** Configured models this account does not serve, and the substitutes in use. */
  derived: { decisionModel: boolean; fallbackModel: boolean } | null
}

/** Result of the pool-sync operation. */
export interface RefreshResult {
  ok: boolean
  message: string
  state: RouterStateView
}

/** Fields the panel may edit, with light type guards before persistence. */
const STRING_FIELDS = ['baseURL', 'apiKeyEnv', 'decisionModel', 'fallbackModel'] as const
const BOOL_FIELDS = ['enableDecision', 'autoSyncPool', 'includeSpecialEndpoints', 'enableMediaRouting'] as const
const NUMBER_FIELDS = [
  'decisionTimeoutMs', 'decisionInputMaxChars', 'maxAttempts', 'quotaCooldownMinutes',
  'rateLimitCooldownSeconds', 'streamIdleTimeoutMs', 'poolSyncIntervalHours', 'maxCandidatesForDecision',
  'balanceWindow', 'balanceBand', 'balanceWindowHours',
] as const

export interface ConfigPatch {
  baseURL?: string
  apiKeyEnv?: string
  enableDecision?: boolean
  decisionModel?: string
  decisionTimeoutMs?: number
  decisionInputMaxChars?: number
  fallbackModel?: string
  maxAttempts?: number
  quotaCooldownMinutes?: number
  rateLimitCooldownSeconds?: number
  streamIdleTimeoutMs?: number
  autoSyncPool?: boolean
  poolSyncIntervalHours?: number
  maxCandidatesForDecision?: number
  includeSpecialEndpoints?: boolean
  excludeModels?: string[]
  taskRoutes?: Partial<Record<TaskType, string[]>>
  models?: ConfigModel[]
}

/** Sanitize one incoming patch; throws on unusable values. */
function sanitizePatch(patch: unknown): Record<string, unknown> {
  if (typeof patch !== 'object' || patch === null) throw new Error('patch must be an object')
  const input = patch as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const field of STRING_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} must be a non-empty string`)
    out[field] = value.trim()
  }
  for (const field of BOOL_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
    out[field] = value
  }
  for (const field of NUMBER_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number`)
    out[field] = Math.round(value)
  }
  if (input.balanceStrategy !== undefined) {
    if (input.balanceStrategy !== 'balanced' && input.balanceStrategy !== 'quality') {
      throw new Error('balanceStrategy must be "balanced" or "quality"')
    }
    out.balanceStrategy = input.balanceStrategy
  }
  if (input.thinkingEffort !== undefined) {
    const allowed = ['auto', 'off', 'low', 'medium', 'high', 'max'] as const
    if (!(allowed as readonly unknown[]).includes(input.thinkingEffort)) {
      throw new Error(`thinkingEffort must be one of ${allowed.join(', ')}`)
    }
    out.thinkingEffort = input.thinkingEffort
  }
  if (input.excludeModels !== undefined) {
    if (!Array.isArray(input.excludeModels) || input.excludeModels.some(item => typeof item !== 'string')) {
      throw new Error('excludeModels must be an array of strings')
    }
    out.excludeModels = input.excludeModels.map(item => item.trim()).filter(item => item.length > 0)
  }
  if (input.taskRoutes !== undefined) {
    const routes = input.taskRoutes
    if (typeof routes !== 'object' || routes === null) throw new Error('taskRoutes must be an object')
    const cleaned: Record<string, string[]> = {}
    for (const task of TASK_TYPES) {
      const list = (routes as Record<string, unknown>)[task]
      if (list === undefined) continue
      if (!Array.isArray(list) || list.some(id => typeof id !== 'string')) throw new Error(`taskRoutes.${task} must be an array of model ids`)
      cleaned[task] = [...new Set(list.map(id => (id as string).trim()).filter(id => id.length > 0))]
    }
    out.taskRoutes = cleaned
  }
  if (input.models !== undefined) {
    const models = input.models
    if (!Array.isArray(models)) throw new Error('models must be an array')
    out.models = models.map((entry) => {
      if (typeof entry !== 'object' || entry === null || typeof (entry as ConfigModel).id !== 'string') {
        throw new Error('each models entry needs a string id')
      }
      const model = entry as ConfigModel
      return {
        id: model.id.trim(),
        ...(typeof model.name === 'string' ? { name: model.name } : {}),
        ...(typeof model.vision === 'boolean' ? { vision: model.vision } : {}),
        ...(typeof model.contextWindow === 'number' ? { contextWindow: model.contextWindow } : {}),
        ...(typeof model.maxTokens === 'number' ? { maxTokens: model.maxTokens } : {}),
        ...(Array.isArray(model.tags) ? { tags: model.tags.filter(tag => (TASK_TYPES as readonly string[]).includes(tag)) } : {}),
      }
    })
  }
  if (Object.keys(out).length === 0) throw new Error('patch carries no editable field')
  return out
}

/** Build the panel-facing state snapshot. */
async function stateView(ctx: HostContext, router: Router, store: RouterStore): Promise<RouterStateView> {
  await store.ready
  const snapshot = router.capture()
  const options = snapshot.options
  const configuredDecision = String(router.configured().decisionModel ?? options.decisionModel)
  const configuredFallback = String(router.configured().fallbackModel ?? options.fallbackModel)
  const now = Date.now()
  const quota: QuotaView[] = snapshot.entries.map((entry) => {
    const state = store.state.quota[entry.id]
    const cooldownUntil = state?.cooldownUntil !== undefined && state.cooldownUntil > now ? state.cooldownUntil : null
    return {
      model: entry.id,
      available: cooldownUntil === null,
      cooldownUntil,
      cooldownRemainingMs: cooldownUntil === null ? 0 : cooldownUntil - now,
      fails: state?.fails ?? 0,
      calls: state?.calls ?? 0,
      lastFailCode: state?.lastFailCode ?? null,
      lastFailAt: state?.lastFailAt ?? null,
      lastOkAt: state?.lastOkAt ?? null,
    }
  })
  // Models with recorded quota state but no pool entry stay visible.
  for (const [model, state] of Object.entries(store.state.quota)) {
    if (quota.some(entry => entry.model === model)) continue
    const cooldownUntil = state.cooldownUntil !== undefined && state.cooldownUntil > now ? state.cooldownUntil : null
    quota.push({
      model,
      available: cooldownUntil === null,
      cooldownUntil,
      cooldownRemainingMs: cooldownUntil === null ? 0 : cooldownUntil - now,
      fails: state.fails,
      calls: state.calls,
      lastFailCode: state.lastFailCode ?? null,
      lastFailAt: state.lastFailAt ?? null,
      lastOkAt: state.lastOkAt ?? null,
    })
  }
  const history: HistoryView[] = [...store.state.history].reverse().map(record => ({
    at: record.at,
    task: record.task,
    modality: record.modality,
    decisionSource: record.decisionSource,
    decisionModel: record.decisionModel ?? null,
    reasoning: record.reasoning ?? null,
    attempts: record.attempts.map(attempt => ({ model: attempt.model, ok: attempt.ok, code: attempt.code ?? null })),
    finalModel: record.finalModel ?? null,
    ok: record.ok,
    decisionTokens: record.decisionTokens ?? 0,
  }))
  const taskRoutes: Record<string, string[]> = {}
  for (const task of TASK_TYPES) taskRoutes[task] = [...(options.taskRoutes[task] ?? [])]
  const candidates = listConnections(ctx).map(candidate => ({
    entryId: candidate.entryId,
    providerId: candidate.providerId,
    baseURL: candidate.baseURL,
    apiKeyEnv: candidate.apiKeyEnv ?? null,
    current: candidate.baseURL === options.baseURL,
  }))
  return {
    provider: 'bailian-auto',
    model: 'bailian-auto',
    modelName: '百炼智能路由',
    config: {
      baseURL: options.baseURL,
      apiKeyEnv: options.apiKeyEnv,
      apiKeyConfigured: await apiKeyConfigured(ctx, options.apiKeyRefs),
      enableDecision: options.enableDecision,
      decisionModel: options.decisionModel,
      decisionModelConfigured: configuredDecision,
      decisionTimeoutMs: options.decisionTimeoutMs,
      decisionInputMaxChars: options.decisionInputMaxChars,
      fallbackModel: options.fallbackModel,
      fallbackModelConfigured: configuredFallback,
      maxAttempts: options.maxAttempts,
      quotaCooldownMinutes: Math.round(options.quotaCooldownMs / 60_000),
      rateLimitCooldownSeconds: Math.round(options.rateLimitCooldownMs / 1000),
      streamIdleTimeoutMs: options.streamIdleTimeoutMs,
      autoSyncPool: options.autoSyncPool,
      poolSyncIntervalHours: options.poolSyncIntervalHours,
      balanceStrategy: options.balanceStrategy,
      balanceWindow: options.balanceWindow,
      balanceBand: options.balanceBand,
      balanceWindowHours: options.balanceWindowHours,
      thinkingEffort: options.thinkingEffort,
      enableMediaRouting: options.enableMediaRouting,
      stickySession: options.stickySession,
      sessionTurnLimit: options.sessionTurnLimit,
      maxCandidatesForDecision: options.maxCandidatesForDecision,
      includeSpecialEndpoints: options.includeSpecialEndpoints,
      excludeModels: [...options.excludeModels],
      taskRoutes,
      models: options.models.map(model => ({ ...model })),
    },
    pool: {
      models: snapshot.entries.map(entry => ({
        id: entry.id,
        name: entry.name,
        vision: entry.vision,
        contextWindow: entry.contextWindow ?? null,
        source: entry.source,
      })),
      count: snapshot.entries.length,
      total: snapshot.pool.total,
      visionCount: snapshot.entries.filter(entry => entry.vision).length,
      lastSyncAt: store.state.lastSyncAt ?? null,
      lastSyncError: store.state.lastSyncError ?? null,
      excluded: snapshot.pool.excluded.map(entry => ({ id: entry.id, reason: entry.reason })),
      media: {
        image: snapshot.pool.media.image.map(entry => entry.id),
        speech: snapshot.pool.media.speech.map(entry => entry.id),
        asr: snapshot.pool.media.asr.map(entry => entry.id),
        realtime: snapshot.pool.media.realtime.map(entry => entry.id),
        embedding: snapshot.pool.media.embedding.map(entry => entry.id),
        rerank: snapshot.pool.media.rerank.map(entry => entry.id),
        video: snapshot.pool.media.video.map(entry => entry.id),
        music: snapshot.pool.media.music.map(entry => entry.id),
      },
    },
    quota,
    history,
    adopted: snapshot.adopted === undefined ? null : {
      entryId: snapshot.adopted.entryId,
      providerId: snapshot.adopted.providerId,
      baseURL: snapshot.adopted.baseURL,
      apiKeyEnv: snapshot.adopted.apiKeyEnv ?? null,
    },
    candidates,
    derived: snapshot.derived ?? null,
  }
}

/** The service object provided as `ctx.provide('bailianRouter', ...)`. */
export interface BailianRouterService {
  getState(): Promise<RouterStateView>
  updateConfig(patch: ConfigPatch): Promise<RouterStateView>
  /** Point the router at another Aliyun connection found in this profile. */
  switchConnection(entryId: string, providerId: string): Promise<RefreshResult>
  refreshPool(): Promise<RefreshResult>
  resetQuota(model?: string): Promise<RouterStateView>
  clearHistory(): Promise<RouterStateView>
}

/** Create the RPC service over the router and store. */
export function createService(ctx: HostContext, router: Router, store: RouterStore): BailianRouterService {
  const editConfig = async (patch: ConfigPatch): Promise<RouterStateView> => {
    const sanitized = sanitizePatch(patch)
    const editor = ctx.get('configEditor')
    const entry = ctx.fiber.entry
    if (editor === undefined || entry === undefined) {
      throw new Error('当前部署不支持在线保存配置(configEditor 不可用);请直接编辑 profile 的 cordis.patch.yml 中本插件的 config')
    }
    await editor.edit(entry, (current) => {
      const next: Record<string, unknown> = { ...current, ...sanitized }
      // Merge taskRoutes partially so one task edit keeps the others.
      if (sanitized.taskRoutes !== undefined) {
        const base = typeof current.taskRoutes === 'object' && current.taskRoutes !== null
          ? current.taskRoutes as Record<string, unknown> : {}
        next.taskRoutes = { ...base, ...(sanitized.taskRoutes as Record<string, unknown>) }
      }
      return next
    })
    return stateView(ctx, router, store)
  }
  return {
    async getState() {
      return stateView(ctx, router, store)
    },
    async updateConfig(patch) {
      return editConfig(patch)
    },
    async refreshPool() {
      const result = await router.syncPool(true)
      return { ok: result.ok, message: result.message, state: await stateView(ctx, router, store) }
    },
    async switchConnection(entryId: string, providerId: string) {
      const target = listConnections(ctx).find(candidate => candidate.entryId === entryId && candidate.providerId === providerId)
      if (target === undefined) throw new Error(`未找到连接 ${entryId} → ${providerId}(可能已被移除)`)
      await editConfig({
        baseURL: target.baseURL,
        ...(target.apiKeyEnv === undefined ? {} : { apiKeyEnv: target.apiKeyEnv }),
      })
      invalidateConnectionCache()
      const result = await router.syncPool(true)
      return { ok: result.ok, message: result.message, state: await stateView(ctx, router, store) }
    },
    async resetQuota(model?: string) {
      await store.ready
      store.resetCooldown(typeof model === 'string' && model.length > 0 ? model : undefined)
      return stateView(ctx, router, store)
    },
    async clearHistory() {
      await store.ready
      store.clearHistory()
      return stateView(ctx, router, store)
    },
  }
}
