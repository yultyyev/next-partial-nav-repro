// Warm the cache with a PREFETCH response for /target — what any shared cache
// sitting in front of a Next app accumulates under normal prefetch traffic.
const res = await fetch('http://127.0.0.1:3000/target?_rsc=seed', {
  headers: { RSC: '1', 'Next-Router-Prefetch': '2' },
})
const body = Buffer.from(await res.arrayBuffer())
const first = String.fromCharCode(body[0])
console.log(
  `seeded: HTTP ${res.status} cache=${res.headers.get('x-repro-cache')} ` +
    `bytes=${body.length} firstByte='${first}' ` +
    `(${first === '~' ? 'PARTIAL by design — prefetch of a PPR route' : 'unexpected'})`
)
