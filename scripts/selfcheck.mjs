/**
 * Smoke test run outside DSH: exercises the host half's scanning code against
 * the real machine and the real lab box. Not part of the shipped bundle.
 */
import { findOrphanTunnels, parseSsListeners, probePort, resolveSsh, scanLocalListeners, scanRemoteListeners, TunnelManager } from '../lib/index.js'

const host = process.env.DSH_LAB_HOST ?? 'lab'
console.log('ssh binary :', resolveSsh())
console.log('--- local listeners ---')
const local = await scanLocalListeners()
console.log('ok:', local.ok, 'count:', local.listeners.length, local.error ?? '')
console.log('ssh-owned:', local.listeners.filter((l) => (l.process ?? '').toLowerCase().startsWith('ssh')).map((l) => l.addr + ':' + l.port + ' pid=' + String(l.pid)))
const manager = new TunnelManager()
console.log('orphans:', findOrphanTunnels(local, manager.ownedPids()).map((l) => l.addr + ':' + l.port + ' pid=' + String(l.pid)))

console.log('--- remote listeners (' + host + ') ---')
const remote = await scanRemoteListeners(host)
console.log('ok:', remote.ok, 'count:', remote.listeners.length, remote.error ?? '')
for (const item of remote.listeners.slice(0, 12)) {
  console.log('  ', item.addr + ':' + item.port, item.process ?? '-')
}

console.log('--- parse fixtures ---')
console.log(JSON.stringify(parseSsListeners('LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=4242,fd=18))')))
console.log(JSON.stringify(parseSsListeners('LISTEN 0 128 0.0.0.0:22 0.0.0.0:*')))

console.log('--- probe ---')
console.log('probe 22   :', await probePort(22))
console.log('probe 65500:', await probePort(65500, '127.0.0.1', 600))
