/**
 * The plugin's HTTP surface, mounted as one prefix route on the shared web
 * server. Four verbs' worth of work: read state, open a tunnel, close a tunnel,
 * kill an orphan.
 * @module dsh-lab/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isTrustedRequest, readBoundedJson, writeJson } from './http.ts'
import {
  TunnelManager,
  findOrphanTunnels,
  probePort,
  resolveSsh,
  scanLocalListeners,
  scanRemoteListeners,
  partitionRemote,
  type Listener,
  type TunnelRecord,
} from './ssh.ts'

/** Prefix the route is mounted under. */
export const LAB_PREFIX = '/lab'

/** Body cap for the POST routes. */
const BODY_CAP = 16 * 1024

/** Remote scan cache: ssh is expensive, and the UI polls. */
const REMOTE_TTL_MS = 15_000

/** Deployed defaults; a settings UI can grow over these later. */
export interface LabConfig {
  /** ssh config Host alias of the lab box. */
  host: string
  /** Local ports the UI offers as one-click tunnel suggestions. */
  suggestedRemotePorts: number[]
}

const DEFAULTS: LabConfig = { host: 'lab', suggestedRemotePorts: [3000, 5173, 8000, 8888] }

/**
 * One manager per process, parked on globalThis: a hot reload replaces the
 * module but must NOT forget the children it is still responsible for.
 */
const MANAGER_KEY = Symbol.for('dsh-lab.tunnel-manager')
const CACHE_KEY = Symbol.for('dsh-lab.remote-cache')

function manager(): TunnelManager {
  const store = globalThis as unknown as Record<symbol, unknown>
  const existing = store[MANAGER_KEY]
  if (existing instanceof TunnelManager) return existing
  const created = new TunnelManager()
  store[MANAGER_KEY] = created
  return created
}

interface RemoteCache {
  at: number
  host: string
  ok: boolean
  services: Listener[]
  error?: string
}

function remoteCache(): { get(host: string): RemoteCache | null; set(value: RemoteCache): void } {
  const store = globalThis as unknown as Record<symbol, unknown>
  let slot = store[CACHE_KEY] as RemoteCache | undefined
  return {
    get(host: string): RemoteCache | null {
      if (slot === undefined || slot.host !== host) return null
      if (Date.now() - slot.at > REMOTE_TTL_MS) return null
      return slot
    },
    set(value: RemoteCache): void {
      slot = value
      store[CACHE_KEY] = value
    },
  }
}

/** Shape the browser half reads; everything it renders comes from here. */
export interface LabState {
  host: string
  sshBinary: string
  tunnels: (TunnelRecord & { reachable: boolean })[]
  local: {
    ok: boolean
    total: number
    sshListeners: number
    orphans: Listener[]
    error?: string
  }
  remote: {
    ok: boolean
    services: Listener[]
    total: number
    others: number
    cached: boolean
    error?: string
  }
  suggestions: { localPort: number; remotePort: number; label: string }[]
  checkedAt: number
}

/** Collect the full cockpit state. */
async function readState(config: LabConfig, forceRemote: boolean, showAll: boolean): Promise<LabState> {
  const tunnels = manager()
  tunnels.prune()
  const [localScan, reachableFlags] = await Promise.all([
    scanLocalListeners(),
    Promise.all(tunnels.list().map((t) => probePort(t.localPort).catch(() => false))),
  ])
  const owned = tunnels.ownedPids()
  const orphans = findOrphanTunnels(localScan, owned)

  // Only an explicit ?remote=1 pays for an ssh round-trip; the page no longer
  // shows remote services, so the 5 s poll stays local and cheap.
  const cache = remoteCache()
  let remote = forceRemote ? null : cache.get(config.host)
  let cached = remote !== null
  if (remote === null && forceRemote) {
    const scan = await scanRemoteListeners(config.host)
    remote = { at: Date.now(), host: config.host, ok: scan.ok, services: scan.listeners, error: scan.error }
    cache.set(remote)
    cached = false
  }
  if (remote === null) {
    remote = { at: 0, host: config.host, ok: true, services: [] }
  }

  // Default view hides OS daemons and desktop apps; ?all=1 shows everything.
  const split = partitionRemote(remote.services)
  const visible = showAll ? [...new Map(remote.services.map((s) => [s.port, s])).values()] : split.services

  const records = tunnels.list()
  const suggestions = config.suggestedRemotePorts
    .filter((port) => (remote?.services ?? []).some((s) => s.port === port))
    .map((port) => ({ localPort: port, remotePort: port, label: 'remote :' + String(port) }))

  return {
    host: config.host,
    sshBinary: resolveSsh(),
    tunnels: records.map((rec, index) => ({ ...rec, reachable: reachableFlags[index] === true })),
    local: {
      ok: localScan.ok,
      total: localScan.listeners.length,
      sshListeners: localScan.listeners.filter((l) => (l.process ?? '').toLowerCase().startsWith('ssh')).length,
      orphans,
      ...(localScan.error !== undefined ? { error: localScan.error } : {}),
    },
    remote: {
      ok: remote.ok,
      services: visible,
      total: split.total,
      others: split.others,
      cached,
      ...(remote.error !== undefined ? { error: remote.error } : {}),
    },
    suggestions,
    checkedAt: Date.now(),
  }
}

/** Strip the mount prefix so both prefixed and bare paths resolve. */
function routeOf(pathname: string): string {
  if (pathname === LAB_PREFIX) return '/'
  if (pathname.startsWith(LAB_PREFIX + '/')) return pathname.slice(LAB_PREFIX.length)
  return pathname
}

/** Handle one request against the lab prefix. */
export async function serveLab(
  ctx: Context,
  config: LabConfig,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isTrustedRequest(req)) {
    writeJson(res, 403, { error: 'lab routes are loopback-only' })
    return
  }
  const url = new URL(req.url ?? '/', 'http://x')
  const route = routeOf(url.pathname)
  const method = (req.method ?? 'GET').toUpperCase()

  try {
    if (method === 'GET' && route === '/state') {
      writeJson(res, 200, await readState(config, url.searchParams.get('remote') === '1', url.searchParams.get('all') === '1'))
      return
    }

    if (method === 'POST' && route === '/tunnel') {
      const body = await readBoundedJson(req, BODY_CAP)
      const parsed = parseTunnelBody(body, config)
      if ('error' in parsed) {
        writeJson(res, 400, parsed)
        return
      }
      const occupied = await probePort(parsed.localPort)
      if (occupied) {
        writeJson(res, 409, { error: 'local port ' + String(parsed.localPort) + ' is already in use' })
        return
      }
      const record = await manager().start(parsed)
      writeJson(res, record.status === 'up' ? 200 : 502, record)
      return
    }

    if (method === 'POST' && route === '/stop') {
      const body = await readBoundedJson(req, BODY_CAP)
      const id = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).id : undefined
      if (typeof id !== 'string' || id === '') {
        writeJson(res, 400, { error: 'id is required' })
        return
      }
      const stopped = manager().stop(id)
      writeJson(res, stopped ? 200 : 404, { stopped })
      return
    }

    if (method === 'POST' && route === '/kill') {
      const body = await readBoundedJson(req, BODY_CAP)
      const pidRaw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).pid : undefined
      const pid = Number(pidRaw)
      const result = await manager().killPid(pid)
      writeJson(res, result.ok ? 200 : 500, result)
      return
    }

    if (method === 'POST' && route === '/stop-all') {
      manager().stopAll()
      writeJson(res, 200, { stopped: true })
      return
    }

    writeJson(res, 404, { error: 'unknown lab route: ' + route })
  } catch (e) {
    writeJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

/** Validate a tunnel request body. */
function parseTunnelBody(
  body: unknown,
  config: LabConfig,
): { host: string; localPort: number; remoteHost: string; remotePort: number } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'expected a JSON object' }
  const rec = body as Record<string, unknown>
  const localPort = Number(rec.localPort)
  const remotePort = Number(rec.remotePort)
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) return { error: 'localPort must be 1-65535' }
  if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) return { error: 'remotePort must be 1-65535' }
  const host = typeof rec.host === 'string' && rec.host.trim() !== '' ? rec.host.trim() : config.host
  const remoteHost = typeof rec.remoteHost === 'string' && rec.remoteHost.trim() !== '' ? rec.remoteHost.trim() : '127.0.0.1'
  if (!/^[A-Za-z0-9._-]+$/.test(host)) return { error: 'host must be a plain ssh alias' }
  if (!/^[A-Za-z0-9.:_-]+$/.test(remoteHost)) return { error: 'remoteHost has invalid characters' }
  return { host, localPort, remoteHost, remotePort }
}

export { DEFAULTS }
