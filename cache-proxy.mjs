// A deliberately ordinary shared cache in front of Next — the behavior of a
// CDN with "ignore query string" enabled and default Vary handling:
//   - cache key = URL PATHNAME only (query string ignored)
//   - Vary is ignored (Cloudflare, for one, ignores Vary by default)
//   - only text/x-component (RSC) responses are cached; HTML passes through
//
// Consequence: a stored PREFETCH payload (partial by design for a PPR route)
// is served to a later NAVIGATION request for the same pathname.
import http from 'node:http'

const UPSTREAM = 'http://127.0.0.1:3001'
const cache = new Map() // pathname -> {status, headers, body}

http
  .createServer(async (req, res) => {
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
  })
  .listen(3000, () => console.log('cache proxy on :3000 → next on :3001'))
