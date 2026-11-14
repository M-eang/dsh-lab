/**
 * Small HTTP helpers for the plugin's host routes, plus the loopback fence.
 * Every route here can spawn processes, so only this machine may call it.
 * @module dsh-lab/http
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Hostnames a browser or local process may use to reach the loopback server. */
const TRUSTED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

/** Whether the request arrived on a loopback socket address. */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Strip the port (and IPv6 brackets) from a Host header value. */
function hostnameOf(hostHeader: string): string {
  const trimmed = hostHeader.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    return end === -1 ? trimmed : trimmed.slice(1, end)
  }
  const colon = trimmed.lastIndexOf(':')
  return colon === -1 ? trimmed : trimmed.slice(0, colon)
}

/**
 * Reject cross-site callers: the socket must be loopback, the Host header must
 * name loopback, and an Origin (when present) must too. A missing Origin is
 * fine — that is a direct fetch or curl, not a browser page.
 */
export function isTrustedRequest(req: IncomingMessage): boolean {
  if (!isLoopbackRequest(req)) return false
  const host = req.headers.host
  if (typeof host === 'string' && host !== '') {
    if (!TRUSTED_HOSTNAMES.has(hostnameOf(host))) return false
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    try {
      if (!TRUSTED_HOSTNAMES.has(new URL(origin).hostname.toLowerCase())) return false
    } catch {
      return false
    }
  }
  return true
}

/** Write one JSON response with caching disabled. */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(text)
}

/** Read a bounded JSON body; oversized or malformed input is an error, never a hang. */
export function readBoundedJson(req: IncomingMessage, capBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > capBytes) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (e) {
        reject(new Error('invalid JSON body: ' + (e instanceof Error ? e.message : String(e))))
      }
    })
    req.on('error', reject)
  })
}
