/**
 * Process side of the lab cockpit: spawn the tunnels we own, list what is
 * actually listening on this machine and on the lab box, and never lose track
 * of a child process.
 *
 * Why every tunnel is a direct child process: the incident that motivated this
 * plugin was launched with `ssh -f`, which forks into the background and drops
 * the handle. Nothing could stop it later, so it survived for hours as an
 * orphan. Here we spawn without `-f` and keep the ChildProcess, so `stop` is
 * always possible and DSH shutdown can reap what it started.
 * @module dsh-lab/ssh
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'

/** A tunnel this plugin started and still tracks. */
export interface TunnelRecord {
  id: string
  host: string
  localPort: number
  remoteHost: string
  remotePort: number
  pid: number
  startedAt: number
  status: 'starting' | 'up' | 'failed' | 'stopped'
  error?: string
}

/** One listening socket, local or remote. */
export interface Listener {
  /** 127.0.0.1, 0.0.0.0, ::1, :: */
  addr: string
  port: number
  pid: number | null
  process: string | null
}

/** How the plugin found a listener's owner. */
export interface ListenerScan {
  ok: boolean
  listeners: Listener[]
  error?: string
}

const isWindows = process.platform === 'win32'

/** Absolute Windows OpenSSH path, so a Git-bundled ssh never shadows it. */
const WINDOWS_SSH = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'

let cachedSsh: string | null = null

/** Resolve the ssh binary once: real Windows OpenSSH first, PATH fallback. */
export function resolveSsh(): string {
  if (cachedSsh !== null) return cachedSsh
  if (isWindows && existsSync(WINDOWS_SSH)) cachedSsh = WINDOWS_SSH
  else cachedSsh = 'ssh'
  return cachedSsh
}

/** Run a command to completion and capture its output; never throws. */
export function run(
  file: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: err === null, stdout: stdout ?? '', stderr: stderr ?? (err instanceof Error ? err.message : '') })
    })
  })
}

/** Ask the OS which addresses are listening, with the owning process when known. */
export async function scanLocalListeners(): Promise<ListenerScan> {
  if (!isWindows) {
    const r = await run('ss', ['-H', '-lntp'])
    if (!r.ok) return { ok: false, listeners: [], error: r.stderr.trim() || 'ss failed' }
    return { ok: true, listeners: parseSsListeners(r.stdout) }
  }
  const script = [
    "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue",
    "| ForEach-Object { [pscustomobject]@{",
    "addr=$_.LocalAddress; port=$_.LocalPort; pid=$_.OwningProcess;",
    "name=(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } }",
    "| ConvertTo-Json -Compress -Depth 3",
  ].join(' ')
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
  if (!r.ok) return { ok: false, listeners: [], error: r.stderr.trim() || 'powershell failed' }
  const text = r.stdout.trim()
  if (text === '') return { ok: true, listeners: [] }
  try {
    const parsed: unknown = JSON.parse(text)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    const listeners: Listener[] = []
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue
      const rec = row as Record<string, unknown>
      const port = Number(rec.port)
      if (!Number.isInteger(port) || port <= 0) continue
      listeners.push({
        addr: typeof rec.addr === 'string' ? rec.addr : '',
        port,
        pid: Number.isInteger(Number(rec.pid)) ? Number(rec.pid) : null,
        process: typeof rec.name === 'string' ? rec.name : null,
      })
    }
    return { ok: true, listeners }
  } catch (e) {
    return { ok: false, listeners: [], error: 'cannot parse local listener table: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

/** Parse `ss -H -lntp` rows into listeners. */
export function parseSsListeners(text: string): Listener[] {
  const out: Listener[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const cols = trimmed.split(/\s+/)
    if (cols.length < 4) continue
    const local = cols[3] ?? ''
    const colon = local.lastIndexOf(':')
    if (colon === -1) continue
    const hostPart = local.slice(0, colon)
    const port = Number(local.slice(colon + 1))
    if (!Number.isInteger(port) || port <= 0) continue
    const procMatch = /\("([^"]+)",pid=(\d+)/.exec(trimmed)
    out.push({
      addr: normalizeAddr(hostPart),
      port,
      pid: procMatch?.[2] !== undefined ? Number(procMatch[2]) : null,
      process: procMatch?.[1] ?? null,
    })
  }
  return out
}

/** Collapse IPv6 wildcard spellings so the UI can group listeners sanely. */
function normalizeAddr(raw: string): string {
  const a = raw.replace(/^\[|\]$/g, '')
  if (a === '*' || a === '0.0.0.0') return '0.0.0.0'
  if (a === '::' || a === '::0') return '::'
  return a
}

/** Read the remote lab box's listening sockets over ssh. */
export async function scanRemoteListeners(host: string): Promise<ListenerScan> {
  const r = await run(resolveSsh(), [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    host,
    'ss -H -lntp 2>/dev/null || netstat -lntp 2>/dev/null',
  ], 20_000)
  if (!r.ok && r.stdout.trim() === '') {
    return { ok: false, listeners: [], error: r.stderr.trim() || 'ssh failed' }
  }
  return { ok: true, listeners: parseSsListeners(r.stdout) }
}

/** Whether a local TCP port accepts a connection right now. */
export function probePort(port: number, host = '127.0.0.1', timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    const done = (value: boolean): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/** Owns every child process this plugin started. */
export class TunnelManager {
  private readonly records = new Map<string, TunnelRecord>()
  private readonly children = new Map<string, ChildProcess>()

  /** All tunnels, newest first. */
  list(): TunnelRecord[] {
    return [...this.records.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  /** PIDs this plugin is responsible for. */
  ownedPids(): Set<number> {
    const pids = new Set<number>()
    for (const rec of this.records.values()) {
      if (rec.status === 'up' || rec.status === 'starting') pids.add(rec.pid)
    }
    for (const child of this.children.values()) {
      if (typeof child.pid === 'number') pids.add(child.pid)
    }
    return pids
  }

  /** Start one tunnel and fail loudly instead of leaving a silent corpse. */
  async start(input: { host: string; localPort: number; remoteHost: string; remotePort: number }): Promise<TunnelRecord> {
    const id = input.localPort + ':' + input.host + ':' + input.remoteHost + ':' + input.remotePort
    const existing = this.records.get(id)
    if (existing !== undefined && (existing.status === 'up' || existing.status === 'starting')) return existing

    const args = [
      '-N',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'BatchMode=yes',
      '-o', 'ServerAliveInterval=20',
      '-o', 'ServerAliveCountMax=3',
      '-L', input.localPort + ':' + input.remoteHost + ':' + input.remotePort,
      input.host,
    ]
    const child = spawn(resolveSsh(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const record: TunnelRecord = {
      id,
      host: input.host,
      localPort: input.localPort,
      remoteHost: input.remoteHost,
      remotePort: input.remotePort,
      pid: child.pid ?? -1,
      startedAt: Date.now(),
      status: 'starting',
    }
    this.records.set(id, record)
    this.children.set(id, child)

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
    })

    child.on('error', (err) => {
      record.status = 'failed'
      record.error = err.message
      this.children.delete(id)
    })
    child.on('exit', (code, signal) => {
      this.children.delete(id)
      if (record.status === 'failed') return
      if (record.status === 'stopped') return
      record.status = code === 0 && signal === null ? 'stopped' : 'failed'
      if (record.status === 'failed') {
        record.error = stderr.trim() !== '' ? stderr.trim() : 'ssh exited with code ' + String(code)
      }
    })

    // Give ssh a moment to either bind the port or die with a reason.
    await new Promise((resolve) => setTimeout(resolve, 900))
    if (record.status === 'starting') {
      const listening = await probePort(input.localPort)
      if (listening) record.status = 'up'
      else {
        record.status = 'failed'
        record.error = stderr.trim() !== '' ? stderr.trim() : 'port ' + String(input.localPort) + ' never came up'
      }
    }
    return record
  }

  /** Stop one tunnel by id. Returns whether a process was signalled. */
  stop(id: string): boolean {
    const child = this.children.get(id)
    const record = this.records.get(id)
    if (record !== undefined) record.status = 'stopped'
    if (child === undefined) return false
    this.children.delete(id)
    try {
      child.kill()
      return true
    } catch {
      return false
    }
  }

  /** Stop a raw PID (used for orphans the plugin did not start). */
  async killPid(pid: number): Promise<{ ok: boolean; error?: string }> {
    if (!Number.isInteger(pid) || pid <= 0) return { ok: false, error: 'invalid pid' }
    if (process.platform === 'win32') {
      const r = await run('taskkill', ['/PID', String(pid), '/T', '/F'], 8000)
      if (!r.ok && r.stderr.trim() !== '') return { ok: false, error: r.stderr.trim() }
      return { ok: true }
    }
    const r = await run('kill', ['-TERM', String(pid)], 5000)
    return r.ok ? { ok: true } : { ok: false, error: r.stderr.trim() || 'kill failed' }
  }

  /** Reap everything this plugin started. Used on plugin unload and process exit. */
  stopAll(): void {
    for (const [id, child] of [...this.children.entries()]) {
      const record = this.records.get(id)
      if (record !== undefined) record.status = 'stopped'
      try {
        child.kill()
      } catch {
        // Already gone.
      }
    }
    this.children.clear()
  }

  /** Drop records that are finished, so the list does not grow forever. */
  prune(): void {
    for (const [id, record] of [...this.records.entries()]) {
      if (record.status === 'stopped') this.records.delete(id)
      else if (record.status === 'failed' && Date.now() - record.startedAt > 10 * 60_000) this.records.delete(id)
    }
  }
}

/**
 * Listeners that look like tunnels nobody is tracking: ssh-owned sockets whose
 * PID is not one of ours. This is the exact failure that started the plugin.
 */
export function findOrphanTunnels(scan: ListenerScan, owned: Set<number>): Listener[] {
  if (!scan.ok) return []
  // One ssh process can hold several sockets (it binds both ::1 and 127.0.0.1
  // for a single forward), so collapse by PID and prefer the IPv4 row.
  const byPid = new Map<number, Listener>()
  for (const item of scan.listeners) {
    const proc = (item.process ?? '').toLowerCase()
    if (proc !== 'ssh' && proc !== 'ssh.exe') continue
    if (item.pid === null) continue
    if (owned.has(item.pid)) continue
    const prior = byPid.get(item.pid)
    if (prior === undefined) byPid.set(item.pid, item)
    else if (prior.addr !== '127.0.0.1' && item.addr === '127.0.0.1') byPid.set(item.pid, item)
  }
  return [...byPid.values()]
}

/**
 * Processes that almost always mean a project of ours is listening: language
 * runtimes, web servers and tunnel clients. Desktop apps and OS daemons stay
 * out so the panel only lists things worth tunnelling.
 */
const PROJECT_PROCESS =
  /^(node|nodejs|bun|deno|python[0-9.]*|java|go|php|ruby|dotnet|nginx|caddy|httpd|docker-proxy|uvicorn|gunicorn|jupyter|streamlit|vite|esbuild|frp|frpc|ngrok|cloudflared|ollama)/i

/** Ports a project of ours is likely to pick, whatever its process is called. */
const PROJECT_PORTS = new Set([
  3000, 3001, 4000, 4173, 4200, 5000, 5001, 5173, 5174, 6006, 7000, 7860,
  8000, 8001, 8080, 8081, 8188, 8443, 8888, 9000, 9001, 9090, 10000,
])

/** True when a remote listener looks like something we would open a tunnel to. */
export function isProjectListener(item: Listener): boolean {
  const proc = (item.process ?? '').toLowerCase()
  if (proc !== '' && PROJECT_PROCESS.test(proc)) return true
  return PROJECT_PORTS.has(item.port)
}

/**
 * Split a remote scan into the services we care about and the rest. Sockets are
 * collapsed per port (ss lists one row per address family) so a port shows
 * once, and the totals always describe the whole scan.
 */
export function partitionRemote(
  listeners: Listener[],
): { services: Listener[]; total: number; others: number } {
  const seen = new Map<number, Listener>()
  for (const item of listeners) {
    if (!seen.has(item.port)) seen.set(item.port, item)
  }
  const unique = [...seen.values()]
  const services = unique.filter(isProjectListener)
  return { services, total: unique.length, others: unique.length - services.length }
}
