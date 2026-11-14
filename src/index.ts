/**
 * dsh-lab host half: mounts the cockpit route on the shared web server and
 * keeps ownership of every tunnel process this plugin spawns.
 * @module dsh-lab
 */

import type { Context } from '@deepseek-ai/cordis'
import { LAB_PREFIX, DEFAULTS, serveLab, type LabConfig } from './routes.ts'
import { TunnelManager } from './ssh.ts'

/** Plugin row name shown in the DSH plugin list. */
export const name = 'lab'

/**
 * Re-exported for smoke tests and local debugging (`scripts/selfcheck.mjs`).
 * Harmless to the host: extra exports are just names on the module record.
 */
export {
  TunnelManager,
  findOrphanTunnels,
  parseSsListeners,
  probePort,
  resolveSsh,
  scanLocalListeners,
  scanRemoteListeners,
} from './ssh.ts'

/**
 * No hard service dependency: the route is wired through `ctx.inject`, so a
 * composition without a web server simply never mounts, instead of failing boot.
 */
export const inject: string[] = []

/** Live mount bookkeeping, so a rebuilt web server is re-mounted exactly once. */
interface Mount {
  webserver: unknown
  dispose: () => void
}
const mounts = new WeakMap<Context, Mount>()

const MANAGER_KEY = Symbol.for('dsh-lab.tunnel-manager')

/** The process-wide manager, shared with the route layer. */
function manager(): TunnelManager {
  const store = globalThis as unknown as Record<symbol, unknown>
  const existing = store[MANAGER_KEY]
  if (existing instanceof TunnelManager) return existing
  const created = new TunnelManager()
  store[MANAGER_KEY] = created
  return created
}

/** Resolve config, letting an env override win for quick manual runs. */
function resolveConfig(raw: unknown): LabConfig {
  const base: LabConfig = { ...DEFAULTS }
  if (typeof raw === 'object' && raw !== null) {
    const rec = raw as Record<string, unknown>
    if (typeof rec.host === 'string' && rec.host.trim() !== '') base.host = rec.host.trim()
    if (Array.isArray(rec.suggestedRemotePorts)) {
      const ports = rec.suggestedRemotePorts.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536)
      if (ports.length > 0) base.suggestedRemotePorts = ports
    }
  }
  const envHost = process.env.DSH_LAB_HOST
  if (typeof envHost === 'string' && envHost.trim() !== '') base.host = envHost.trim()
  return base
}

/** Plugin entry point. */
export function apply(ctx: Context, config?: unknown): void {
  const resolved = resolveConfig(config)

  // Reap our children when DSH goes away, so no tunnel outlives the UI.
  ctx.effect(() => {
    const onExit = (): void => {
      manager().stopAll()
    }
    process.once('exit', onExit)
    return (): void => {
      process.off('exit', onExit)
      manager().stopAll()
    }
  }, 'lab: tunnel lifetime')

  ctx.inject(['webServer'], (routeCtx: Context) => {
    const webserver = routeCtx.get('webServer') as unknown as { register(route: unknown): unknown } | undefined
    if (webserver === undefined) return
    const existing = mounts.get(ctx)
    if (existing !== undefined && existing.webserver === webserver) return
    if (existing !== undefined) {
      try {
        existing.dispose()
      } catch {
        // Torn down with the old service.
      }
      mounts.delete(ctx)
    }
    routeCtx.effect(() => {
      const dispose = webserver.register({
        kind: 'prefix',
        path: LAB_PREFIX,
        handler: (req: Parameters<typeof serveLab>[2], res: Parameters<typeof serveLab>[3]): Promise<void> =>
          serveLab(ctx, resolved, req, res),
      })
      const disposed = typeof dispose === 'function' ? (dispose as () => void) : (): void => {}
      mounts.set(ctx, { webserver, dispose: disposed })
      return (): void => {
        if (mounts.get(ctx)?.dispose === disposed) mounts.delete(ctx)
        try {
          disposed()
        } catch {
          // Already gone.
        }
      }
    }, 'lab: cockpit route')
  })
}
