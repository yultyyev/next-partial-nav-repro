# Next.js: navigation crashes with React #412 when served a partial RSC payload

A client-side navigation that receives a **partial Flight payload** — a payload
Next itself produces by design for prefetch requests — crashes with
`Minified React error #412` ("Connection closed.") and renders the terminal
**"This page couldn't load"** screen, instead of falling back to a browser
navigation the way every other transport-level failure in the same code path
does.

Every byte in this repro is produced by Next. The only non-Next component is a
50-line shared cache with two depressingly common CDN behaviors: **cache key =
pathname (query string ignored)** and **`Vary` ignored** (Cloudflare's default,
among others). Under those settings, a stored prefetch response — partial by
design for a Partial Prerender route — is served to a later navigation for the
same path.

## Repro

```bash
npm install
npm run build
npm run start:next    # terminal A — next start on :3001
npm run start:cache   # terminal B — the cache on :3000
npm run seed          # terminal C — store ONE prefetch response in the cache
```

Then open **http://localhost:3000** and click **"go to /target"**.

**Result:** the error screen — *"This page couldn't load. Reload to try again,
or go back."* — with this in the console:

```
Uncaught Error: Minified React error #412; visit https://react.dev/errors/412 …
```

(react's codes.json decodes #412 as **"Connection closed."**)

Meanwhile **direct** navigation works: open http://localhost:3000/target in a
new tab — renders fine. `npm run verify` shows the asymmetry headlessly:

```
seeded: HTTP 200 cache=STORE bytes=3409 firstByte='~' (PARTIAL by design — prefetch of a PPR route)
navigation-shaped request: HTTP 200 cache=HIT bytes=3409 firstByte='~'
document request:           HTTP 200 cache=PASS (direct open works)
```

## Why this is a Next.js bug and not (only) a cache misconfiguration

The router's navigation path already degrades gracefully for every *other*
transport-level failure — all in the same function:

| failure during navigation | router behavior |
|---|---|
| fetch rejects (connection refused, abort) | `Failed to fetch RSC payload … Falling back to browser navigation` |
| deployment-id / build mismatch | MPA fallback |
| response is not `text/x-component` | MPA fallback |
| **stream ends with rows pending** | **uncaught #412 → terminal error screen** |

The partial payload is also not foreign input: it is a **documented, first-party
output format** — prefetch responses of Partial Prerender routes carry the `~`
partial-marker byte, and React's Flight client has
`unstable_allowPartialStream` precisely to consume such streams. Next's own
readers use it:

- `fetch-server-response.ts` — prefetch path: `createFromNextReadableStream(…, { allowPartialStream: true })`
- segment-cache path: `allowPartialStream: true`
- **navigation path**: `createFromNextFetch()` → `createFromFetch({ callServer, findSourceMapURL, debugChannel })` — **no opt-in, no error handling for a stream that closes with pending rows**

In `16.3.0` the navigation branch that *would* pass
`{ allowPartialStream: postponed }` is annotated as reachable only under legacy
PPR and is deleted on canary — so on current versions **no navigation can ever
tolerate or gracefully reject a partial payload**, whatever declares it
(a shared cache, a middlebox, or the server-side conditions tracked in #96339,
which stores halted Flight streams that replay to every reader).

## Suggested fix

When the navigation Flight stream closes with pending rows (or errors), fall
back to a browser navigation — the same recovery the surrounding code already
performs for fetch-level failures. The destination URL renders fine as a
document load (this repro demonstrates that too), so the user cost is one
full-page load instead of a dead-end error screen.

## Environment

- next `16.3.0` (also inspected on canary — the relevant branch is removed)
- react / react-dom `19.2.0`
- `cacheComponents: true`
- Node 24
