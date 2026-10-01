// Shared bar chart renderer for the README charts (headless Chrome + ImageMagick).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const W = 1920
const H = 1080
// Bar colours: [value, peak]. Render time is cyan, memory violet, so the README charts are easy to tell apart.
export const COLORS = {
  time: ['#5CE1E6', '#C9F4F5'],
  memory: ['#A78BFA', '#E2D8FE'],
}

const compareVersions = (a, b) => {
  const parts = (v) => v.split(/[.-]/).map((p) => (Number.isNaN(Number(p)) ? p : Number(p)))
  const [pa, pb] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue
    if (pa[i] === undefined) return 1 // 1.0.0 > 1.0.0-rc.0
    if (pb[i] === undefined) return -1
    return typeof pa[i] === typeof pb[i]
      ? pa[i] > pb[i]
        ? 1
        : -1
      : typeof pa[i] === 'number'
        ? 1
        : -1
  }
  return 0
}

const benchConfig = () =>
  JSON.parse(readFileSync(join(root, 'scripts', 'bench', 'configs.json'), 'utf8'))
const latestUniwind = (results) =>
  results.configs
    .filter((c) => c.package === 'uniwind' && c.version)
    .sort((a, b) => compareVersions(b.version, a.version))[0]?.id

// The config drawn in bold: `highlight` in scripts/bench/configs.json, else the latest `uniwind` version.
export const highlightedId = (results) => benchConfig().highlight ?? latestUniwind(results)

// The 1.0x reference of the render time charts: `baseline` in configs.json, else the latest `uniwind` version.
export const baselineId = (results) => benchConfig().baseline ?? latestUniwind(results)

// entries: { label, value, bold?, peak? }. peak draws a light bar behind the value bar (legend: peakLabel).
export const buildHtml = ({
  title,
  subtitle,
  entries,
  footnote,
  decimals = 2,
  peakLabel,
  colors: [BAR, BAR_LIGHT] = COLORS.time,
}) => {
  const sorted = [...entries].sort((a, b) => a.value - b.value)
  const max = Math.max(...sorted.map((e) => Math.max(e.value, e.peak ?? 0)))
  const step = max > 400 ? 100 : 50
  const top = Math.ceil(max / step) * step
  const plot = { x: 560, y: 210, w: 780, h: 560 }
  const scaleY = (v) => plot.y + plot.h - (v / top) * plot.h
  const gap = 12
  const barW = (plot.w - gap * (sorted.length - 1)) / sorted.length
  const grid = []
  for (let v = 0; v <= top; v += step) {
    grid.push(
      `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${scaleY(v)}" y2="${scaleY(v)}" stroke="#D9D9D9" stroke-width="2"/>`,
      `<text x="${plot.x - 30}" y="${scaleY(v) + 12}" text-anchor="end" class="tick">${v}</text>`
    )
  }
  const barPath = (x, v, fill) => {
    const y = scaleY(v)
    const h = plot.y + plot.h - y
    const r = Math.min(10, barW / 2, h / 2)
    return `<path d="M${x},${y + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} h-${barW} z" fill="${fill}"/>`
  }
  const bars = sorted.map((e, i) => {
    const x = plot.x + i * (barW + gap)
    const bold = e.bold ? ' bold' : ''
    const peak = e.peak
      ? `${barPath(x, e.peak, BAR_LIGHT)}
      <text x="${x + barW / 2}" y="${scaleY(e.peak) - 14}" text-anchor="middle" class="peak${bold}">${e.peak.toFixed(decimals)}</text>`
      : ''
    const valueY =
      e.peak && scaleY(e.value) - scaleY(e.peak) < 50 ? scaleY(e.value) + 34 : scaleY(e.value) - 14
    return `${peak}
      ${barPath(x, e.value, BAR)}
      <text x="${x + barW / 2}" y="${valueY}" text-anchor="middle" class="value${bold}">${e.value.toFixed(decimals)}</text>
      <text transform="translate(${x + barW / 2 + 12},${plot.y + plot.h + 26}) rotate(-45)" text-anchor="end" class="label${bold}">${e.label}</text>`
  })
  const legend = peakLabel
    ? `<rect x="${plot.x + plot.w + 50}" y="${plot.y}" width="28" height="28" rx="6" fill="${BAR}"/>
  <text x="${plot.x + plot.w + 92}" y="${plot.y + 23}" class="legend">${peakLabel[0]}</text>
  <rect x="${plot.x + plot.w + 50}" y="${plot.y + 48}" width="28" height="28" rx="6" fill="${BAR_LIGHT}"/>
  <text x="${plot.x + plot.w + 92}" y="${plot.y + 71}" class="legend">${peakLabel[1]}</text>`
    : ''
  return page({ title, subtitle, footnote, dot: BAR, body: [...grid, ...bars, legend].join('\n') })
}

// Page with a centered title (dot + text), a subtitle and an optional footnote around an SVG body.
const page = ({
  title,
  subtitle,
  footnote,
  dot,
  body,
}) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;background:#fff;width:${W}px;height:${H}px;overflow:hidden}
  text{font-family:Poppins,'Avenir Next','Helvetica Neue',Arial,sans-serif;fill:#1a1a1a}
  .tick{font-size:30px}.label{font-size:27px}.value{font-size:22px;font-weight:500}.subtitle{font-size:22px;fill:#6b6b6b}
  .peak{font-size:20px;fill:#6b6b6b}.legend{font-size:24px}.bold{font-weight:700}
  .inside{font-size:24px;font-weight:700;fill:#fff}.outside{font-size:24px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:8px}
  .ratio{font-size:26px;font-weight:700}.axis{font-size:26px}
  .heading{position:absolute;top:85px;left:0;width:${W}px;display:flex;justify-content:center;align-items:center;gap:13px;
    font:34px Poppins,'Avenir Next','Helvetica Neue',Arial,sans-serif;color:#1a1a1a}
  .heading i{width:34px;height:34px;border-radius:50%;background:${dot}}
</style></head><body>
<div class="heading"><i></i><span>${title}</span></div>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <text x="${W / 2}" y="165" text-anchor="middle" class="subtitle">${subtitle}</text>
  ${footnote ? `<text x="${W - 40}" y="${H - 30}" text-anchor="end" class="subtitle">${footnote}</text>` : ''}
  ${body}
</svg></body></html>`

// Bar colour per library in the horizontal (relative) chart.
const LIBRARY_COLORS = {
  StyleSheet: '#5FC46A',
  'Uniwind Pro': '#8B5CF6',
  Unistyles: '#EBA23F',
  Uniwind: '#6366F1',
  NativeWind: '#E05252',
}
const FASTER = '#3E9F4A'
const SLOWER = '#D9473F'

// Horizontal bars relative to a baseline entry (1.0x, dashed line), fastest on top, "Nx faster/slower" on the right.
// entries: { label, library, value, bold?, baseline? }
export const buildRelativeHtml = ({ title, subtitle, entries, axisLabel, unit = 'ms' }) => {
  const sorted = [...entries].sort((a, b) => a.value - b.value)
  const base = sorted.find((e) => e.baseline)?.value
  if (!base) throw new Error('buildRelativeHtml: no baseline entry')
  const maxRatio = Math.max(...sorted.map((e) => e.value / base))
  const step = maxRatio > 6 ? 1 : 0.5
  const top = Math.ceil((maxRatio + 0.1) / step) * step
  const plot = { x: 540, y: 205, w: 1000, h: 700 }
  const scaleX = (ratio) => plot.x + (ratio / top) * plot.w
  const rowH = plot.h / sorted.length
  const barH = Math.min(64, rowH * 0.62)
  const axisY = plot.y + plot.h + 8
  const ticks = []
  for (let v = 0; v <= top + 1e-9; v += step) {
    ticks.push(
      `<line x1="${scaleX(v)}" x2="${scaleX(v)}" y1="${axisY}" y2="${axisY + 10}" stroke="#1a1a1a" stroke-width="2"/>`,
      `<text x="${scaleX(v)}" y="${axisY + 44}" text-anchor="middle" class="axis">${v.toFixed(1)}</text>`
    )
  }
  const rows = sorted.map((e, i) => {
    const cy = plot.y + rowH * (i + 0.5)
    const y = cy - barH / 2
    const w = scaleX(e.value / base) - plot.x
    const bold = e.bold ? ' bold' : ''
    const fill = LIBRARY_COLORS[e.library] ?? COLORS.time[0]
    const ms = `${e.value.toFixed(1)}${unit}`
    const value =
      w > 105
        ? `<text x="${plot.x + w - 14}" y="${cy + 9}" text-anchor="end" class="inside">${ms}</text>`
        : `<text x="${plot.x + w + 14}" y="${cy + 9}" class="outside">${ms}</text>`
    const ratio = e.value / base
    const [text, color] = e.baseline
      ? ['baseline', '#6b6b6b']
      : ratio < 1
        ? [`${(1 / ratio).toFixed(2)}x faster`, FASTER]
        : [`${ratio.toFixed(2)}x slower`, SLOWER]
    return `<path d="M${plot.x},${y} h${w - 8} a8,8 0 0 1 8,8 v${barH - 16} a8,8 0 0 1 -8,8 h-${w - 8} z" fill="${fill}"/>
  ${value}
  <text x="${plot.x - 24}" y="${cy + 10}" text-anchor="end" class="label${bold}">${e.label}</text>
  <text x="${plot.x + plot.w + 40}" y="${cy + 9}" class="ratio" style="fill:${color}">${text}</text>`
  })
  const body = [
    `<line x1="${scaleX(1)}" x2="${scaleX(1)}" y1="${plot.y - 10}" y2="${axisY}" stroke="${LIBRARY_COLORS.Uniwind}" stroke-width="3" stroke-dasharray="10 8"/>`,
    ...rows,
    `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${axisY}" y2="${axisY}" stroke="#1a1a1a" stroke-width="2"/>`,
    ...ticks,
    `<text x="${plot.x + plot.w / 2}" y="${axisY + 92}" text-anchor="middle" class="axis">${axisLabel}</text>`,
  ].join('\n')
  return page({ title, subtitle, dot: LIBRARY_COLORS.Uniwind, body })
}

export const render = (html, outPath) => {
  const dir = mkdtempSync(join(tmpdir(), 'chart-'))
  const htmlPath = join(dir, 'chart.html')
  const png = join(dir, 'chart.png')
  writeFileSync(htmlPath, html)
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${W},${H}`,
      `--screenshot=${png}`,
      '--virtual-time-budget=5000',
      `file://${htmlPath}`,
    ],
    { stdio: 'ignore' }
  )
  execFileSync('magick', [png, '-quality', '92', outPath])
  console.log(`wrote ${outPath}`)
}
