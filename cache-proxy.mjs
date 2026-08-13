// A DELIBERATELY NON-COMPLIANT shared cache. It is not a model of a correct
// CDN — it is a deterministic delivery vehicle that hands the router's
// NAVIGATION reader a payload Next itself produced for a PREFETCH.
//
// To do that it knowingly bypasses all three defenses Next ships against
// exactly this confusion (see README — the point of the repro is what the
// CLIENT does when a partial payload arrives anyway):
//   1. `Cache-Control: private, no-cache, no-store …` on RSC responses — ignored
//   2. the `?_rsc=<hash>` per-variant cache-buster — defeated by keying on
//      pathname only (query string ignored)
//   3. `Vary: rsc, next-router-prefetch, …` — ignored
//
// Effective cache key: (pathname, request-has-RSC-header). Only
// text/x-component responses are stored; documents always pass through.
import http from 'node:http'

const UPSTREAM = 'http://127.0.0.1:3001'
const cache = new Map() // pathname -> {status, headers, body}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')
      const key = url.pathname
      const isRsc = !!req.headers['rsc']

      if (isRsc && cache.has(key)) {
        const hit = cache.get(key)
        res.writeHead(hit.status, { ...hit.headers, 'x-repro-cache': 'HIT' })
        res.end(hit.body)
        return
      }

      const upstream = await fetch(UPSTREAM + req.url, {
        headers: { ...req.headers, host: '127.0.0.1:3001', 'accept-encoding': 'identity' },
        redirect: 'manual',
      })
      const body = Buffer.from(await upstream.arrayBuffer())
      const headers = {}
      for (const [k, v] of upstream.headers) {
        if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) headers[k] = v
      }
      const ct = upstream.headers.get('content-type') || ''
      let status = 'PASS'
      if (isRsc && upstream.status === 200 && ct.startsWith('text/x-component')) {
        cache.set(key, { status: upstream.status, headers, body })
        status = 'STORE'
      }
      res.writeHead(upstream.status, { ...headers, 'x-repro-cache': status })
      res.end(body)
    } catch (err) {
      res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`cache-proxy error (is next running on :3001?): ${err?.message}`)
    }
  })
  .listen(3000, () => console.log('cache proxy on :3000 → next on :3001'))
