// Auto Router 0.6.1 — self-update: check GitHub Releases + one-click apply.
// The apply step runs a DETACHED updater so the host can be stopped/restarted
// safely (stop -> deploy -> start -> verify), never overwriting live files.
import { execFile } from 'node:child_process'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** GitHub repo that publishes this plugin's releases. */
export const UPDATE_REPO = 'interested3041/dsh-auto-router'

/** Install dir = parent of lib/ (where package.json + scripts/ live). */
export function installDir(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

export function currentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(installDir(), 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Numeric semver-ish compare: -1 a<b, 0 equal, 1 a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0)
  const pb = String(b).replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da < db ? -1 : 1
  }
  return 0
}

export interface UpdateInfo {
  current: string
  latest: string
  hasUpdate: boolean
  url: string
  /** Present when GitHub could not be reached or returned an unusable tag. */
  error?: string
}

/** Query the latest release tag via PowerShell (honors the local proxy). */
export async function checkLatest(repo: string = UPDATE_REPO): Promise<UpdateInfo> {
  const current = currentVersion()
  const api = `https://api.github.com/repos/${repo}/releases/latest`
  // Keep the worst case short enough for an interactive button: 5s via the
  // local proxy, then 8s direct. A failed check must be reported as a failure,
  // never disguised as "already up to date".
  const ps = `try { $r = Invoke-RestMethod -Uri '${api}' -Proxy 'http://127.0.0.1:7897' -TimeoutSec 5 } catch { try { $r = Invoke-RestMethod -Uri '${api}' -TimeoutSec 8 } catch { Write-Output '__FAIL__'; exit 3 } }; $r.tag_name`
  let latest = current
  let error: string | undefined
  try {
    const { stdout } = await execFileAsync('pwsh', ['-NoProfile', '-Command', ps], { timeout: 20_000 })
    const tag = stdout.trim().split(/\r?\n/).pop()?.trim() ?? ''
    if (tag === '__FAIL__') error = '无法访问 GitHub Releases(检查代理或网络)'
    else if (/^v?\d+\.\d+\.\d+/.test(tag)) latest = tag.replace(/^v/, '')
    else error = `GitHub 返回了无法识别的发布版本:${tag || '(空)'}`
  } catch (cause) {
    error = `检查更新超时或失败:${String((cause as Error)?.message ?? cause)}`
  }
  return {
    current,
    latest,
    hasUpdate: error ? false : compareVersions(latest, current) > 0,
    url: `https://github.com/${repo}/releases/latest`,
    error,
  }
}

/**
 * Launch the detached self-updater for a tag. Returns immediately; the host
 * will be stopped, redeployed and restarted by the external script.
 */
export function applyUpdate(tag: string, repo: string = UPDATE_REPO): { started: boolean; message: string } {
  const dir = installDir()
  const script = join(dir, 'scripts', 'self-update.ps1')
  try {
    const child = spawn('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-Tag', tag, '-Repo', repo, '-InstallDir', dir, '-HostExe', process.execPath,
    ], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return { started: true, message: `v${tag} 更新已启动:按「停→部署→启动→校验」执行,宿主稍后自动重启。` }
  } catch (error) {
    return { started: false, message: `更新启动失败:${String((error as Error)?.message ?? error)}` }
  }
}