// Records a LIVE run of Demo step 4 then step 5 as a video (never the recorded replay).
// Playwright's own video recorder needs a separate ffmpeg download, so frames are captured with page.screenshot
// instead and assembled by the system ffmpeg (scripts/make_gif.sh).
// usage: node scripts/record_gif.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const [base = 'http://localhost:5173', out = 'audit_artifacts/phase4/gif'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } })
const page = await ctx.newPage()
await page.goto(`${base}/#/demo/4`)
await page.getByText('Run it live').waitFor()
await page.waitForTimeout(1500)
const t0 = Date.now()
let n = 0, stop = false
const grab = (async () => {
  while (!stop) {
    await page.screenshot({ path: `${out}/f${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 80 })
    await page.waitForTimeout(120)
  }
})()
await page.getByText('Run it live').click()
await page.waitForSelector('[data-testid=step4-verdict]', { timeout: 120000 })
await page.waitForTimeout(3500)
await page.getByTestId('next-btn').click()
await page.waitForTimeout(1200)
await page.getByText('Run all six live').click()
await page.waitForSelector('[data-testid=step5-summary]', { timeout: 300000 })
await page.waitForTimeout(4500)
stop = true; await grab
const secs = (Date.now() - t0) / 1000
fs.writeFileSync(`${out}/meta.json`, JSON.stringify({ frames: n, seconds: secs, fps: n / secs }))
console.log('frames', n, 'seconds', secs, 'fps', n / secs)
await ctx.close(); await browser.close()
