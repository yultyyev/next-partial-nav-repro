// Headless check of the server-side half: a navigation-shaped request now
// receives the stored partial payload. (The crash itself is client-side —
// see README step 5.)
const nav = await fetch('http://127.0.0.1:3000/target?_rsc=nav', {
  headers: { RSC: '1' },
})
const body = Buffer.from(await nav.arrayBuffer())
const first = String.fromCharCode(body[0])
console.log(
  `navigation-shaped request: HTTP ${nav.status} cache=${nav.headers.get('x-repro-cache')} ` +
    `bytes=${body.length} firstByte='${first}'`
)
console.log(
  first === '~'
    ? '=> the navigation was served a PARTIAL payload. A real router navigation consuming this crashes with React #412.'
    : '=> complete payload — run `npm run seed` first.'
)
const doc = await fetch('http://127.0.0.1:3000/target')
console.log(`document request:           HTTP ${doc.status} cache=${doc.headers.get('x-repro-cache')} (direct open works)`)
