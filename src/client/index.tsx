/**
 * Browser half: one global panel. The sidebar's panel row selects it and the
 * main column renders it — the same seat the plugin manager and the memory page
 * take — so the lab is a page of its own, not a right-hand tab.
 * Every wiring step is guarded: a throw here fails the whole web boot, which is
 * far worse than a missing page.
 * @module dsh-lab/client
 */

import type { Context } from '@deepseek-ai/cordis'
import { LabPanel } from './LabPanel.tsx'

/** Plugin row name, mirrored from the host half. */
export const name = 'lab'

/** Nothing is a hard dependency for a pure UI addition. */
export const inject: string[] = []

/** Sidebar row id, main-column key and the page's own identity are one value. */
const PANEL_ID = 'dsh-lab'

interface SlotsFace {
  inject(name: string, callback: () => unknown): unknown
  register(spec: Record<string, unknown>, component: unknown): unknown
}

/** One page lifetime may register the panel only once. */
let mounted = false

/** Log without taking the boot down. */
function report(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error)
  console.warn('[dsh-lab] ' + message + ': ' + detail)
}

/** A flask, drawn at the edge the sidebar asks for. */
function LabPanelIcon(props: { size?: number }): JSX.Element {
  const size = props.size ?? 16
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.2 1.6h3.6M6.8 1.6v4.1L3.4 11.9a1.35 1.35 0 0 0 1.16 2.05h6.88a1.35 1.35 0 0 0 1.16-2.05L9.2 5.7V1.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.9 9.9h6.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** Register the page in the main column and its row in the sidebar. */
function mount(slots: SlotsFace): undefined {
  if (mounted) return undefined
  mounted = true
  try {
    slots.inject('main', () =>
      slots.register({ name: 'main', key: PANEL_ID }, LabPanel as never),
    )
  } catch (e) {
    report('cannot register the main panel', e)
  }
  try {
    slots.inject('sidebar.panellist', () =>
      slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => '实验室' },
        LabPanelIcon as never,
      ),
    )
  } catch (e) {
    report('cannot register the sidebar row', e)
  }
  return undefined
}

/** Browser entry point. */
export function apply(ctx: Context): void {
  try {
    ctx.inject(['slots'], (slotsCtx: Context) => {
      const face = slotsCtx as unknown as {
        slots?: SlotsFace
        effect?: (fn: () => unknown, label: string) => unknown
      }
      const slots = face.slots
      if (slots === undefined) {
        console.warn('[dsh-lab] slots are not available, the lab page stays hidden')
        return
      }
      const wire = (): undefined => mount(slots)
      if (typeof face.effect === 'function') face.effect(wire, 'lab.panel')
      else wire()
    })
  } catch (e) {
    report('cannot attach the lab page', e)
  }
}
