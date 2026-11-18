/**
 * Plugin Config schema (schemastery) plus per-request resolution.
 *
 * Every field is `.volatile()` so the settings panel can edit it in place
 * through the config editor without reloading the plugin; `resolveOptions()`
 * re-validates values on each capture because volatile updates bypass schema
 * validation.
 */
import z from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/schemastery'
import {
  API_KEY_REFS, BUILTIN_CATALOG, DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_DECISION_MODEL,
  DEFAULT_FALLBACK_MODEL, DEFAULT_TASK_ROUTES, PROVIDER, TASK_TYPES, VIRTUAL_MODEL,
} from './catalog.js'
import type { CatalogModel, TaskType } from './catalog.js'

/** One user-declared execution-model pool entry. */
export interface ConfigModel {
  id: string
  name?: string
  vision?: boolean
  contextWindow?: number
  maxTokens?: number
  tags?: TaskType[]
}

/** Live plugin configuration; every value is read with `.get()`. */
export interface Config {
  /** Bailian compatible-mode endpoint base. */
  baseURL: Volatile<string>
  /** Credential reference for the Bailian API key (falls back to the process environment). */
  apiKeyEnv: Volatile<string>
  /** Whether the decision model runs before routing (false = pure heuristic routing). */
  enableDecision: Volatile<boolean>
  /** Model that analyzes the request and picks the execution model. */
  decisionModel: Volatile<string>
  /** Decision-call timeout; on expiry the fallback model is used. */
  decisionTimeoutMs: Volatile<number>
  /** Characters of recent user input sent to the decision model. */
  decisionInputMaxChars: Volatile<number>
  /** Execution model used when the decision model fails or times out. */
  fallbackModel: Volatile<string>
  /** Maximum execution models tried per request (including the first choice). */
  maxAttempts: Volatile<number>
  /** Cooldown after a hard quota exhaustion (QUOTA / 402 / allocated quota). */
  quotaCooldownMinutes: Volatile<number>
  /** Cooldown after rate limiting or transport-class failures (429/5xx/network). */
  rateLimitCooldownSeconds: Volatile<number>
  /** Idle timeout of one execution stream before it is treated as a failure. */
  streamIdleTimeoutMs: Volatile<number>
  /** Fetch the Bailian `/models` listing on startup and on the sync interval. */
  autoSyncPool: Volatile<boolean>
  /** Hours between automatic pool syncs; 0 disables periodic sync. */
  poolSyncIntervalHours: Volatile<number>
  /** Reuse an Aliyun connection already configured in this profile while `baseURL` keeps its default. */
  adoptProfileProvider: Volatile<boolean>
  /** How many ranked candidates the decision model sees (the rest stays as fallback). */
  maxCandidatesForDecision: Volatile<number>
  /** Let agent/research-only endpoints (deep-research, deep-search-planning) into the pool. */
  includeSpecialEndpoints: Volatile<boolean>
  /** Ids or `prefix*` patterns removed from the execution pool. */
  excludeModels: Volatile<string[]>
  /** `balanced` spreads load across equally suitable models; `quality` always takes the best. */
  balanceStrategy: Volatile<'balanced' | 'quality'>
  /** How many near-equal candidates participate in the rotation. */
  balanceWindow: Volatile<number>
  /** Optional score-distance guard for the rotation set (0 = rotate the top `balanceWindow` only). */
  balanceBand: Volatile<number>
  /** Usage older than this many hours stops counting toward balancing. */
  balanceWindowHours: Volatile<number>
  /** Reasoning effort policy: `auto` scales with detected task complexity. */
  thinkingEffort: Volatile<'auto' | 'off' | 'low' | 'medium' | 'high' | 'max'>
  /** Route media intents (image generation) to the endpoint that serves them. */
  enableMediaRouting: Volatile<boolean>
  /** Keep one model for the whole session instead of rotating on every turn. */
  stickySession: Volatile<boolean>
  /** Turns after which a session may be re-selected (keeps load balance fair). */
  sessionTurnLimit: Volatile<number>
  /** Per-task ordered candidate model ids. */
  taskRoutes: Volatile<Record<TaskType, string[]>>
  /** User execution-pool entries; merged over the built-in catalog. */
  models: Volatile<ConfigModel[]>
}

const taskRoutesSchema = z.object(Object.fromEntries(
  TASK_TYPES.map(task => [task, z.array(z.string()).default([...DEFAULT_TASK_ROUTES[task]])]),
))

const modelSchema = z.object({
  id: z.string().required(),
  name: z.string(),
  vision: z.boolean().default(false),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  tags: z.array(z.union(TASK_TYPES.map(task => z.const(task)))).default([]),
})

/** Loader-validated plugin configuration schema. */
export const Config = z.object({
  baseURL: z.string().default(DEFAULT_BASE_URL).volatile(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
  enableDecision: z.boolean().default(true).volatile(),
  decisionModel: z.string().default(DEFAULT_DECISION_MODEL).volatile(),
  decisionTimeoutMs: z.number().step(1).min(1000).max(120000).default(12000).volatile(),
  decisionInputMaxChars: z.number().step(1).min(200).max(32000).default(6000).volatile(),
  fallbackModel: z.string().default(DEFAULT_FALLBACK_MODEL).volatile(),
  maxAttempts: z.number().step(1).min(1).max(10).default(4).volatile(),
  quotaCooldownMinutes: z.number().step(1).min(1).max(10080).default(30).volatile(),
  rateLimitCooldownSeconds: z.number().step(1).min(5).max(3600).default(120).volatile(),
  streamIdleTimeoutMs: z.number().step(1).min(5000).max(600000).default(180000).volatile(),
  autoSyncPool: z.boolean().default(true).volatile(),
  poolSyncIntervalHours: z.number().min(0).max(168).default(24).volatile(),
  adoptProfileProvider: z.boolean().default(true).volatile(),
  maxCandidatesForDecision: z.number().step(1).min(1).max(60).default(14).volatile(),
  includeSpecialEndpoints: z.boolean().default(false).volatile(),
  excludeModels: z.array(z.string()).default([]).volatile(),
  balanceStrategy: z.union(['balanced', 'quality'] as const).default('balanced').volatile(),
  balanceWindow: z.number().step(1).min(1).max(20).default(6).volatile(),
  balanceBand: z.number().min(0).max(60).default(0).volatile(),
  balanceWindowHours: z.number().step(1).min(1).max(720).default(24).volatile(),
  thinkingEffort: z.union(['auto', 'off', 'low', 'medium', 'high', 'max'] as const).default('auto').volatile(),
  enableMediaRouting: z.boolean().default(true).volatile(),
  stickySession: z.boolean().default(true).volatile(),
  sessionTurnLimit: z.number().step(1).min(1).max(200).default(8).volatile(),
  taskRoutes: taskRoutesSchema.volatile(),
  models: z.array(modelSchema).default([]).volatile(),
})

/** Detached, validated settings snapshot captured per request/operation. */
export interface RouterOptions {
  readonly baseURL: string
  readonly apiKeyEnv: string
  readonly enableDecision: boolean
  readonly decisionModel: string
  readonly decisionTimeoutMs: number
  readonly decisionInputMaxChars: number
  readonly fallbackModel: string
  readonly maxAttempts: number
  readonly quotaCooldownMs: number
  readonly rateLimitCooldownMs: number
  readonly streamIdleTimeoutMs: number
  readonly autoSyncPool: boolean
  readonly poolSyncIntervalHours: number
  readonly adoptProfileProvider: boolean
  readonly maxCandidatesForDecision: number
  readonly includeSpecialEndpoints: boolean
  readonly excludeModels: readonly string[]
  readonly balanceStrategy: 'balanced' | 'quality'
  readonly balanceWindow: number
  readonly balanceBand: number
  readonly balanceWindowHours: number
  readonly thinkingEffort: 'auto' | 'off' | 'low' | 'medium' | 'high' | 'max'
  readonly enableMediaRouting: boolean
  readonly stickySession: boolean
  readonly sessionTurnLimit: number
  readonly taskRoutes: Record<TaskType, readonly string[]>
  readonly models: readonly ConfigModel[]
  /** Credential references tried in order; the first configured one wins. */
  readonly apiKeyRefs: readonly string[]
}

/** Unwrap volatile references (tolerates plain values from programmatic use). */
function plain<T>(value: Volatile<T> | T): T {
  return typeof (value as Volatile<T>)?.get === 'function' ? (value as Volatile<T>).get() : value as T
}

function positiveInt(value: number, fallback: number, min = 1): number {
  return Number.isSafeInteger(value) && value >= min ? value : fallback
}

/**
 * Read and re-validate one configuration generation. Volatile updates reach
 * this resolver without schema validation, so bounds are re-judged here.
 * @param config - live plugin configuration.
 * @returns a detached settings snapshot.
 */
export function resolveOptions(config: Config): RouterOptions {
  const baseURL = String(plain(config.baseURL) || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const parsed = new URL(baseURL)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${PROVIDER}: baseURL must be an HTTP(S) endpoint`)
  }
  const taskRoutesRaw = plain(config.taskRoutes) ?? ({} as Record<TaskType, string[]>)
  const taskRoutes = {} as Record<TaskType, readonly string[]>
  for (const task of TASK_TYPES) {
    const list = taskRoutesRaw[task]
    taskRoutes[task] = Array.isArray(list)
      ? [...new Set(list.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map(id => id.trim()))]
      : [...DEFAULT_TASK_ROUTES[task]]
    if (taskRoutes[task].length === 0) taskRoutes[task] = [...DEFAULT_TASK_ROUTES[task]]
  }
  const modelsRaw = plain(config.models) ?? []
  const models: ConfigModel[] = []
  const seen = new Set<string>()
  for (const entry of Array.isArray(modelsRaw) ? modelsRaw : []) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
    if (id.length === 0 || id === VIRTUAL_MODEL || seen.has(id)) continue
    seen.add(id)
    models.push({
      id,
      ...(typeof entry.name === 'string' && entry.name.trim() ? { name: entry.name.trim() } : {}),
      vision: entry.vision === true || (entry.vision === undefined ? undefined : false) as boolean | undefined,
      ...(positiveInt(Number(entry.contextWindow), 0) > 0 ? { contextWindow: Number(entry.contextWindow) } : {}),
      ...(positiveInt(Number(entry.maxTokens), 0) > 0 ? { maxTokens: Number(entry.maxTokens) } : {}),
      ...(Array.isArray(entry.tags) ? { tags: entry.tags.filter((tag): tag is TaskType => (TASK_TYPES as readonly string[]).includes(tag)) } : {}),
    })
  }
  const apiKeyEnv = String(plain(config.apiKeyEnv) || DEFAULT_API_KEY_ENV).trim()
  return {
    baseURL,
    apiKeyEnv,
    apiKeyRefs: [...new Set([apiKeyEnv, ...API_KEY_REFS])],
    enableDecision: plain(config.enableDecision) !== false,
    decisionModel: String(plain(config.decisionModel) || DEFAULT_DECISION_MODEL).trim(),
    decisionTimeoutMs: positiveInt(Number(plain(config.decisionTimeoutMs)), 12000, 1000),
    decisionInputMaxChars: positiveInt(Number(plain(config.decisionInputMaxChars)), 6000, 200),
    fallbackModel: String(plain(config.fallbackModel) || DEFAULT_FALLBACK_MODEL).trim(),
    maxAttempts: positiveInt(Number(plain(config.maxAttempts)), 4, 1),
    quotaCooldownMs: positiveInt(Number(plain(config.quotaCooldownMinutes)), 30) * 60_000,
    rateLimitCooldownMs: positiveInt(Number(plain(config.rateLimitCooldownSeconds)), 120, 5) * 1000,
    streamIdleTimeoutMs: positiveInt(Number(plain(config.streamIdleTimeoutMs)), 180000, 5000),
    autoSyncPool: plain(config.autoSyncPool) !== false,
    poolSyncIntervalHours: Math.max(0, Math.min(168, Number(plain(config.poolSyncIntervalHours)) || 0)),
    adoptProfileProvider: plain(config.adoptProfileProvider) !== false,
    maxCandidatesForDecision: positiveInt(Number(plain(config.maxCandidatesForDecision)), 14, 1),
    includeSpecialEndpoints: plain(config.includeSpecialEndpoints) === true,
    excludeModels: (Array.isArray(plain(config.excludeModels)) ? plain(config.excludeModels) : [])
      .filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0)
      .map(pattern => pattern.trim()),
    balanceStrategy: plain(config.balanceStrategy) === 'quality' ? 'quality' : 'balanced',
    balanceWindow: positiveInt(Number(plain(config.balanceWindow)), 6, 1),
    balanceBand: Math.max(0, Math.min(60, Number(plain(config.balanceBand)) || 0)),
    balanceWindowHours: positiveInt(Number(plain(config.balanceWindowHours)), 24, 1),
    thinkingEffort: (['auto', 'off', 'low', 'medium', 'high', 'max'] as const)
      .find(value => value === plain(config.thinkingEffort)) ?? 'auto',
    enableMediaRouting: plain(config.enableMediaRouting) !== false,
    stickySession: plain(config.stickySession) !== false,
    sessionTurnLimit: positiveInt(Number(plain(config.sessionTurnLimit)), 8, 1),
    taskRoutes,
    models,
  }
}

/**
 * Merge built-in catalog and user pool entries; user entries win per id.
 * @param options - resolved settings snapshot.
 * @returns catalog entries keyed by model id.
 */
export function mergedCatalog(options: RouterOptions): Map<string, CatalogModel> {
  const merged = new Map<string, CatalogModel>()
  for (const entry of BUILTIN_CATALOG) merged.set(entry.id, entry)
  for (const entry of options.models) {
    merged.set(entry.id, {
      id: entry.id,
      name: entry.name ?? entry.id,
      vision: entry.vision ?? false,
      ...(entry.contextWindow === undefined ? {} : { contextWindow: entry.contextWindow }),
      ...(entry.tags === undefined ? {} : { tags: entry.tags }),
    })
  }
  return merged
}
