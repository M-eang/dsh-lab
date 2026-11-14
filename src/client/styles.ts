/**
 * One injected stylesheet — the plugin ships no CSS build step. Variables are
 * scoped to the cockpit so the host shell's theme is untouched, with a light
 * override so it follows the OS.
 * @module dsh-lab/client/styles
 */

const STYLE_ID = 'dsh-lab-styles'

export const CSS = `
.dsh-lab-bar {
  --lab-fg: #e6e8ee;
  --lab-dim: rgba(230, 232, 238, 0.55);
  --lab-border: rgba(127, 127, 127, 0.3);
  --lab-bg: rgba(31, 33, 39, 0.92);
  --lab-ok: #6ee7a8;
  --lab-warn: #e8c07d;
  --lab-bad: #ffb4a8;
  --lab-accent: #7cc4ff;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lab-dim);
  border-top: 1px solid var(--lab-border);
  background: transparent;
  user-select: none;
}
@media (prefers-color-scheme: light) {
  .dsh-lab-bar {
    --lab-fg: #1c1e24;
    --lab-dim: rgba(28, 30, 36, 0.6);
    --lab-border: rgba(0, 0, 0, 0.12);
    --lab-bg: rgba(255, 255, 255, 0.96);
    --lab-ok: #1a7f4b;
    --lab-warn: #9a6a12;
    --lab-bad: #b3261e;
    --lab-accent: #1665c0;
  }
}
.dsh-lab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lab-dim);
  flex: none;
}
.dsh-lab-dot.ok { background: var(--lab-ok); }
.dsh-lab-dot.warn { background: var(--lab-warn); }
.dsh-lab-dot.bad { background: var(--lab-bad); }
.dsh-lab-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--lab-border);
  color: var(--lab-dim);
  background: transparent;
  font-size: 11px;
}
.dsh-lab-chip.bad { color: var(--lab-bad); border-color: currentColor; }
.dsh-lab-btn {
  border: 1px solid var(--lab-border);
  background: transparent;
  color: var(--lab-fg);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  line-height: 1.6;
}
.dsh-lab-btn:hover:not(:disabled) { background: var(--lab-bg); }
.dsh-lab-btn:disabled { opacity: 0.45; cursor: default; }
.dsh-lab-btn.primary { color: var(--lab-accent); border-color: currentColor; }
.dsh-lab-btn.danger { color: var(--lab-bad); border-color: currentColor; }
.dsh-lab-spacer { flex: 1 1 auto; }

.dsh-lab-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  padding: 24px 16px;
}
.dsh-lab-panel {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: min(76vh, 620px);
  border-radius: 12px;
  border: 1px solid var(--lab-border, rgba(127,127,127,0.35));
  background: var(--lab-bg, #1f2127);
  color: var(--lab-fg, #e6e8ee);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  font-size: 12.5px;
}
.dsh-lab-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(127, 127, 127, 0.25);
}
.dsh-lab-title { font-weight: 600; font-size: 13px; }
.dsh-lab-body { overflow: auto; padding: 10px 14px 14px; }
.dsh-lab-section {
  border: 1px solid var(--lab-border, rgba(127, 127, 127, 0.3));
  border-radius: 12px;
  background: var(--lab-card, rgba(127, 127, 127, 0.07));
  padding: 12px 14px 10px;
  margin-top: 12px;
}
.dsh-lab-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.dsh-lab-section-title {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--lab-fg, #e6e8ee);
}
.dsh-lab-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.dsh-lab-stat {
  border: 1px solid var(--lab-border, rgba(127, 127, 127, 0.3));
  border-radius: 12px;
  background: var(--lab-card, rgba(127, 127, 127, 0.07));
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dsh-lab-stat-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.dsh-lab-stat-label {
  font-size: 11px;
  color: var(--lab-dim, rgba(230, 232, 238, 0.55));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-lab-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(127, 127, 127, 0.14);
}
.dsh-lab-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
.dsh-lab-err { color: var(--lab-bad, #ffb4a8); font-size: 11.5px; }
.dsh-lab-empty { opacity: 0.5; font-size: 11.5px; padding: 4px 0; }
.dsh-lab-form { display: flex; align-items: center; gap: 6px; padding-top: 8px; flex-wrap: wrap; }
.dsh-lab-input {
  width: 88px;
  padding: 3px 7px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  background: transparent;
  color: inherit;
  font-size: 11.5px;
}
.dsh-lab-page {
  --lab-fg: #e6e8ee;
  --lab-dim: rgba(230, 232, 238, 0.55);
  --lab-border: rgba(127, 127, 127, 0.3);
  --lab-bg: rgba(31, 33, 39, 0.92);
  --lab-ok: #6ee7a8;
  --lab-warn: #e8c07d;
  --lab-bad: #ffb4a8;
  --lab-accent: #7cc4ff;
  --lab-card: rgba(127, 127, 127, 0.07);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 20px 24px 16px;
  overflow: hidden;
  font-size: 12.5px;
  color: var(--lab-fg);
  background: transparent;
}
@media (prefers-color-scheme: light) {
  .dsh-lab-page {
    --lab-fg: #1c1e24;
    --lab-dim: rgba(28, 30, 36, 0.6);
    --lab-border: rgba(0, 0, 0, 0.12);
    --lab-bg: rgba(255, 255, 255, 0.96);
    --lab-ok: #1a7f4b;
    --lab-warn: #9a6a12;
    --lab-bad: #b3261e;
    --lab-accent: #1665c0;
    --lab-card: rgba(0, 0, 0, 0.035);
  }
}
.dsh-lab-page-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--lab-border);
}
.dsh-lab-page-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.dsh-lab-page-sub {
  font-size: 11.5px;
  color: var(--lab-dim);
}
.dsh-lab-page-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 2px 4px 10px 0;
}
.dsh-lab-dimtext { opacity: 0.5; }
`

/** Inject the stylesheet once per document. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}