// Replace Capacitor's default splash images with the app icon on a plain background.
import sharp from 'sharp'
import { readdirSync, readFileSync, existsSync } from 'node:fs'

const res = 'android/app/src/main/res'
const svg = readFileSync('public/icon.svg')
for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
  const file = `${res}/${dir}/splash.png`
  if (!existsSync(file)) continue
  const { width, height } = await sharp(file).metadata()
  const s = Math.round(Math.min(width, height) * 0.28)
  const icon = await sharp(svg).resize(s, s).png().toBuffer()
  const bg = dir.includes('night') ? '#0e1210' : '#f4f2ec'
  await sharp({ create: { width, height, channels: 3, background: bg } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(file + '.tmp')
  const { renameSync } = await import('node:fs')
  renameSync(file + '.tmp', file)
}
console.log('splash written')
