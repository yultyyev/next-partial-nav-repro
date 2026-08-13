// Asserts the actual client-side crash. Requires:
//   - next running on :3001, cache-proxy on :3000, `node seed.mjs` done
//   - npx playwright install chromium   (one-time)
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
const pageErrors = []
const consoleMsgs = []
page.on('pageerror', e => pageErrors.push(String(e)))
page.on('console', m => consoleMsgs.push(m.text()))

await page.goto('http://127.0.0.1:3000/')
await page.click('#go')
await page
  .waitForFunction(() => /couldn/.test(document.body.innerText), { timeout: 8000 })
  .catch(() => {})

const crashed = pageErrors.some(e => /Minified React error #412/.test(e))
const errorScreen = /couldn/.test(await page.evaluate(() => document.body.innerText))
const fellBack = consoleMsgs.some(m => /Failed to fetch RSC payload/.test(m))

console.log(`react #412 thrown:        ${crashed}`)
console.log(`terminal error screen:    ${errorScreen}`)
console.log(`MPA fallback attempted:   ${fellBack}  (the existing fetch-level fallback never fires)`)
await browser.close()

if (crashed && errorScreen && !fellBack) {
  console.log('\nREPRODUCED: navigation crashed with React #412 and no fallback.')
  process.exit(0)
}
console.log('\nNOT reproduced — did you run `node seed.mjs` against a fresh cache?')
process.exit(1)
