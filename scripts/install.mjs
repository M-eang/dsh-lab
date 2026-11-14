#!/usr/bin/env node
/**
 * Register dsh-lab into a DSH profile.
 *
 * Three edits, each reversible:
 *   1. node_modules/dsh-lab  → junction to this repo (junction works across
 *      volumes and needs no admin; a true symlink would require elevation).
 *   2. profile/package.json  → "dsh-lab": "link:<repo>" in dependencies.
 *   3. profile/package.json  → "dsh-lab" in dsh.profile.bundles.
 *
 * A timestamped backup of package.json is written before it is touched.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const profileDir = process.argv[2] ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const packagePath = join(profileDir, 'package.json')

if (!existsSync(packagePath)) {
  console.error('profile not found: ' + packagePath)
  process.exit(1)
}

// 1) link the package into the profile
const linkPath = join(profileDir, 'node_modules', 'dsh-lab')
if (!existsSync(linkPath)) {
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    "New-Item -ItemType Junction -Path '" + linkPath + "' -Target '" + repo + "' -ErrorAction Stop | Out-Null",
  ], { stdio: 'inherit' })
  console.log('linked  : ' + linkPath + ' -> ' + repo)
} else {
  console.log('link ok : ' + linkPath)
}

// 2) and 3) register it
const raw = readFileSync(packagePath, 'utf8')
const manifest = JSON.parse(raw)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
cpSync(packagePath, packagePath + '.bak-dsh-lab-' + stamp)
console.log('backup  : ' + packagePath + '.bak-dsh-lab-' + stamp)

manifest.dependencies = manifest.dependencies ?? {}
const wanted = 'link:' + repo.replace(/\\/g, '/')
const changed = []
if (manifest.dependencies['dsh-lab'] !== wanted) {
  manifest.dependencies['dsh-lab'] = wanted
  changed.push('dependencies')
}

const bundles = manifest.dsh?.profile?.bundles
if (!Array.isArray(bundles)) {
  console.error('unexpected profile shape: dsh.profile.bundles missing')
  process.exit(1)
}
if (!bundles.includes('dsh-lab')) {
  bundles.push('dsh-lab')
  changed.push('bundles')
}

if (changed.length === 0) {
  console.log('already registered; nothing to write')
} else {
  writeFileSync(packagePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log('updated : ' + changed.join(', '))
}

// Verify the loader will actually find both halves.
const mainEntry = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).main
const hostFile = join(linkPath, mainEntry)
const clientFile = join(linkPath, 'lib', 'client.js')
console.log('host half  : ' + (existsSync(hostFile) ? 'ok ' + realpathSync(hostFile) : 'MISSING ' + hostFile))
console.log('client half: ' + (existsSync(clientFile) ? 'ok ' : 'MISSING ' + clientFile))
