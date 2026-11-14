/**
 * The lab body: the tunnels this plugin opened and the orphan listeners it did
 * not. Every fact comes from /lab/state, so the page can never disagree with the
 * host about what is running.
 * @module dsh-lab/client/LabBody
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchState, killPid, stopTunnel, type LabState } from './api.ts'
import { ensureStyles } from './styles.ts'
import { formatAge } from './util.ts'

/** Panel body; owns its own poll so the page stays live without the shell. */
export function LabBody(): JSX.Element {
  ensureStyles()
  const [state, setState] = useState<LabState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchState()
      setState(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = (): void => {
      if (alive) void refresh()
    }
    tick()
    const timer = setInterval(tick, 5000)
    return (): void => {
      alive = false
      clearInterval(timer)
    }
  }, [refresh])

  const act = useCallback(
    async (key: string, fn: () => Promise<unknown>): Promise<void> => {
      setBusy(key)
      try {
        await fn()
        await refresh()
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [refresh],
  )

  const tunnels = state?.tunnels ?? []
  const orphans = state?.local.orphans ?? []

  return (
    <div className="dsh-lab-body">
      {error !== null ? <div className="dsh-lab-err">{error}</div> : null}

      <div className="dsh-lab-stats">
        <div className="dsh-lab-stat">
          <span className="dsh-lab-stat-value">{String(tunnels.length)}</span>
          <span className="dsh-lab-stat-label">隧道在跑</span>
        </div>
        <div className="dsh-lab-stat">
          <span className="dsh-lab-stat-value">{String(orphans.length)}</span>
          <span className="dsh-lab-stat-label">孤儿监听</span>
        </div>
        <div className="dsh-lab-stat">
          <span className="dsh-lab-stat-value">{String(state?.local.total ?? 0)}</span>
          <span className="dsh-lab-stat-label">
            {'本机监听 · ssh ' + String(state?.local.sshListeners ?? 0)}
          </span>
        </div>
      </div>

      <div className="dsh-lab-section">
        <div className="dsh-lab-section-head">
          <span className="dsh-lab-section-title">我的隧道</span>
          <span className="dsh-lab-chip">{String(tunnels.length) + ' 条'}</span>
          <span className="dsh-lab-spacer" />
          <button
            type="button"
            className="dsh-lab-btn danger"
            disabled={busy !== null || !tunnels.some((t) => t.status === 'up')}
            onClick={() => void act('stop-all', async () => {
              for (const t of tunnels) {
                if (t.status === 'up') await stopTunnel(t.id)
              }
            })}
          >
            全部停止
          </button>
        </div>
        {tunnels.length === 0 ? (
          <div className="dsh-lab-empty">没有隧道在跑</div>
        ) : (
          tunnels.map((t) => (
            <div className="dsh-lab-row" key={t.id}>
              <span className={'dsh-lab-dot ' + (t.status === 'up' ? 'ok' : t.status === 'failed' ? 'bad' : 'warn')} />
              <span className="dsh-lab-mono">:{t.localPort} → {t.host}:{t.remotePort}</span>
              <span className="dsh-lab-chip">pid {t.pid}</span>
              <span className="dsh-lab-chip">{formatAge(t.startedAt)}</span>
              {t.status === 'failed' && t.error !== undefined ? (
                <span className="dsh-lab-err" title={t.error}>{t.error.slice(0, 48)}</span>
              ) : null}
              <span className="dsh-lab-spacer" />
              {t.status === 'up' ? (
                <a className="dsh-lab-btn" href={'http://127.0.0.1:' + String(t.localPort) + '/'} target="_blank" rel="noreferrer">打开</a>
              ) : null}
              <button type="button" className="dsh-lab-btn danger" disabled={busy !== null} onClick={() => void act(t.id, () => stopTunnel(t.id))}>
                停止
              </button>
            </div>
          ))
        )}
      </div>

      <div className="dsh-lab-section">
        <div className="dsh-lab-section-head">
          <span className="dsh-lab-section-title">孤儿监听</span>
          <span className="dsh-lab-chip">不是插件开的 ssh</span>
          <span className="dsh-lab-spacer" />
          <span className="dsh-lab-chip">{String(orphans.length) + ' 个'}</span>
        </div>
        {orphans.length === 0 ? (
          <div className="dsh-lab-empty">干净</div>
        ) : (
          orphans.map((o) => (
            <div className="dsh-lab-row" key={String(o.pid) + ':' + String(o.port)}>
              <span className="dsh-lab-dot bad" />
              <span className="dsh-lab-mono">{o.addr}:{o.port}</span>
              <span className="dsh-lab-chip">{o.process ?? 'ssh'} pid {String(o.pid)}</span>
              <span className="dsh-lab-spacer" />
              <button
                type="button"
                className="dsh-lab-btn danger"
                disabled={busy !== null || o.pid === null}
                onClick={() => void act('kill-' + String(o.pid), () => killPid(Number(o.pid)))}
              >
                杀掉
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
