/**
 * Typed client for the host routes. Every call is same-origin and loopback,
 * so plain fetch is enough; failures surface as thrown Errors the panel shows.
 * @module dsh-lab/client/api
 */

export interface TunnelView {
  id: string
  host: string
  localPort: number
  remoteHost: string
  remotePort: number
  pid: number
  startedAt: number
  status: 'starting' | 'up' | 'failed' | 'stopped'
  error?: string
  reachable: boolean
}

export interface ListenerView {
  addr: string
  port: number
  pid: number | null
  process: string | null
}

export interface LabState {
  host: string
  sshBinary: string
  tunnels: TunnelView[]
  local: { ok: boolean; total: number; sshListeners: number; orphans: ListenerView[]; error?: string }
  remote: {
    ok: boolean
    services: ListenerView[]
    total: number
    others: number
    cached: boolean
    error?: string
  }
  suggestions: { localPort: number; remotePort: number; label: string }[]
  checkedAt: number
}

const BASE = '/lab'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'same-origin',
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text === '' ? null : JSON.parse(text)
  } catch {
    throw new Error('lab route returned non-JSON: ' + text.slice(0, 120))
  }
  if (!res.ok) {
    const message = typeof parsed === 'object' && parsed !== null && typeof (parsed as { error?: unknown }).error === 'string'
      ? (parsed as { error: string }).error
      : 'HTTP ' + String(res.status)
    throw new Error(message)
  }
  return parsed as T
}

/**
 * Full cockpit snapshot. `force` bypasses the host's remote scan cache, `all`
 * lists every remote listener instead of only development services.
 */
export function fetchState(force = false, all = false): Promise<LabState> {
  const query = new URLSearchParams()
  if (force) query.set('remote', '1')
  if (all) query.set('all', '1')
  const search = query.toString()
  return call<LabState>('/state' + (search === '' ? '' : '?' + search))
}

/** Open a tunnel from a local port to a port on the lab box. */
export function openTunnel(localPort: number, remotePort: number, remoteHost = '127.0.0.1'): Promise<TunnelView> {
  return call<TunnelView>('/tunnel', { method: 'POST', body: JSON.stringify({ localPort, remotePort, remoteHost }) })
}

/** Stop a tunnel this plugin owns. */
export function stopTunnel(id: string): Promise<{ stopped: boolean }> {
  return call<{ stopped: boolean }>('/stop', { method: 'POST', body: JSON.stringify({ id }) })
}

/** Kill any PID, used for orphan ssh listeners. */
export function killPid(pid: number): Promise<{ ok: boolean; error?: string }> {
  return call<{ ok: boolean; error?: string }>('/kill', { method: 'POST', body: JSON.stringify({ pid }) })
}
