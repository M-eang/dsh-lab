/**
 * The lab as a global panel: the sidebar row selects it and the main column
 * renders it whole, the way the plugin manager and the memory page work. The
 * body keeps its own poll, so this shell only owns the title row.
 * @module dsh-lab/client/LabPanel
 */

import { useEffect, useState } from 'react'
import { fetchState, type LabState } from './api.ts'
import { LabBody } from './LabBody.tsx'
import { ensureStyles } from './styles.ts'

/** Main-column page. Runtime props are ignored on purpose. */
export function LabPanel(_props: Record<string, unknown>): JSX.Element {
  ensureStyles()
  const [host, setHost] = useState<LabState | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    void fetchState()
      .then((next) => {
        if (alive) setHost(next)
      })
      .catch(() => undefined)
    return (): void => {
      alive = false
    }
  }, [tick])

  return (
    <div className="dsh-lab-page">
      <div className="dsh-lab-page-head">
        <span className="dsh-lab-page-title">实验室</span>
        <span className="dsh-lab-page-sub">
          {host === null
            ? '正在读取笔记本…'
            : '主机 ' + host.host + ' · 本机监听 ' + String(host.local.total) + ' 个'}
        </span>
        <span className="dsh-lab-spacer" />
        <button type="button" className="dsh-lab-btn" onClick={() => setTick((v) => v + 1)}>
          刷新
        </button>
      </div>
      <div className="dsh-lab-page-body">
        <LabBody />
      </div>
    </div>
  )
}
