// Make Android launcher icons from public/icon.svg (run after `npx cap add android`).
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const res = 'android/app/src/main/res'
const svg = readFileSync('public/icon.svg')
// Foreground for adaptive icons: the artwork without its rounded green tile, inside the 66/108 safe zone.
const fg = Buffer.from(
  svg
    .toString()
    .replace(/<rect width="512" height="512" rx="112" fill="#0e6b4e"\/>/, '')
    .replace('<svg ', '<svg width="512" height="512" '),
)
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [d, s] of Object.entries(sizes)) {
  const dir = `${res}/mipmap-${d}`
  mkdirSync(dir, { recursive: true })
  await sharp(svg).resize(s, s).png().toFile(`${dir}/ic_launcher.png`)
  await sharp(svg).resize(s, s).png().toFile(`${dir}/ic_launcher_round.png`)
  const f = Math.round((s * 108) / 48)
  const inner = Math.round(f * 0.62)
  const art = await sharp(fg).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: f, height: f, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(`${dir}/ic_launcher_foreground.png`)
}
writeFileSync(
  `${res}/values/ic_launcher_background.xml`,
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E6B4E</color>\n</resources>\n',
)
console.log('icons written')
