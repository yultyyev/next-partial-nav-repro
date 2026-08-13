// Runs both servers in one terminal: Next (:3001) and the cache proxy (:3000).
import { spawn } from 'node:child_process'

const kids = []
const bg = (cmd, args, name) => {
  const c = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  c.stdout.on('data', d => process.stdout.write(`[${name}] ${d}`))
  c.stderr.on('data', d => process.stderr.write(`[${name}] ${d}`))
  kids.push(c)
}
const cleanup = () => kids.forEach(c => { try { c.kill() } catch {} })
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

bg('./node_modules/.bin/next', ['start', '-p', '3001'], 'next')
bg('node', ['cache-proxy.mjs'], 'cache')

const wait = async url => {
  for (let i = 0; i < 100; i++) {
    try { await fetch(url); return } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('timed out waiting for ' + url)
}
await wait('http://127.0.0.1:3001/')
await wait('http://127.0.0.1:3000/')
console.log('\nready — run `npm run seed`, then open http://localhost:3000 and click the link\n')
