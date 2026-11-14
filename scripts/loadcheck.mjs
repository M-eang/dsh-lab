/**
 * Loads the built halves the way cordis would, with a stub context, and reports
 * anything that throws. Run with: ELECTRON_RUN_AS_NODE=1 <electron> scripts/loadcheck.mjs
 */
const hostMod = await import(new URL('../lib/index.js', import.meta.url).href)
console.log('host exports :', Object.keys(hostMod).join(','))
console.log('host name    :', hostMod.name)
console.log('host inject  :', JSON.stringify(hostMod.inject))

const calls = []
const stubCtx = {
  effect(fn, label) {
    calls.push('effect:' + label)
    const dispose = fn()
    return () => { if (typeof dispose === 'function') dispose() }
  },
  inject(deps, cb) {
    calls.push('inject:' + deps.join('|'))
    // webServer missing on purpose: the route must simply never mount.
    return cb({ get: () => undefined })
  },
  get() { return undefined },
}
try {
  hostMod.apply(stubCtx, { host: 'lab' })
  console.log('host apply   : ok, calls =', calls.join(' / '))
} catch (e) {
  console.log('host apply   : THREW ' + (e && e.message))
}

// The client half imports react, so only its shape is inspected here.
const { readFileSync } = await import('node:fs')
const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
console.log('client bytes :', clientSrc.length)
console.log('client imports:', [...clientSrc.matchAll(/from\s*"([^"]+)"/g)].map((m) => m[1]).join(','))
console.log('client slots  :', clientSrc.includes('conversation.input.dock'))
console.log('client guard  :', clientSrc.includes('dsh-lab'))
