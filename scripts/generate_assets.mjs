// AURIX – generates app icons, iOS splash screens and album artwork.
// All artwork is original, created procedurally by this script (CC0).
// Usage: node scripts/generate_assets.mjs
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
mkdirSync(join(pub, 'icons'), { recursive: true })
mkdirSync(join(pub, 'splash'), { recursive: true })
mkdirSync(join(pub, 'covers'), { recursive: true })

// ------------------------------------------------------------- logo mark --
// The AURIX mark: a sound ring with an "A"-shaped waveform peak.
const mark = (size, { pad = 0.2, bg = true, rounded = false } = {}) => {
  const s = size
  const c = s / 2
  const r = (s / 2) * (1 - pad)
  const sw = r * 0.085
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#1b1428"/>
      <stop offset="0.55" stop-color="#0a0a0f"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#c9cbd6"/>
      <stop offset="0.7" stop-color="#8e90a0"/>
      <stop offset="1" stop-color="#e9e9f2"/>
    </linearGradient>
    <linearGradient id="violet" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#7c4dff"/>
      <stop offset="1" stop-color="#c7a6ff"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${s * 0.03}"/>
    </filter>
  </defs>
  ${bg ? `<rect width="${s}" height="${s}" ${rounded ? `rx="${s * 0.22}"` : ''} fill="url(#bg)"/>` : ''}
  <circle cx="${c}" cy="${c}" r="${r * 0.82}" fill="none" stroke="#8b5cf6" stroke-opacity="0.55" stroke-width="${sw * 2.2}" filter="url(#glow)"/>
  <circle cx="${c}" cy="${c}" r="${r * 0.82}" fill="none" stroke="url(#silver)" stroke-width="${sw}"/>
  <path d="M ${c - r * 0.5} ${c + r * 0.34}
           L ${c - r * 0.3} ${c + r * 0.34}
           L ${c} ${c - r * 0.48}
           L ${c + r * 0.3} ${c + r * 0.34}
           L ${c + r * 0.5} ${c + r * 0.34}"
        fill="none" stroke="url(#silver)" stroke-width="${sw * 1.15}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M ${c - r * 0.16} ${c + r * 0.06} L ${c + r * 0.16} ${c + r * 0.06}"
        stroke="#a47bff" stroke-width="${sw * 1.15}" stroke-linecap="round"/>
</svg>`
}

const png = (svg, file, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(pub, file))

await png(mark(512, { pad: 0.22 }), 'icons/icon-512.png', 512)
await png(mark(512, { pad: 0.22 }), 'icons/icon-192.png', 192)
await png(mark(512, { pad: 0.36 }), 'icons/icon-maskable-512.png', 512)
await png(mark(512, { pad: 0.2 }), 'icons/apple-touch-icon.png', 180)
await png(mark(512, { pad: 0.16, rounded: true }), 'icons/favicon-64.png', 64)
writeFileSync(join(pub, 'favicon.svg'), mark(64, { pad: 0.12, rounded: true }).trim())
writeFileSync(join(pub, 'logo-mark.svg'), mark(256, { pad: 0.08, bg: false }).trim())

// --------------------------------------------------------- splash screens --
// Portrait sizes (device pixels) for current & recent iPhones / iPads.
export const SPLASH = [
  [1320, 2868, 440, 956, 3], [1206, 2622, 402, 874, 3],
  [1290, 2796, 430, 932, 3], [1179, 2556, 393, 852, 3],
  [1284, 2778, 428, 926, 3], [1170, 2532, 390, 844, 3],
  [1125, 2436, 375, 812, 3], [1242, 2688, 414, 896, 3],
  [828, 1792, 414, 896, 2], [1242, 2208, 414, 736, 3],
  [750, 1334, 375, 667, 2], [640, 1136, 320, 568, 2],
  [2048, 2732, 1024, 1366, 2], [1668, 2388, 834, 1194, 2],
  [1640, 2360, 820, 1180, 2], [1488, 2266, 744, 1133, 2],
]
for (const [w, h] of SPLASH) {
  const m = Math.round(Math.min(w, h) * 0.32)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#1d1430"/>
      <stop offset="0.5" stop-color="#07070b"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <linearGradient id="t" x1="0" x2="1">
      <stop offset="0" stop-color="#f4f4f8"/><stop offset="1" stop-color="#a9abba"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="${w / 2}" y="${h * 0.42 + m * 0.85}" font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="${m * 0.32}" letter-spacing="${m * 0.09}" text-anchor="middle" fill="url(#t)">AURIX</text>
  <text x="${w / 2}" y="${h * 0.42 + m * 1.08}" font-family="Helvetica, Arial, sans-serif" font-weight="500"
        font-size="${m * 0.075}" letter-spacing="${m * 0.04}" text-anchor="middle" fill="#8a8c99">MUSIC WITHOUT LIMITS.</text>
</svg>`
  const logo = await sharp(Buffer.from(mark(m, { pad: 0.05, bg: false }))).png().toBuffer()
  await sharp(Buffer.from(svg))
    .composite([{ input: logo, top: Math.round(h * 0.42 - m * 0.55), left: Math.round((w - m) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(join(pub, 'splash', `splash-${w}x${h}.png`))
}

// ---------------------------------------------------------- album covers --
const S = 800
const label = (title, artist, color = '#fff') => `
  <text x="56" y="${S - 92}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="44" fill="${color}" letter-spacing="1">${title}</text>
  <text x="56" y="${S - 50}" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="26" fill="${color}" fill-opacity="0.7" letter-spacing="4">${artist.toUpperCase()}</text>`
const grain = `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.07 0"/></filter>`

const covers = {
  'afterglow-theory': `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0618"/><stop offset="1" stop-color="#2a1257"/></linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d9ff"/><stop offset="0.5" stop-color="#b57bff"/><stop offset="1" stop-color="#6a2cff"/></linearGradient>
      <clipPath id="sc"><circle cx="400" cy="360" r="210"/></clipPath>${grain}
    </defs>
    <rect width="${S}" height="${S}" fill="url(#sky)"/>
    <circle cx="400" cy="360" r="260" fill="#8b5cf6" opacity="0.25"/>
    <g clip-path="url(#sc)"><rect x="150" y="140" width="500" height="440" fill="url(#sun)"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="150" y="${400 + i * 28}" width="500" height="${6 + i * 3}" fill="#0b0618"/>`).join('')}</g>
    <rect y="520" width="${S}" height="280" fill="#07040f"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="0" y1="${530 + i * i * 6}" x2="${S}" y2="${530 + i * i * 6}" stroke="#a477ff" stroke-opacity="${0.5 - i * 0.04}" stroke-width="2"/>`).join('')}
    ${Array.from({ length: 13 }, (_, i) => `<line x1="${400 + (i - 6) * 30}" y1="520" x2="${400 + (i - 6) * 190}" y2="${S}" stroke="#a477ff" stroke-opacity="0.35" stroke-width="2"/>`).join('')}
    <rect width="${S}" height="${S}" filter="url(#grain)"/>
    ${label('Afterglow Theory', 'Nova Lumen')}`,
  'slow-mornings': `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e6dc"/><stop offset="1" stop-color="#cdb8e6"/></linearGradient>
      <filter id="b"><feGaussianBlur stdDeviation="40"/></filter>${grain}
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    <circle cx="250" cy="260" r="200" fill="#f9b99a" filter="url(#b)" opacity="0.9"/>
    <circle cx="560" cy="420" r="230" fill="#9d86d8" filter="url(#b)" opacity="0.8"/>
    <rect x="200" y="170" width="400" height="300" rx="28" fill="#2b2238" opacity="0.88"/>
    <rect x="228" y="198" width="344" height="210" rx="14" fill="#f7d7c4"/>
    <circle cx="460" cy="290" r="46" fill="#fff4ec"/>
    ${[0, 1, 2, 3].map((i) => `<line x1="250" y1="${250 + i * 32}" x2="${380 - i * 20}" y2="${250 + i * 32}" stroke="#8f7bb8" stroke-width="6" stroke-linecap="round" opacity="0.7"/>`).join('')}
    <rect x="300" y="470" width="200" height="22" rx="8" fill="#2b2238" opacity="0.88"/>
    <rect width="${S}" height="${S}" filter="url(#grain)"/>
    ${label('Slow Mornings', 'Kairo Bay', '#2b2238')}`,
  'signal-noise': `
    <defs>${grain}<radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#1a1a22"/><stop offset="1" stop-color="#030305"/></radialGradient></defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    ${Array.from({ length: 34 }, (_, i) => {
      const y = 130 + i * 15
      const amp = 90 * Math.exp(-Math.pow((i - 17) / 8, 2))
      let d = `M 80 ${y}`
      for (let x = 80; x <= 720; x += 10) {
        const k = Math.exp(-Math.pow((x - 400) / 120, 2))
        d += ` L ${x} ${(y - amp * k * Math.abs(Math.sin(x * 0.09 + i))).toFixed(1)}`
      }
      return `<path d="${d}" fill="none" stroke="${i === 17 ? '#a87bff' : '#d7d8e2'}" stroke-opacity="${i === 17 ? 1 : 0.75}" stroke-width="${i === 17 ? 3.5 : 2}"/>`
    }).join('')}
    <rect width="${S}" height="${S}" filter="url(#grain)"/>
    ${label('Signal &amp; Noise', 'Vanta Grid')}`,
  'northern-quiet': `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060f"/><stop offset="1" stop-color="#131a33"/></linearGradient>
      <linearGradient id="a1" x1="0" x2="1"><stop offset="0" stop-color="#5b8cff" stop-opacity="0"/><stop offset="0.5" stop-color="#9f7bff"/><stop offset="1" stop-color="#e2c6ff" stop-opacity="0"/></linearGradient>
      <filter id="b"><feGaussianBlur stdDeviation="22"/></filter>${grain}
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    ${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 137) % S}" cy="${(i * 263) % 420}" r="${(i % 3) + 1}" fill="#fff" opacity="${0.3 + (i % 5) * 0.12}"/>`).join('')}
    <path d="M -50 380 C 150 200 300 420 450 260 S 700 180 850 300 L 850 420 C 650 330 520 480 380 400 S 100 460 -50 520 Z" fill="url(#a1)" filter="url(#b)" opacity="0.9"/>
    <path d="M -50 300 C 200 160 360 300 520 200 S 760 140 850 200 L 850 260 C 680 230 560 330 420 300 S 150 330 -50 380 Z" fill="#c9b2ff" filter="url(#b)" opacity="0.45"/>
    <path d="M 0 640 L 140 520 L 230 590 L 380 470 L 520 600 L 640 520 L 800 640 L 800 800 L 0 800 Z" fill="#04050a"/>
    <rect width="${S}" height="${S}" filter="url(#grain)"/>
    ${label('Northern Quiet', 'Sølvi')}`,
  'parallel-rooms': `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dae3"/><stop offset="1" stop-color="#9a9cad"/></linearGradient>
      <linearGradient id="v" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#7c4dff"/><stop offset="1" stop-color="#3b1a8f"/></linearGradient>${grain}
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => {
      const inset = 60 + i * 42
      return `<rect x="${inset}" y="${inset - 20}" width="${S - inset * 2}" height="${S - inset * 2 - 80}" fill="none" stroke="#2a2a35" stroke-opacity="${0.15 + i * 0.1}" stroke-width="3"/>`
    }).join('')}
    <rect x="330" y="290" width="140" height="140" fill="url(#v)"/>
    <rect x="352" y="312" width="96" height="96" fill="none" stroke="#e6dcff" stroke-width="3"/>
    <rect width="${S}" height="${S}" filter="url(#grain)"/>
    ${label('Parallel Rooms', 'Echo Atlas', '#14141c')}`,
  'bright-side-club': `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a8b"/><stop offset="0.5" stop-color="#ff6fb5"/><stop offset="1" stop-color="#8a5cff"/></linearGradient>
      <filter id="b"><feGaussianBlur stdDeviation="30"/></filter>${grain}
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    <circle cx="560" cy="230" r="170" fill="#ffd36e" filter="url(#b)"/>
    <circle cx="400" cy="380" r="190" fill="none" stroke="#fff" stroke-width="16"/>
    <circle cx="400" cy="380" r="120" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="10"/>
    <circle cx="400" cy="380" r="54" fill="#fff"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2
      return `<line x1="${400 + Math.cos(a) * 225}" y1="${380 + Math.sin(a) * 225}" x2="${400 + Math.cos(a) * 265}" y2="${380 + Math.sin(a) * 265}" stroke="#fff" stroke-width="10" stroke-linecap="round"/>`
    }).join('')}
    <rect width="${S}" height="${S}" filter="url(#grain)"/>
    ${label('Bright Side Club', 'Juno Ray')}`,
}

for (const [id, body] of Object.entries(covers)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`
  await sharp(Buffer.from(svg)).resize(600, 600).jpeg({ quality: 86, mozjpeg: true }).toFile(join(pub, 'covers', `${id}.jpg`))
}

// Emit the <link> tags for index.html (splash screens)
const links = SPLASH.map(([w, h, cw, ch, dpr]) =>
  `    <link rel="apple-touch-startup-image" media="(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" href="splash/splash-${w}x${h}.png" />`).join('\n')
writeFileSync(join(root, 'scripts', 'splash-links.html'), links + '\n')
console.log('✓ icons, splash screens and covers generated')
