// Renders the app icons (PNG) from the logo: node scripts/make-icons.mjs public
import { chromium } from 'playwright'
const out = process.argv[2]
const arrows = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><path d="M150 150l106 106-106 106M262 150l106 106-106 106" fill="none" stroke="#c6f432" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></g>`
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0e0f12"/>${arrows(1)}</svg>`
const square = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0e0f12"/>${arrows(s)}</svg>`
const jobs = [
  ['icon-192.png', 192, rounded, true],
  ['icon-512.png', 512, rounded, true],
  ['icon-maskable-512.png', 512, square(0.72), false],
  ['apple-touch-icon.png', 180, square(0.82), false],
]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, svg, transparent] of jobs) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: `${out}/${name}`, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
