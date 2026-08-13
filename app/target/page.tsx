import { connection } from 'next/server'
import { Suspense } from 'react'

// A dynamic hole makes this route ◐ Partial Prerender, so its PREFETCH
// payload is a partial Flight stream BY DESIGN (shell only, `~` marker).
async function Dynamic() {
  await connection()
  return <p id="dynamic">dynamic content resolved</p>
}

export default function Target() {
  return (
    <main>
      <h1>Target</h1>
      <Suspense fallback={<p>loading…</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
