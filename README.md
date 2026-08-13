# Next.js: navigation has no failure containment for a partial RSC payload — React #412 dead-ends the user instead of falling back to a full-page load

When the router's **navigation** reader consumes a Flight payload whose stream
closes with rows still pending, the rejection surfaces as an uncaught
`Minified React error #412` ("Connection closed.") during React render and the
user lands on the terminal **"This page couldn't load"** screen — while a plain
document load of the same URL renders fine. Every *other* transport-level
failure in the same navigation path already degrades to a browser (MPA)
navigation; this one class has no containment.

The payload involved is not foreign input: it is the **partial Flight stream
Next itself produces, by design, for prefetches of Partial Prerender routes**
(`~` marker byte). This repro's only job is to hand that first-party payload to
the navigation reader deterministically.

## What the cache in this repro is — and is not

`cache-proxy.mjs` is a **deliberately non-compliant delivery vehicle, not a
model of a realistic CDN.** Next ships three defenses against precisely this
prefetch/navigation confusion, and this proxy knowingly bypasses all three:

1. RSC responses carry `Cache-Control: private, no-cache, no-store, max-age=0,
   must-revalidate` — the proxy never reads it (storing this response violates
   RFC 9111; a compliant cache would not store it)
2. the `?_rsc=<hash>` per-variant cache-buster (`validateRSCRequestHeaders`,
   on by default) gives prefetch and navigation **different URLs by design** —
   the proxy keys on pathname only, ignoring the query string
3. `Vary: rsc, next-router-prefetch, …` — ignored

Those defenses stop *caches* from producing this payload mix. They cannot stop
the **server itself** from emitting a partial payload to a navigation — which
we have observed in production on self-hosted Next 16.3.0 with **no cache in
front at all** (origin responses: `~` first byte, `x-nextjs-postponed: 1`, no
`x-nextjs-cache`; same #412 + error screen on every click while direct loads
stayed 200), and which the #96339 class of server-side bugs also produced.
Prevention can fail; this issue is about what the client does **when a partial
payload arrives anyway**: today, the worst possible outcome, when a full-page
load — demonstrably fine — was one fallback away.

## Repro

```bash
npm install
npx playwright install chromium   # for the automated crash assertion
npm run build
```

Terminal A:

```bash
npm run start:next    # next start on :3001
```

Terminal B:

```bash
npm run start:cache   # the cache on :3000
```

Terminal C:

```bash
npm run repro         # seeds ONE prefetch response, then asserts the crash
```

Or manually: `npm run seed`, open **http://localhost:3000**, click
**"go to /target"** → the error screen. Open http://localhost:3000/target
directly in a new tab → renders fine.

## Verified output

`npm run seed`:

```
seeded: HTTP 200 cache=STORE bytes=3409 firstByte='~' (PARTIAL by design — prefetch of a PPR route)
```

`npm run verify` (headless, server half only):

```
navigation-shaped request: HTTP 200 cache=HIT bytes=3409 firstByte='~'
=> the navigation was served a PARTIAL payload. A real router navigation consuming this crashes with React #412.
document request:           HTTP 200 cache=PASS (direct open works)
```

`npm run repro` (real Chromium, real `<Link>` click):

```
react #412 thrown:        true
terminal error screen:    true
MPA fallback attempted:   false  (the existing fetch-level fallback never fires)

REPRODUCED: navigation crashed with React #412 and no fallback.
```

Reproduces on `next@16.3.0` and on canary (tested on `16.3.1-canary.15`).

## Mechanism (verified against 16.3.0 dist and canary source)

The crash is **not** an unhandled fetch error — the navigation itself settles
normally. Precisely:

- the navigation response's **root row resolves**, so the nav promise fulfills
  and the router commits the new tree;
- **nested rows are still pending** when the stream closes; the Flight client's
  close handler rejects them with `Error #412` ("Connection closed.");
- those rejections surface **later, during React render** of the committed
  tree — via `reportGlobalError`, outside `fetchServerResponse`'s `try/catch` —
  so the existing `Failed to fetch RSC payload … Falling back to browser
  navigation` recovery never runs (empirically: that log never appears).

Reader asymmetry: the **segment-cache reader**
(`packages/next/src/client/components/segment-cache/cache.ts`) passes
`allowPartialStream: true` — correct, prefetch payloads are partial by design.
The **navigation consumption path** has no equivalent opt-in *and no
stream-level failure containment*: in `16.3.0`
(`router-reducer/fetch-server-response.ts`) the only branch that would pass
`{ allowPartialStream: postponed }` is annotated as reachable solely under
legacy PPR, and on canary it is gone — `shouldImmediatelyDecode` is hardcoded
`true` and the branch is replaced by `res.flightResponsePromise!`.

## Why fix the client, given #96426 chose prevention

#96339's server-side fix (#96426) took the stance *don't produce truncated
streams* — the right call, and **not in tension with this issue**. This is not
a request to render partial payloads as if complete (`allowPartialStream` on
navigations would silently show shell-only pages — worse). It is a request for
**error-path containment**, parity with what the same function already does:

| failure during navigation | router behavior |
|---|---|
| fetch rejects (connection refused, abort) | `Failed to fetch RSC payload … Falling back to browser navigation` |
| deployment-id / build mismatch | MPA fallback |
| response is not `text/x-component` | MPA fallback |
| **Flight stream closes with rows pending** | **uncaught #412 → terminal error screen** |

Suggested fix: when consumption of a navigation Flight response fails (stream
closed with pending rows), fall back to a browser navigation. The destination
renders fine as a document load — this repro demonstrates that too — so the
user cost is one full-page load instead of a dead end.

## Environment

- next `16.3.0` (also reproduces on `16.3.1-canary.15`)
- react / react-dom `19.2.0`
- `cacheComponents: true`
- Node 24, macOS arm64
