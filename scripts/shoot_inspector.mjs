// Screenshots the 7 Inspector screens plus the Settings Reset AlertDialog (opened, then cancelled — nothing is reset).
// usage: node scripts/shoot_inspector.mjs <baseUrl> <outDir> [width] [height]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const [base = 'http://localhost:5173', out = 'audit_artifacts/phase3/inspector_after_real', w = '1440', h = '900'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
for (const r of ['trace', 'chat', 'documents', 'audit', 'replay', 'test-runs', 'settings']) {
  await page.goto(`${base}/#/${r}`)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(out, `${r}.png`) })
}
await page.goto(`${base}/#/settings`)
await page.waitForTimeout(1500)
await page.locator('#reset-btn, button:has-text("Reset")').first().click()
await page.waitForSelector('[data-testid=reset-dialog]')
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(out, 'settings_reset_dialog.png') })
await page.getByRole('button', { name: /cancel/i }).click()
console.log('dialog shot ok')
await browser.close()
