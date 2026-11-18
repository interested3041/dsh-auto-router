/**
 * Boundary parsers for the `bailianRouter` RPC surface, hand-written so the
 * bundle keeps ZERO runtime dependencies (a cloned plugin directory has no
 * `node_modules`, so any third-party import at load time fails activation).
 *
 * Each parser is tolerant: it normalizes whatever crosses the wire into the
 * documented shape and fills defaults, so a version skew between the Host half
 * and the Client half degrades a field instead of breaking the panel.
 *
 * The Typert contract only requires `{ mode: 'strict', typeSymbol, create() }`
 * where `create()` returns an object with `parse(value)`.
 */
import type {
  ConfigPatch, ConfigView, HistoryView, PoolModelView, QuotaView, RefreshResult, RouterStateView,
} from './service.js'

/** Minimal runtime-schema capability carried by a strict codec. */
export interface Parser<T> { parse(value: unknown): T }

/** One strict codec as the Typert registry accepts it. */
export interface Codec<T> {
  readonly mode: 'strict'
  readonly typeSymbol: string
  readonly create: () => Parser<T>
}

const PACKAGE = 'dsh-bailian-auto-router'

/**
 * Build one strict codec from a normalizer.
 * @param name - type symbol suffix shown in diagnostics.
 * @param normalize - tolerant value normalizer.
 */
export function codec<T>(name: string, normalize: (value: unknown) => T): Codec<T> {
  return {
    mode: 'strict',
    typeSymbol: `${PACKAGE}#${name}`,
    create: () => ({ parse: normalize }),
  }
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`bailianRouter: ${subject} must be an object`)
  }
  return value as Record<string, unknown>
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function list<T>(value: unknown, map: (entry: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return []
  const out: T[] = []
  for (const entry of value) {
    const mapped = map(entry)
    if (mapped !== undefined) out.push(mapped)
  }
  return out
}

/** Normalize one pool model. */
function poolModel(value: unknown): PoolModelView | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = value as Record<string, unknown>
  const id = str(entry.id)
  if (id.length === 0) return undefined
  const source = str(entry.source)
  return {
    id,
    name: str(entry.name, id),
    vision: bool(entry.vision),
    contextWindow: numOrNull(entry.contextWindow),
    source: source === 'user' || source === 'sync' ? source : 'builtin',
  }
}

/** Normalize one quota row. */
function quota(value: unknown): QuotaView | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = value as Record<string, unknown>
  const model = str(entry.model)
  if (model.length === 0) return undefined
  return {
    model,
    available: bool(entry.available, true),
    cooldownUntil: numOrNull(entry.cooldownUntil),
    cooldownRemainingMs: num(entry.cooldownRemainingMs),
    fails: num(entry.fails),
    calls: num(entry.calls),
    lastFailCode: strOrNull(entry.lastFailCode),
    lastFailAt: numOrNull(entry.lastFailAt),
    lastOkAt: numOrNull(entry.lastOkAt),
  }
}

/** Normalize one history record. */
function history(value: unknown): HistoryView | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = value as Record<string, unknown>
  const source = str(entry.decisionSource)
  const modality = str(entry.modality)
  return {
    at: num(entry.at),
    task: str(entry.task, 'general'),
    modality: modality === 'image' ? 'image' : 'text',
    decisionSource: source === 'model' || source === 'fallback' || source === 'media' || source === 'notice'
      ? source : 'heuristic',
    decisionModel: strOrNull(entry.decisionModel),
    reasoning: strOrNull(entry.reasoning),
    attempts: list(entry.attempts, (attempt) => {
      if (typeof attempt !== 'object' || attempt === null) return undefined
      const row = attempt as Record<string, unknown>
      const model = str(row.model)
      if (model.length === 0) return undefined
      return { model, ok: bool(row.ok), code: strOrNull(row.code) }
    }),
    finalModel: strOrNull(entry.finalModel),
    ok: bool(entry.ok),
    decisionTokens: num(entry.decisionTokens),
  }
}

/** Normalize one user-declared pool entry. */
function configModel(value: unknown): ConfigView['models'][number] | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = value as Record<string, unknown>
  const id = str(entry.id)
  if (id.length === 0) return undefined
  return {
    id,
    ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
    ...(typeof entry.vision === 'boolean' ? { vision: entry.vision } : {}),
    ...(typeof entry.contextWindow === 'number' ? { contextWindow: entry.contextWindow } : {}),
    ...(typeof entry.maxTokens === 'number' ? { maxTokens: entry.maxTokens } : {}),
    ...(Array.isArray(entry.tags) ? { tags: entry.tags.filter((tag): tag is never => typeof tag === 'string') as never } : {}),
  } as ConfigView['models'][number]
}

/** Normalize the configuration view. */
function config(value: unknown): ConfigView {
  const entry = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const routes: Record<string, string[]> = {}
  if (typeof entry.taskRoutes === 'object' && entry.taskRoutes !== null) {
    for (const [task, ids] of Object.entries(entry.taskRoutes as Record<string, unknown>)) {
      routes[task] = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
    }
  }
  return {
    baseURL: str(entry.baseURL),
    apiKeyEnv: str(entry.apiKeyEnv, 'DASHSCOPE_API_KEY'),
    apiKeyConfigured: bool(entry.apiKeyConfigured),
    enableDecision: bool(entry.enableDecision, true),
    decisionModel: str(entry.decisionModel),
    decisionModelConfigured: str(entry.decisionModelConfigured, str(entry.decisionModel)),
    decisionTimeoutMs: num(entry.decisionTimeoutMs, 12000),
    decisionInputMaxChars: num(entry.decisionInputMaxChars, 6000),
    fallbackModel: str(entry.fallbackModel),
    fallbackModelConfigured: str(entry.fallbackModelConfigured, str(entry.fallbackModel)),
    maxAttempts: num(entry.maxAttempts, 4),
    quotaCooldownMinutes: num(entry.quotaCooldownMinutes, 30),
    rateLimitCooldownSeconds: num(entry.rateLimitCooldownSeconds, 120),
    streamIdleTimeoutMs: num(entry.streamIdleTimeoutMs, 180000),
    autoSyncPool: bool(entry.autoSyncPool, true),
    balanceStrategy: str(entry.balanceStrategy) === 'quality' ? 'quality' : 'balanced',
    balanceWindow: num(entry.balanceWindow, 6),
    balanceBand: num(entry.balanceBand, 0),
    balanceWindowHours: num(entry.balanceWindowHours, 24),
    thinkingEffort: (['auto', 'off', 'low', 'medium', 'high', 'max'] as const)
      .find(value => value === entry.thinkingEffort) ?? 'auto',
    enableMediaRouting: bool(entry.enableMediaRouting, true),
    stickySession: bool(entry.stickySession, true),
    sessionTurnLimit: num(entry.sessionTurnLimit, 8),
    poolSyncIntervalHours: num(entry.poolSyncIntervalHours, 24),
    maxCandidatesForDecision: num(entry.maxCandidatesForDecision, 14),
    includeSpecialEndpoints: bool(entry.includeSpecialEndpoints),
    excludeModels: Array.isArray(entry.excludeModels)
      ? entry.excludeModels.filter((item): item is string => typeof item === 'string') : [],
    taskRoutes: routes,
    models: list(entry.models, configModel),
  }
}

/** Normalize the complete state view. */
export function normalizeState(value: unknown): RouterStateView {
  const entry = object(value, 'state')
  const pool = typeof entry.pool === 'object' && entry.pool !== null
    ? entry.pool as Record<string, unknown> : {}
  const models = list(pool.models, poolModel)
  return {
    provider: str(entry.provider, 'bailian-auto'),
    model: str(entry.model, 'bailian-auto'),
    modelName: str(entry.modelName, '百炼智能路由'),
    config: config(entry.config),
    pool: {
      models,
      count: num(pool.count, models.length),
      total: num(pool.total, models.length),
      visionCount: num(pool.visionCount, models.filter(entry => entry.vision).length),
      lastSyncAt: numOrNull(pool.lastSyncAt),
      lastSyncError: strOrNull(pool.lastSyncError),
      media: {
        image: list(pool.media && (pool.media as any).image, id => str(id)),
        speech: list(pool.media && (pool.media as any).speech, id => str(id)),
        asr: list(pool.media && (pool.media as any).asr, id => str(id)),
        realtime: list(pool.media && (pool.media as any).realtime, id => str(id)),
        embedding: list(pool.media && (pool.media as any).embedding, id => str(id)),
        rerank: list(pool.media && (pool.media as any).rerank, id => str(id)),
        video: list(pool.media && (pool.media as any).video, id => str(id)),
        music: list(pool.media && (pool.media as any).music, id => str(id)),
      },
      excluded: list(pool.excluded, (entry) => {
        if (typeof entry !== 'object' || entry === null) return undefined
        const row = entry as Record<string, unknown>
        const id = str(row.id)
        if (id.length === 0) return undefined
        return { id, reason: str(row.reason) }
      }),
    },
    quota: list(entry.quota, quota),
    history: list(entry.history, history),
    derived: typeof entry.derived === 'object' && entry.derived !== null
      ? {
        decisionModel: bool((entry.derived as Record<string, unknown>).decisionModel),
        fallbackModel: bool((entry.derived as Record<string, unknown>).fallbackModel),
      }
      : null,
    adopted: typeof entry.adopted === 'object' && entry.adopted !== null
      ? {
        entryId: str((entry.adopted as Record<string, unknown>).entryId),
        providerId: str((entry.adopted as Record<string, unknown>).providerId),
        baseURL: str((entry.adopted as Record<string, unknown>).baseURL),
        apiKeyEnv: strOrNull((entry.adopted as Record<string, unknown>).apiKeyEnv),
      }
      : null,
    candidates: list(entry.candidates, (candidate) => {
      if (typeof candidate !== 'object' || candidate === null) return undefined
      const row = candidate as Record<string, unknown>
      const baseURL = str(row.baseURL)
      if (baseURL.length === 0) return undefined
      return {
        entryId: str(row.entryId),
        providerId: str(row.providerId),
        baseURL,
        apiKeyEnv: strOrNull(row.apiKeyEnv),
        current: bool(row.current),
      }
    }),
  }
}

/** Normalize the pool-refresh result. */
export function normalizeRefresh(value: unknown): RefreshResult {
  const entry = object(value, 'refresh result')
  return {
    ok: bool(entry.ok),
    message: str(entry.message),
    state: normalizeState(entry.state),
  }
}

/** Validate one configuration patch (the service re-validates every field). */
export function normalizePatch(value: unknown): ConfigPatch {
  return object(value, 'config patch') as ConfigPatch
}

/** Accept an optional model id argument. */
export function normalizeModelId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Codecs consumed by the Typert manifest. */
export const CODECS = {
  state: codec('RouterState', normalizeState),
  refresh: codec('RefreshResult', normalizeRefresh),
  patch: codec('ConfigPatch', normalizePatch),
  modelId: codec('ModelId', normalizeModelId),
  string: codec('String', (value) => {
    if (typeof value !== 'string') throw new Error('bailianRouter: expected a string')
    return value
  }),
  any: codec('JsonValue', value => value),
}