import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      {/* prefetch disabled so the ONLY cache entry is the one `npm run seed`
          stores — keeps the repro deterministic. */}
      <Link href="/target" prefetch={false} id="go">
        go to /target
      </Link>
    </main>
  )
}
