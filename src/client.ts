/**
 * Web client half of dsh-bailian-auto-router.
 *
 * Compiled to a plain script that registers into the browser module loader:
 * - a configuration + quota-status panel on the Plugin Manager bundle page
 *   (`plugins.bundle.config`, keyed by the package name), and
 * - a compact status card at the foot of Settings → Models
 *   (`settings.models.footer`).
 *
 * Talks to the host through the `bailianRouter` Typert RPC namespace, mounted
 * with a hand-written client contribution (the pattern proven by installed
 * community bundles). No Harness Client package is imported; controls and
 * styles are self-contained and use `--dsw-alias-*` theme tokens.
 *
 * This file must stay a non-module (no top-level import/export) so tsc emits a
 * plain script the module loader can evaluate.
 */
{
  type BarRemoteApi = {
    getState(): Promise<any>
    updateConfig(patch: Record<string, unknown>): Promise<any>
    refreshPool(): Promise<any>
    resetQuota(model?: string): Promise<any>
    clearHistory(): Promise<any>
    switchConnection(entryId: string, providerId: string): Promise<any>
  }

  const g = globalThis as any
  const PACKAGE = 'dsh-bailian-auto-router'
  const NS = 'bailianRouter'

  /** Unwrap one RPC result envelope ({ok,value|error} or a plain value). */
  const unwrap = (result: any): any => {
    if (result && typeof result === 'object' && 'ok' in result) {
      if (result.ok === true) return result.value
      throw new Error(String(result.error?.message ?? result.error ?? 'RPC failed'))
    }
    return result
  }

  g.__ModuleLoader__.load({
    id: PACKAGE,
    factory(require: (id: string) => any) {
      const React = require('react')
      const h = React.createElement
      // Typed façades over the untyped module-table React.
      const useState = React.useState as <T>(init: T) => [T, (v: T | ((prev: T) => T)) => void]
      const useEffect = React.useEffect as (fn: () => unknown, deps?: readonly unknown[]) => void
      const useCallback = React.useCallback as <T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]) => T
      const useMemo = React.useMemo as <T>(fn: () => T, deps: readonly unknown[]) => T
      const useRef = React.useRef as <T>(init: T) => { current: T }

      // ---- i18n (panel-local dictionary; zh default, en fallback) ------------
      const zh = String(g.navigator?.language ?? 'zh').toLowerCase().startsWith('zh')
      const T = (zho: string, eng: string): string => (zh ? zho : eng)

      // ---- client-side Typert contribution ----------------------------------
      // Parsers are intentionally tolerant: the Host half may be newer or older
      // than this bundle, so a missing field degrades instead of breaking the
      // panel. Only the outer shape is enforced.
      const schema = (parse: (value: any) => any) => ({ parse })
      const codec = (name: string, parse: (value: any) => any) => ({
        mode: 'strict', typeSymbol: `${PACKAGE}#${name}`, schema: schema(parse), create: () => schema(parse),
      })
      const asObject = (value: any): any => {
        if (typeof value !== 'object' || value === null) throw new Error('expected an object')
        return value
      }
      const anyValue = (value: any): any => value
      const contribution = {
        package: PACKAGE,
        descriptors: [
          { method: 'getState', parameters: [], result: codec('RouterState', asObject) },
          {
            method: 'updateConfig',
            parameters: [{ name: 'patch', wire: 'patch', source: 'json', codec: codec('ConfigPatch', asObject) }],
            result: codec('RouterState', asObject),
          },
          { method: 'refreshPool', parameters: [], result: codec('RefreshResult', asObject) },
          {
            method: 'resetQuota',
            parameters: [{
              name: 'model', wire: 'model', source: 'json',
              codec: codec('ModelId', anyValue), acceptsUndefined: true,
            }],
            result: codec('RouterState', asObject),
          },
          { method: 'clearHistory', parameters: [], result: codec('RouterState', asObject) },
          {
            method: 'switchConnection',
            parameters: [
              { name: 'entryId', wire: 'entryId', source: 'json', codec: codec('String', anyValue) },
              { name: 'providerId', wire: 'providerId', source: 'json', codec: codec('String', anyValue) },
            ],
            result: codec('RefreshResult', asObject),
          },
        ],
      }

      // ---- styles -------------------------------------------------------------
      const CSS = `
.bar-root { display:flex; flex-direction:column; gap:16px; color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; }
.bar-card { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
.bar-card > h4 { margin:0; font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); }
.bar-muted { color:var(--dsw-alias-label-secondary); }
.bar-row { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; }
.bar-field { display:flex; flex-direction:column; gap:4px; min-width:180px; flex:1 1 180px; }
.bar-field > label { font-size:12px; color:var(--dsw-alias-label-secondary); }
.bar-input, .bar-textarea { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; padding:5px 8px; font-size:12px; font-family:inherit; box-sizing:border-box; width:100%; }
.bar-input:focus, .bar-textarea:focus { outline:1px solid var(--dsw-alias-brand-primary); }
.bar-textarea { min-height:64px; resize:vertical; font-family:ui-monospace, Consolas, monospace; }
.bar-btn { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border:1px solid var(--dsw-alias-border-l2); border-radius:6px; padding:5px 12px; font-size:12px; cursor:pointer; user-select:none; }
.bar-btn:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }
.bar-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.bar-btn-primary:hover { color:#fff; opacity:.9; }
.bar-badge { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); }
.bar-badge-ok { color:var(--dsw-alias-state-success-primary); border-color:var(--dsw-alias-state-success-primary); }
.bar-badge-warn { color:var(--dsw-alias-state-warn-primary); border-color:var(--dsw-alias-state-warn-primary); }
.bar-badge-err { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
.bar-table { width:100%; border-collapse:collapse; font-size:12px; }
.bar-table th, .bar-table td { text-align:left; padding:4px 8px; border-bottom:1px solid var(--dsw-alias-border-l1); vertical-align:top; }
.bar-table th { color:var(--dsw-alias-label-secondary); font-weight:500; }
.bar-mono { font-family:ui-monospace, Consolas, monospace; }
.bar-error { color:var(--dsw-alias-state-error-primary); font-size:12px; white-space:pre-wrap; }
.bar-ok { color:var(--dsw-alias-state-success-primary); font-size:12px; }
.bar-history-item { border:1px solid var(--dsw-alias-border-l1); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:4px; background:var(--dsw-alias-bg-layer-2); }
.bar-check { display:flex; align-items:center; gap:6px; }
.bar-footer-card { display:flex; align-items:center; gap:10px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); padding:10px 14px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.bar-dot { width:8px; height:8px; border-radius:50%; display:inline-block; flex:none; }
`

      // ---- small helpers -------------------------------------------------------
      const fmtTime = (ms: number | null): string => (ms ? new Date(ms).toLocaleString() : '—')
      /** Panel label for a routing record's source; 'notice' means no model ran. */
      const decisionSourceLabel = (source: string | null | undefined): string => {
        switch (source) {
          case 'model': return T('决策模型', 'decision model')
          case 'heuristic': return T('规则', 'heuristic')
          case 'fallback': return T('回退', 'fallback')
          case 'media': return T('媒体', 'media')
          case 'notice': return T('未调用模型(能力闸门)', 'no model call (capability gate)')
          default: return source ?? '—'
        }
      }
      const fmtDuration = (ms: number): string => {
        if (ms <= 0) return '—'
        const total = Math.ceil(ms / 1000)
        const m = Math.floor(total / 60)
        const s = total % 60
        return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`
      }

      function useRemote(ctx: any): BarRemoteApi | undefined {
        return useMemo(() => {
          try { return ctx?.get?.(`remote.${NS}`) as BarRemoteApi | undefined } catch (_e) { return undefined }
        }, [ctx])
      }

      function Badge(props: { tone: 'ok' | 'warn' | 'err' | 'none'; text: string }) {
        const cls = props.tone === 'ok' ? 'bar-badge bar-badge-ok'
          : props.tone === 'warn' ? 'bar-badge bar-badge-warn'
            : props.tone === 'err' ? 'bar-badge bar-badge-err' : 'bar-badge'
        return h('span', { className: cls }, props.text)
      }

      // ---- main panel -----------------------------------------------------------
      function Panel(props: { ctx?: any }) {
        const ctx = props.ctx
        const remote = useRemote(ctx)
        const [state, setState] = useState<any>(null)
        const [draft, setDraft] = useState<any>(null)
        const [busy, setBusy] = useState(false)
        const [error, setError] = useState<string | null>(null)
        const [notice, setNotice] = useState<string | null>(null)
        const alive = useRef(true)
        useEffect(() => () => { alive.current = false }, [])

        const applyState = useCallback((next: any) => {
          if (!alive.current || !next) return
          setState(next)
          setDraft({
            decisionModel: next.config?.decisionModel ?? '',
            fallbackModel: next.config?.fallbackModel ?? '',
            enableDecision: next.config?.enableDecision !== false,
            decisionTimeoutMs: String(next.config?.decisionTimeoutMs ?? 12000),
            maxAttempts: String(next.config?.maxAttempts ?? 4),
            quotaCooldownMinutes: String(next.config?.quotaCooldownMinutes ?? 30),
            rateLimitCooldownSeconds: String(next.config?.rateLimitCooldownSeconds ?? 120),
            taskRoutesText: Object.fromEntries(Object.entries(next.config?.taskRoutes ?? {}).map(([k, v]) => [k, (v as string[]).join(', ')])),
            modelsText: JSON.stringify(next.config?.models ?? [], null, 1),
            maxCandidatesForDecision: String(next.config?.maxCandidatesForDecision ?? 14),
            includeSpecialEndpoints: next.config?.includeSpecialEndpoints === true,
            excludeModelsText: (next.config?.excludeModels ?? []).join('\n'),
            balanceStrategy: next.config?.balanceStrategy ?? 'balanced',
            balanceWindow: String(next.config?.balanceWindow ?? 6),
            balanceBand: String(next.config?.balanceBand ?? 0),
            thinkingEffort: next.config?.thinkingEffort ?? 'auto',
            enableMediaRouting: next.config?.enableMediaRouting !== false,
          })
        }, [])

        const load = useCallback(async () => {
          if (!remote) return
          setBusy(true); setError(null)
          try { applyState(unwrap(await remote.getState())) } catch (e: any) { setError(String(e?.message ?? e)) }
          if (alive.current) setBusy(false)
        }, [remote, applyState])

        useEffect(() => { void load() }, [load])
        useEffect(() => {
          if (!ctx?.remote?.$on) return undefined
          try { return ctx.remote.$on('settings/document-updated', () => { void load() }) } catch (_e) { return undefined }
        }, [ctx, load])

        const mutate = useCallback(async (fn: () => Promise<any>, okMessage?: string) => {
          if (!remote) return
          setBusy(true); setError(null); setNotice(null)
          try {
            const result = unwrap(await fn())
            applyState(result?.state ?? result)
            if (okMessage) setNotice(okMessage)
          } catch (e: any) { setError(String(e?.message ?? e)) }
          if (alive.current) setBusy(false)
        }, [remote, applyState])

        if (!remote) {
          return h('div', { className: 'bar-root' },
            h('style', null, CSS),
            h('div', { className: 'bar-card' },
              h('h4', null, T('百炼智能路由', 'Bailian auto router')),
              h('div', { className: 'bar-error' }, T(
                'RPC 通道不可用:请确认插件已启用且 DSH 已重启,然后刷新本页。',
                'RPC unavailable: make sure the plugin is enabled and DSH was restarted, then reload this page.',
              )),
            ))
        }
        if (!state || !draft) {
          return h('div', { className: 'bar-root' }, h('style', null, CSS),
            h('div', { className: 'bar-card' },
              h('span', { className: 'bar-muted' }, busy ? T('加载中…', 'Loading…') : T('等待状态…', 'Waiting for state…')),
              error ? h('div', { className: 'bar-error' }, error) : null))
        }

        const cfg = state.config
        const saveConfig = () => {
          const taskRoutes: Record<string, string[]> = {}
          for (const [task, text] of Object.entries(draft.taskRoutesText ?? {})) {
            taskRoutes[task] = String(text).split(/[\n,，]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
          }
          let models: unknown
          try {
            models = JSON.parse(draft.modelsText || '[]')
            if (!Array.isArray(models)) throw new Error(T('models 必须是数组', 'models must be an array'))
          } catch (e: any) {
            setError(T('自定义模型池 JSON 无效: ', 'Invalid models JSON: ') + String(e?.message ?? e))
            return
          }
          const patch: Record<string, unknown> = {
            decisionModel: String(draft.decisionModel ?? '').trim(),
            fallbackModel: String(draft.fallbackModel ?? '').trim(),
            enableDecision: draft.enableDecision === true,
            decisionTimeoutMs: Number(draft.decisionTimeoutMs),
            maxAttempts: Number(draft.maxAttempts),
            quotaCooldownMinutes: Number(draft.quotaCooldownMinutes),
            rateLimitCooldownSeconds: Number(draft.rateLimitCooldownSeconds),
            maxCandidatesForDecision: Number(draft.maxCandidatesForDecision ?? cfg.maxCandidatesForDecision ?? 14),
            balanceStrategy: draft.balanceStrategy ?? cfg.balanceStrategy ?? 'balanced',
            balanceWindow: Number(draft.balanceWindow ?? cfg.balanceWindow ?? 6),
            balanceBand: Number(draft.balanceBand ?? cfg.balanceBand ?? 0),
            thinkingEffort: draft.thinkingEffort ?? cfg.thinkingEffort ?? 'auto',
            enableMediaRouting: draft.enableMediaRouting !== false,
            includeSpecialEndpoints: draft.includeSpecialEndpoints === true,
            excludeModels: String(draft.excludeModelsText ?? (cfg.excludeModels ?? []).join('\n'))
              .split(/[\n,，]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0),
            taskRoutes,
            models,
          }
          if (!patch.decisionModel || !patch.fallbackModel) {
            setError(T('决策模型与回退模型不能为空', 'Decision and fallback models cannot be empty'))
            return
          }
          for (const key of ['decisionTimeoutMs', 'maxAttempts', 'quotaCooldownMinutes', 'rateLimitCooldownSeconds']) {
            if (!Number.isFinite(patch[key] as number) || (patch[key] as number) <= 0) {
              setError(T(`字段 ${key} 必须是正数`, `Field ${key} must be a positive number`))
              return
            }
          }
          void mutate(() => remote.updateConfig(patch), T('配置已保存(volatile 字段即时生效)', 'Configuration saved (volatile fields apply immediately)'))
        }

        const field = (label: string, value: any, onChange: (v: string) => void) =>
          h('div', { className: 'bar-field' },
            h('label', null, label),
            h('input', { className: 'bar-input bar-mono', value: String(value ?? ''), onChange: (e: any) => onChange(e.target.value) }))

        const TASK_LABELS: Record<string, string> = {
          image: T('图片分析', 'Image analysis'),
          writing: T('中文写作/润色', 'Writing / polish'),
          translation: T('翻译', 'Translation'),
          code: T('代码', 'Code'),
          reasoning: T('复杂逻辑/推理', 'Reasoning'),
          general: T('通用', 'General'),
        }

        return h('div', { className: 'bar-root' },
          h('style', null, CSS),

          // ---- overview ----
          h('div', { className: 'bar-card' },
            h('div', { className: 'bar-row' },
              h('h4', null, T('百炼智能路由 · 状态', 'Bailian auto router · status')),
              h(Badge, { tone: cfg.apiKeyConfigured ? 'ok' : 'err', text: cfg.apiKeyConfigured ? T('API Key 已配置', 'API key set') : T('API Key 未配置', 'API key missing') }),
              h(Badge, { tone: cfg.enableDecision ? 'ok' : 'warn', text: cfg.enableDecision ? T('决策模型开启', 'decision on') : T('决策模型关闭(启发式)', 'decision off (heuristic)') }),
              h('span', { className: 'bar-muted bar-mono' }, `${state.provider}/${state.model}`),
            ),
            h('div', { className: 'bar-row bar-muted' },
              h('span', null, T('接口: ', 'Endpoint: '), h('span', { className: 'bar-mono' }, cfg.baseURL)),
              h('span', null, T('凭据引用: ', 'Credential ref: '), h('span', { className: 'bar-mono' }, cfg.apiKeyEnv)),
              h('span', null, T('最近同步: ', 'Last sync: '), fmtTime(state.pool?.lastSyncAt ?? null)),
            ),
            h('div', { className: 'bar-row' },
              h(Badge, { tone: 'ok', text: T(`账号可用 ${state.pool?.total ?? 0} 个 → 可对话 ${state.pool?.count ?? 0} 个`, `${state.pool?.total ?? 0} reachable → ${state.pool?.count ?? 0} chat models`) }),
              h(Badge, { tone: 'ok', text: T(`视觉模型 ${state.pool?.visionCount ?? 0} 个`, `${state.pool?.visionCount ?? 0} vision`) }),
              h(Badge, { tone: 'none', text: T(`已排除非对话模型 ${(state.pool?.excluded ?? []).length} 个`, `${(state.pool?.excluded ?? []).length} non-chat excluded`) }),
            ),
            state.derived && (state.derived.decisionModel || state.derived.fallbackModel)
              ? h('div', { className: 'bar-muted' }, T(
                `当前账号不提供配置的模型,已自动替代: 决策=${cfg.decisionModel}(原 ${cfg.decisionModelConfigured}),回退=${cfg.fallbackModel}(原 ${cfg.fallbackModelConfigured})。换账号后无需改动配置。`,
                `This account does not serve the configured models; substituted decision=${cfg.decisionModel} (was ${cfg.decisionModelConfigured}), fallback=${cfg.fallbackModel} (was ${cfg.fallbackModelConfigured}).`,
              ))
              : null,
            state.adopted
              ? h('div', { className: 'bar-muted' }, T(
                `已自动沿用 profile 中 ${state.adopted.entryId} → ${state.adopted.providerId} 的接口与凭据(无需重复配置)。`,
                `Reusing the endpoint and credential of ${state.adopted.entryId} → ${state.adopted.providerId} from this profile.`,
              ))
              : (state.candidates ?? []).length > 0
                ? h('div', { className: 'bar-muted' }, T(
                  `检测到 ${state.candidates.length} 个阿里云兼容连接;把「接口」设为默认值可自动沿用。`,
                  `${state.candidates.length} Aliyun-compatible connection(s) found; keep the shipped endpoint to reuse one.`,
                ))
                : null,
            state.pool?.lastSyncError ? h('div', { className: 'bar-error' }, T('同步失败: ', 'Sync failed: '), state.pool.lastSyncError) : null,
            notice ? h('div', { className: 'bar-ok' }, notice) : null,
            error ? h('div', { className: 'bar-error' }, error) : null,
          ),

          // ---- routing configuration ----
          h('div', { className: 'bar-card' },
            h('h4', null, T('路由与容灾配置', 'Routing & failover')),
            h('div', { className: 'bar-row' },
              h('label', { className: 'bar-check' },
                h('input', { type: 'checkbox', checked: draft.enableDecision !== false, onChange: (e: any) => setDraft({ ...draft, enableDecision: e.target.checked }) }),
                T('启用决策模型(关闭后仅按启发式规则路由)', 'Enable decision model (heuristics only when off)')),
            ),
            h('div', { className: 'bar-row' },
              field(T('决策模型', 'Decision model'), draft.decisionModel, (v: string) => setDraft({ ...draft, decisionModel: v })),
              field(T('回退模型(决策失败时)', 'Fallback model'), draft.fallbackModel, (v: string) => setDraft({ ...draft, fallbackModel: v })),
              field(T('决策超时 ms', 'Decision timeout (ms)'), draft.decisionTimeoutMs, (v: string) => setDraft({ ...draft, decisionTimeoutMs: v })),
              field(T('单请求最多尝试模型数', 'Max attempts per request'), draft.maxAttempts, (v: string) => setDraft({ ...draft, maxAttempts: v })),
            ),
            h('div', { className: 'bar-row' },
              field(T('额度耗尽冷却(分钟)', 'Quota cooldown (minutes)'), draft.quotaCooldownMinutes, (v: string) => setDraft({ ...draft, quotaCooldownMinutes: v })),
              field(T('限流/网络冷却(秒)', 'Rate-limit cooldown (seconds)'), draft.rateLimitCooldownSeconds, (v: string) => setDraft({ ...draft, rateLimitCooldownSeconds: v })),
            ),
            h('div', { className: 'bar-row' },
              h('div', { className: 'bar-btn bar-btn-primary', role: 'button', onClick: saveConfig }, T('保存配置', 'Save')),
              h('div', { className: 'bar-btn', role: 'button', onClick: () => void load() }, T('重新载入', 'Reload')),
              h('span', { className: 'bar-muted' }, T('保存写入 profile 的 cordis.patch.yml;volatile 字段即时生效', 'Saves into the profile cordis.patch.yml; volatile fields apply live')),
            ),
          ),

          // ---- task routes ----
          h('div', { className: 'bar-card' },
            h('h4', null, T('各任务类型候选模型(逗号/换行分隔,按优先级排序)', 'Task candidate lists (comma/newline separated, priority order)')),
            h('div', { className: 'bar-row' },
              ...['image', 'writing', 'translation', 'code', 'reasoning', 'general'].map(task =>
                h('div', { className: 'bar-field', key: task },
                  h('label', null, TASK_LABELS[task]),
                  h('textarea', {
                    className: 'bar-textarea',
                    value: draft.taskRoutesText?.[task] ?? '',
                    onChange: (e: any) => setDraft({ ...draft, taskRoutesText: { ...draft.taskRoutesText, [task]: e.target.value } }),
                  })))),
            h('div', { className: 'bar-field' },
              h('label', null, T(
                '自定义模型池(JSON 数组,覆盖内置目录;字段: id,name,vision,contextWindow,maxTokens,tags)',
                'Custom pool (JSON array; fields: id,name,vision,contextWindow,maxTokens,tags)',
              )),
              h('textarea', {
                className: 'bar-textarea', style: { minHeight: '96px' }, value: draft.modelsText ?? '[]',
                onChange: (e: any) => setDraft({ ...draft, modelsText: e.target.value }),
              })),
          ),

          // ---- pool & quota ----
          h('div', { className: 'bar-card' },
            h('div', { className: 'bar-row' },
              h('h4', null, T('模型池与本地冷却状态（启发式，非真实配额）', 'Pool & local cooldown state (heuristic, not real quota)')),
              h('div', {
                className: 'bar-btn', role: 'button',
                onClick: () => void mutate(() => remote.refreshPool(), T('已从百炼拉取模型列表', 'Model list refreshed from Bailian')),
              }, T('刷新模型列表', 'Refresh pool')),
              h('div', {
                className: 'bar-btn', role: 'button',
                onClick: () => void mutate(() => remote.resetQuota(), T('已解除全部冷却', 'All cooldowns cleared')),
              }, T('全部解除冷却', 'Clear all cooldowns')),
            ),
            h('div', { style: { maxHeight: '320px', overflow: 'auto' } },
              h('table', { className: 'bar-table' },
                h('thead', null, h('tr', null,
                  h('th', null, T('模型', 'Model')),
                  h('th', null, T('来源', 'Source')),
                  h('th', null, T('视觉', 'Vision')),
                  h('th', null, T('冷却状态(启发式)', 'Cooldown (heuristic)')),
                  h('th', null, T('连败', 'Fails')),
                  h('th', null, T('调用', 'Calls')),
                  h('th', null, T('最近错误', 'Last error')),
                  h('th', null, ''),
                )),
                h('tbody', null, (state.quota ?? []).map((q: any) => {
                  const meta = (state.pool?.models ?? []).find((m: any) => m.id === q.model)
                  return h('tr', { key: q.model },
                    h('td', { className: 'bar-mono' }, q.model,
                      meta?.name && meta.name !== q.model ? h('span', { className: 'bar-muted' }, ` (${meta.name})`) : null),
                    h('td', null, meta?.source ?? '—'),
                    h('td', null, meta?.vision ? '✓' : '—'),
                    h('td', null, q.available
                      ? h(Badge, { tone: 'ok', text: T('可用', 'available') })
                      : h(Badge, { tone: 'warn', text: `${T('冷却中', 'cooldown')} ${fmtDuration(q.cooldownRemainingMs)}` })),
                    h('td', null, String(q.fails)),
                    h('td', null, String(q.calls)),
                    h('td', { className: 'bar-muted' }, q.lastFailCode ?? '—'),
                    h('td', null, q.available ? null : h('div', {
                      className: 'bar-btn', role: 'button',
                      onClick: () => void mutate(() => remote.resetQuota(q.model), T('已解除冷却: ', 'Cooldown cleared: ') + q.model),
                    }, T('解除', 'Clear'))),
                  )
                }))),
            ),
          ),

          // ---- connection switcher ----
        h('div', { className: 'bar-card' },
          h('h4', null, T('阿里云连接(换账号时在这里切换)', 'Aliyun connection (switch accounts here)')),
          (state.candidates ?? []).length === 0
            ? h('div', { className: 'bar-muted' }, T(
              '本 profile 未发现其他阿里云兼容 provider;可直接编辑上方接口与凭据引用,或继续自动沿用当前值。',
              'No other Aliyun-compatible provider in this profile; edit the endpoint and credential above.',
            ))
            : h('div', { className: 'bar-row' },
              ...(state.candidates ?? []).map((candidate: any) => h('div', {
                key: `${candidate.entryId}#${candidate.providerId}`,
                className: 'bar-card',
                style: { padding: '8px 10px', minWidth: '260px' },
              },
                h('div', { className: 'bar-row' },
                  h('span', { className: 'bar-mono' }, `${candidate.entryId} → ${candidate.providerId}`),
                  candidate.current ? h(Badge, { tone: 'ok', text: T('当前使用', 'in use') }) : null,
                ),
                h('div', { className: 'bar-muted bar-mono', style: { fontSize: '11px', wordBreak: 'break-all' } }, candidate.baseURL),
                h('div', { className: 'bar-muted', style: { fontSize: '11px' } }, T('凭据: ', 'credential: ') + (candidate.apiKeyEnv ?? '—')),
                candidate.current ? null : h('div', {
                  className: 'bar-btn', role: 'button', style: { marginTop: '6px' },
                  onClick: () => void mutate(
                    () => remote.switchConnection(candidate.entryId, candidate.providerId),
                    T('已切换连接并重新同步模型池', 'Connection switched and pool resynced'),
                  ),
                }, T('切到这个账号', 'Switch to this account')),
              )),
            ),
        ),

        // ---- balancing & thinking ----
        h('div', { className: 'bar-card' },
          h('h4', null, T('负载均衡与思考档位', 'Load balancing & thinking effort')),
          h('div', { className: 'bar-row' },
            h('div', { className: 'bar-field' },
              h('label', null, T('均衡策略', 'Balancing strategy')),
              h('select', {
                className: 'bar-input',
                value: draft.balanceStrategy ?? 'balanced',
                onChange: (e: any) => setDraft({ ...draft, balanceStrategy: e.target.value }),
              },
                h('option', { value: 'balanced' }, T('按 token 消耗均衡(推荐)', 'Balance by token usage')),
                h('option', { value: 'quality' }, T('始终用最优模型', 'Always use the best model')),
              )),
            field(T('轮转候选个数', 'Rotation window'), draft.balanceWindow, (v: string) => setDraft({ ...draft, balanceWindow: v })),
            field(T('分数保护带(0=关闭)', 'Score guard band (0 = off)'), draft.balanceBand, (v: string) => setDraft({ ...draft, balanceBand: v })),
            h('div', { className: 'bar-field' },
              h('label', null, T('思考档位策略', 'Thinking effort policy')),
              h('select', {
                className: 'bar-input',
                value: draft.thinkingEffort ?? 'auto',
                onChange: (e: any) => setDraft({ ...draft, thinkingEffort: e.target.value }),
              },
                h('option', { value: 'auto' }, T('自动(按任务复杂度)', 'Auto (by task complexity)')),
                h('option', { value: 'off' }, T('关闭', 'Off')),
                h('option', { value: 'low' }, 'low'),
                h('option', { value: 'medium' }, 'medium'),
                h('option', { value: 'high' }, 'high'),
                h('option', { value: 'max' }, 'max'),
              )),
          ),
          h('div', { className: 'bar-muted' }, T(
            '均衡: 同一任务在排名前 N 的同类模型之间按近期 token 消耗轮转,避免每次都用同一个旗舰。思考档位: auto 会按输入长度、代码密度、推理词汇、已执行工具步数估算复杂度并下发对应档位(trivial→off, simple→low, normal→medium, complex→high, deep→max)。',
            'Balancing rotates among the top-N task candidates by recent token usage. Auto effort estimates complexity from length, code density, reasoning vocabulary and tool steps.',
          )),
          h('div', { className: 'bar-row' },
            h('label', { className: 'bar-check' },
              h('input', {
                type: 'checkbox',
                checked: draft.enableMediaRouting !== false,
                onChange: (e: any) => setDraft({ ...draft, enableMediaRouting: e.target.checked }),
              }),
              T('启用媒体路由(图像生成走 /images/generations)', 'Enable media routing (image generation)')),
            h('span', { className: 'bar-muted' }, T(
              `可路由媒体: 图像 ${(state.pool?.media?.image ?? []).length} 个 · 语音 ${(state.pool?.media?.speech ?? []).length} 个 · 识别 ${(state.pool?.media?.asr ?? []).length} 个`,
              `Media: image ${(state.pool?.media?.image ?? []).length}, speech ${(state.pool?.media?.speech ?? []).length}, asr ${(state.pool?.media?.asr ?? []).length}`,
            )),
          ),
        ),

        // ---- pool composition ----
        h('div', { className: 'bar-card' },
          h('div', { className: 'bar-row' },
            h('h4', null, T('模型池构成(来自本账号 /models 列表)', 'Pool composition (this account\'s /models)')),
            h('div', {
              className: 'bar-btn', role: 'button',
              onClick: () => void mutate(() => remote.refreshPool(), T('已重新拉取模型列表', 'Model list refreshed')),
            }, T('重新拉取', 'Resync')),
          ),
          h('div', { className: 'bar-muted' }, T(
            `可对话 ${state.pool?.count ?? 0} 个 / 共 ${state.pool?.total ?? 0} 个;排除 ${(state.pool?.excluded ?? []).length} 个(TTS、语音识别、向量化、重排、图像/视频生成、实时流等不走 chat 接口)。`,
            `${state.pool?.count ?? 0} chat-capable of ${state.pool?.total ?? 0}; ${(state.pool?.excluded ?? []).length} excluded (TTS/ASR/embedding/rerank/image/video/realtime endpoints).`,
          )),
          h('div', { className: 'bar-row' },
            h('div', { className: 'bar-field' },
              h('label', null, T('排除规则(每行一个 id 或前缀*)', 'Exclude patterns (one per line)')),
              h('textarea', {
                className: 'bar-textarea',
                value: (cfg.excludeModels ?? []).join('\n'),
                onChange: (e: any) => setDraft({ ...draft, excludeModelsText: e.target.value }),
              })),
            h('div', { className: 'bar-field' },
              h('label', null, T('决策模型看到的候选数量(其余作为回退链)', 'Candidates shown to the decision model')),
              h('input', {
                className: 'bar-input bar-mono',
                value: String(draft.maxCandidatesForDecision ?? cfg.maxCandidatesForDecision ?? 14),
                onChange: (e: any) => setDraft({ ...draft, maxCandidatesForDecision: e.target.value }),
              })),
          ),
          h('div', { className: 'bar-row' },
            h('label', { className: 'bar-check' },
              h('input', {
                type: 'checkbox',
                checked: draft.includeSpecialEndpoints === true || (draft.includeSpecialEndpoints === undefined && cfg.includeSpecialEndpoints === true),
                onChange: (e: any) => setDraft({ ...draft, includeSpecialEndpoints: e.target.checked }),
              }),
              T('把 deep-research / deep-search-planning 等特殊端点也纳入候选', 'Include agent/research-only endpoints as candidates')),
          ),
          (state.pool?.excluded ?? []).length === 0 ? null : h('details', null,
            h('summary', { className: 'bar-muted' }, T('查看被排除的模型', 'Show excluded models')),
            h('div', { style: { maxHeight: '160px', overflow: 'auto', marginTop: '6px' } },
              h('table', { className: 'bar-table' },
                h('tbody', null, (state.pool?.excluded ?? []).slice(0, 200).map((row: any) =>
                  h('tr', { key: row.id },
                    h('td', { className: 'bar-mono' }, row.id),
                    h('td', { className: 'bar-muted' }, row.reason))))))),
        ),

        // ---- history ----
          h('div', { className: 'bar-card' },
            h('div', { className: 'bar-row' },
              h('h4', null, T('最近路由决策(最多 50 条)', 'Recent routing decisions (last 50)')),
              h('div', {
                className: 'bar-btn', role: 'button',
                onClick: () => void mutate(() => remote.clearHistory(), T('历史已清空', 'History cleared')),
              }, T('清空', 'Clear')),
            ),
            (state.history ?? []).length === 0
              ? h('div', { className: 'bar-muted' }, T(
                '暂无记录;在会话中把模型切到「百炼智能路由」发起对话后回到这里查看。',
                'No records yet; pick the "bailian-auto" model in a session and come back.',
              ))
              : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflow: 'auto' } },
                (state.history ?? []).map((r: any, i: number) => h('div', { className: 'bar-history-item', key: `${r.at}-${i}` },
                  h('div', { className: 'bar-row' },
                    h(Badge, { tone: r.ok ? 'ok' : 'err', text: r.ok ? T('成功', 'ok') : T('失败', 'failed') }),
                    h('span', { className: 'bar-mono' }, r.finalModel ?? '—'),
                    h('span', { className: 'bar-muted' }, `${fmtTime(r.at)} · ${r.task} · ${r.modality} · ${decisionSourceLabel(r.decisionSource)}`
                      + (r.decisionTokens ? ` · 决策 ${r.decisionTokens} tok` : '')),
                  ),
                  r.reasoning ? h('div', { className: 'bar-muted' }, r.reasoning) : null,
                  (r.attempts ?? []).length > 1
                    ? h('div', { className: 'bar-muted bar-mono' },
                      T('尝试链: ', 'attempts: ') + r.attempts.map((a: any) => `${a.model}${a.ok ? '✓' : `✗(${a.code ?? '?'})`}`).join(' → '))
                    : null,
                ))),
          ),
        )
      }

      // ---- Settings → Models footer card ---------------------------------------
      // The footer card needs the client ctx; capture it from apply().
      let clientCtx: any = null

      function FooterCard() {
        const [line, setLine] = useState<string | null>(null)
        useEffect(() => {
          let disposed = false
          const run = async () => {
            try {
              const remote = clientCtx?.get?.(`remote.${NS}`) as BarRemoteApi | undefined
              if (!remote) return
              const state = unwrap(await remote.getState())
              if (disposed || !state) return
              const cooling = (state.quota ?? []).filter((q: any) => !q.available).length
              setLine(`${state.modelName} (bailian-auto) · ${T('决策模型', 'decision')} ${state.config?.decisionModel ?? '?'} · ${T('模型池', 'pool')} ${state.pool?.count ?? 0} · ${T('冷却中', 'cooling')} ${cooling}`)
            } catch (_e) { /* stay silent in the footer */ }
          }
          void run()
          const timer = setInterval(() => { void run() }, 30_000)
          return () => { disposed = true; clearInterval(timer) }
        }, [])
        return h('div', { className: 'bar-footer-card' },
          h('style', null, CSS),
          h('span', { className: 'bar-dot', style: { background: line ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-idle-primary)' } }),
          h('span', null, line ?? T('百炼智能路由:状态载入中…', 'Bailian auto router: loading…')))
      }

      // ---- plugin entry ----------------------------------------------------------
      return {
        inject: ['slots', 'remote'],
        async apply(ctx: any) {
          clientCtx = ctx
          let unmount: (() => void) | undefined
          try {
            if (typeof ctx.remote?.$mount === 'function') {
              const result = await ctx.remote.$mount(contribution)
              unmount = typeof result === 'function' ? result : () => { void result }
            }
          } catch (error) {
            ctx.logger?.warn?.(`${PACKAGE}: remote contribution mount failed: ${String((error as Error)?.message ?? error)}`)
          }
          ctx.effect(() => () => { try { unmount?.() } catch (_e) { /* already gone */ } }, `${PACKAGE}: remote contribution`)

          ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
            name: 'plugins.bundle.config', key: PACKAGE, inject: () => ({ ctx }),
          }, (props: any) => h(Panel, { ...props, ctx })))

          ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
            name: 'settings.models.footer', id: 'bailian-auto-router-status', order: 50,
          }, FooterCard))
        },
      }
    },
  })
}
