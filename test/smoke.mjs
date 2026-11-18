/**
 * Build-output smoke test: verifies the compiled host entry exports the
 * contract the DSH loader needs (name, inject, apply, Config, TYPERT) and that
 * the pure routing helpers behave, without touching the network or a Cordis
 * context.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { Script } from 'node:vm'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const checks = []

function assert(condition, message) {
  checks.push({ condition: !!condition, message })
}

// 1. Build artifacts exist.
assert(existsSync(join(root, '..', 'lib', 'index.js')), 'lib/index.js exists')
assert(existsSync(join(root, '..', 'lib', 'typert.host.js')), 'lib/typert.host.js exists')
assert(existsSync(join(root, '..', 'lib', 'client.js')), 'lib/client.js exists')

// 1b. The client bundle must be a classic script (the loader evals it as one).
const clientSource = readFileSync(join(root, '..', 'lib', 'client.js'), 'utf8')
let classicScriptOk = true
try {
  new Script(clientSource, { filename: 'lib/client.js' })
} catch (_notAClassicScript) {
  classicScriptOk = false
}
assert(classicScriptOk, 'lib/client.js parses as a classic script (no ESM syntax)')
assert(!/^\s*(?:import\s|export\s)/m.test(clientSource), 'lib/client.js contains no import/export statements')
assert(clientSource.includes('__ModuleLoader__.load'), 'lib/client.js self-registers with the module loader')

// 2. Host entry exports the loader contract.
const host = await import(pathToFileURL(join(root, '..', 'lib', 'index.js')).href)
assert(typeof host.apply === 'function', 'apply is a function')
assert(host.name === 'bailian-auto-router', 'name is bailian-auto-router')
assert(Array.isArray(host.inject) && host.inject.includes('llm'), 'inject includes llm')
assert(host.Config !== undefined, 'Config schema exported')
assert(host.TYPERT !== undefined && host.TYPERT.package === 'dsh-bailian-auto-router', 'TYPERT manifest exported')

// 3. Pure routing helpers behave.
const catalog = await import(pathToFileURL(join(root, '..', 'lib', 'catalog.js')).href)
assert(catalog.inferVision('qwen-vl-max') === true, 'inferVision(qwen-vl-max) true')
assert(catalog.inferVision('qwen-plus') === false, 'inferVision(qwen-plus) false')
assert(catalog.BUILTIN_CATALOG.length >= 20, 'builtin catalog has >= 20 entries')
assert(catalog.DEFAULT_TASK_ROUTES.image.every(id => catalog.catalogEntry(id)?.vision === true), 'default image route is vision-only')

const decision = await import(pathToFileURL(join(root, '..', 'lib', 'decision.js')).href)
const parsed = decision.parseDecision('```json\n{"selected_model":"qwen-plus","reasoning":"test"}\n```')
assert(parsed?.selectedModel === 'qwen-plus', 'parseDecision extracts from fenced JSON')
assert(decision.parseDecision('no json here') === undefined, 'parseDecision rejects non-JSON')

// 4. Typert host manifest has the full RPC surface (incl. account management).
const methods = host.TYPERT.invocations.map(inv => inv.method).sort()
assert(JSON.stringify(methods) === JSON.stringify(['activateAccount', 'clearHistory', 'getState', 'refreshPool', 'removeAccount', 'resetQuota', 'switchConnection', 'updateConfig', 'upsertAccount']), 'TYPERT methods are complete')

// Report.
let failed = 0
for (const check of checks) {
  if (!check.condition) failed += 1
  console.log(`${check.condition ? 'ok' : 'FAIL'}  ${check.message}`)
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed > 0 ? 1 : 0)
