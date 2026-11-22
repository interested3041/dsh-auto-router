// Auto Router 0.6.1 — self-update: check GitHub Releases + one-click apply.
// The apply step runs a DETACHED updater so the host can be stopped/restarted
// safely (stop -> deploy -> start -> verify), never overwriting live files.
import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
/** GitHub repo that publishes this plugin's releases. */
export const UPDATE_REPO = 'interested3041/dsh-auto-router';
/** Install dir = parent of lib/ (where package.json + scripts/ live). */
export function installDir() {
    return dirname(dirname(fileURLToPath(import.meta.url)));
}
export function currentVersion() {
    try {
        const pkg = JSON.parse(readFileSync(join(installDir(), 'package.json'), 'utf8'));
        return pkg.version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
/** Numeric semver-ish compare: -1 a<b, 0 equal, 1 a>b. */
export function compareVersions(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0);
    const pb = String(b).replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db)
            return da < db ? -1 : 1;
    }
    return 0;
}
/** Query the latest release tag via PowerShell (honors the local proxy). */
export async function checkLatest(repo = UPDATE_REPO) {
    const current = currentVersion();
    const api = `https://api.github.com/repos/${repo}/releases/latest`;
    const ps = `try { $r = Invoke-RestMethod -Uri '${api}' -Proxy 'http://127.0.0.1:7897' -TimeoutSec 20 } catch { $r = Invoke-RestMethod -Uri '${api}' -TimeoutSec 20 }; $r.tag_name`;
    let latest = current;
    try {
        const { stdout } = await execFileAsync('pwsh', ['-NoProfile', '-Command', ps], { timeout: 45_000 });
        const tag = stdout.trim().split(/\r?\n/).pop()?.trim() ?? '';
        if (/^v?\d+\.\d+\.\d+/.test(tag))
            latest = tag.replace(/^v/, '');
    }
    catch {
        // network unavailable: report no update rather than throwing
    }
    return {
        current,
        latest,
        hasUpdate: compareVersions(latest, current) > 0,
        url: `https://github.com/${repo}/releases/latest`,
    };
}
/**
 * Launch the detached self-updater for a tag. Returns immediately; the host
 * will be stopped, redeployed and restarted by the external script.
 */
export function applyUpdate(tag, repo = UPDATE_REPO) {
    const dir = installDir();
    const script = join(dir, 'scripts', 'self-update.ps1');
    try {
        const child = spawn('pwsh', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
            '-Tag', tag, '-Repo', repo, '-InstallDir', dir, '-HostExe', process.execPath,
        ], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
        return { started: true, message: `Updater started for v${tag}; the host will restart shortly.` };
    }
    catch (error) {
        return { started: false, message: String(error?.message ?? error) };
    }
}
