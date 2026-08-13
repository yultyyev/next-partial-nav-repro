// One-shot: build if needed, start both servers, seed the cache, click the
// link in headless Chromium, report, clean up. Requires:
//   npx playwright install chromium   (one time)
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'

const portFree = p =>
  new Promise(res => {
    const s = net.createServer()
      .once('error', () => res(false))
      .once('listening', () => s.close(() => res(true)))
      .listen(p, '127.0.0.1')
  })
const run = (cmd, args) =>
  new Promise((res, rej) => {
    const c = spawn(cmd, args, { stdio: 'inherit' })
    c.on('exit', code => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))))
  })

if (!existsSync('.next/BUILD_ID')) {
  console.log('no build found — running next build first\n')
  await run('./node_modules/.bin/next', ['build'])
}
for (const p of [3000, 3001]) {
  if (!(await portFree(p))) {
    console.error(`port ${p} is busy — stop whatever is using it and rerun`)
    process.exit(1)
  }
}

const kids = []
const bg = (cmd, args) => kids.push(spawn(cmd, args, { stdio: 'ignore' }))
const cleanup = () => kids.forEach(c => { try { c.kill() } catch {} })
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

bg('./node_modules/.bin/next', ['start', '-p', '3001'])
bg('node', ['cache-proxy.mjs'])
const wait = async url => {
  for (let i = 0; i < 100; i++) {
    try { await fetch(url); return } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('timed out waiting for ' + url)
}
await wait('http://127.0.0.1:3001/')
await wait('http://127.0.0.1:3000/')

await import('./seed.mjs')
await import('./crash.mjs') // prints the verdict and sets the exit code
