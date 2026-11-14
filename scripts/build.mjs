#!/usr/bin/env node
/**
 * Builds both halves with the esbuild CLI.
 *
 * The two halves are NOT the same module format, and getting this wrong is
 * silent: a plain ESM client bundle loads without error but never registers.
 *
 *   host   → plain ESM. cordis imports it with a dynamic import().
 *   client → CommonJS wrapped in `window.__ModuleLoader__.load({ id, factory })`.
 *            The web shell hands the factory a `require` that resolves react,
 *            react-dom and react/jsx-runtime. This matches what a shipped
 *            plugin's lib/client.js looks like on disk.
 *
 * The esbuild binary resolves as node_modules/.bin first, then the vendored
 * .tool/package copy, so the build works with no local install.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const PKG = 'dsh-lab'

function esbuildBinary() {
  const candidates = [
    join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'),
    join(root, '.tool', 'package', 'esbuild.exe'),
    join(root, '.tool', 'package', 'bin', 'esbuild'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  console.error('esbuild not found; run: npm i -D esbuild (or vendor it under .tool/)')
  process.exit(1)
}

const banner = [
  'window.__ModuleLoader__.load({',
  '\tid: ' + JSON.stringify(PKG) + ',',
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  '',
].join('\n')

const footer = [
  '',
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n')

const bin = esbuildBinary()
rmSync(join(root, 'lib'), { recursive: true, force: true })
mkdirSync(join(root, 'lib'), { recursive: true })

const targets = [
  ['host', [
    'src/index.ts', '--bundle', '--format=esm', '--platform=node', '--target=es2022',
    '--packages=external', '--outfile=lib/index.js',
  ]],
  ['client', [
    'src/client/index.tsx', '--bundle', '--format=cjs', '--platform=browser', '--target=es2022',
    '--jsx=automatic', '--packages=external', '--outfile=lib/client.js',
    '--banner:js=' + banner, '--footer:js=' + footer,
  ]],
]

for (const [label, args] of targets) {
  const result = spawnSync(bin, args, { stdio: 'inherit', cwd: root })
  if (result.status !== 0) {
    console.error('build failed for ' + label)
    process.exit(result.status ?? 1)
  }
}
console.log('build ok: lib/index.js (esm) + lib/client.js (module-loader cjs)')
