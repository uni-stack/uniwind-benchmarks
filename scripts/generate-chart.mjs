// Generates the README result tables and assets/result.jpg (iOS) / assets/result-android.jpg from results/results.json
// Usage: node scripts/generate-chart.mjs [--results <file>] [--readme <file>] [--assets <dir>] [--tables-only]
// Charts require Google Chrome (headless rendering) and ImageMagick.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readResults, updateReadme } from './bench/results-format.mjs'

const root = resolve(import.meta.dirname, '..')
const { values: opts } = parseArgs({
  options: {
    results: { type: 'string', default: join(root, 'results', 'results.json') },
    readme: { type: 'string', default: join(root, 'README.md') },
    assets: { type: 'string', default: join(root, 'assets') },
    'tables-only': { type: 'boolean', default: false },
  },
})
const results = readResults(opts.results)

updateReadme(opts.readme, results)
console.log(`updated tables in ${opts.readme}`)
if (opts['tables-only']) process.exit(0)

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const W = 1920
const H = 1080
const BAR = '#5CE1E6'

const buildHtml = (title, subtitle, entries, footnote) => {
  const sorted = [...entries].sort((a, b) => a.value - b.value)
  const max = Math.max(...sorted.map((e) => e.value))
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
  const bars = sorted.map((e, i) => {
    const x = plot.x + i * (barW + gap)
    const y = scaleY(e.value)
    const h = plot.y + plot.h - y
    const r = Math.min(10, barW / 2, h / 2)
    const path = `M${x},${y + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} h-${barW} z`
    return `<path d="${path}" fill="${BAR}"/>
      <text x="${x + barW / 2}" y="${y - 14}" text-anchor="middle" class="value">${e.value.toFixed(2)}</text>
      <text transform="translate(${x + barW / 2 + 12},${plot.y + plot.h + 26}) rotate(-45)" text-anchor="end" class="label">${e.label}</text>`
  })
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;background:#fff;width:${W}px;height:${H}px;overflow:hidden}
  text{font-family:Poppins,'Avenir Next','Helvetica Neue',Arial,sans-serif;fill:#1a1a1a}
  .tick{font-size:30px}.label{font-size:27px}.value{font-size:22px;font-weight:500}.title{font-size:34px}.subtitle{font-size:22px;fill:#6b6b6b}
</style></head><body>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <circle cx="${W / 2 - 250}" cy="108" r="17" fill="${BAR}"/>
  <text x="${W / 2 - 220}" y="120" class="title">${title}</text>
  <text x="${W / 2}" y="165" text-anchor="middle" class="subtitle">${subtitle}</text>
  ${footnote ? `<text x="${W - 40}" y="${H - 30}" text-anchor="end" class="subtitle">${footnote}</text>` : ''}
  ${grid.join('\n')}
  ${bars.join('\n')}
</svg></body></html>`
}

const render = (html, outPath) => {
  const dir = mkdtempSync(join(tmpdir(), 'chart-'))
  const htmlPath = join(dir, 'chart.html')
  const png = join(dir, 'chart.png')
  writeFileSync(htmlPath, html)
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${W},${H}`, `--screenshot=${png}`, '--virtual-time-budget=5000', `file://${htmlPath}`,
  ], { stdio: 'ignore' })
  execFileSync('magick', [png, '-quality', '92', outPath])
  console.log(`wrote ${outPath}`)
}

const PLATFORMS = [
  ['ios', 'iOS', 'result.jpg'],
  ['android', 'Android', 'result-android.jpg'],
]

for (const [platform, name, file] of PLATFORMS) {
  const device = results.devices[platform]
  const configs = results.configs.filter((c) => c[platform])
  const entries = configs.map((c) => ({
    label: c.unreleased ? `${c.label}*` : c.label,
    value: c[platform].median,
  }))
  const unreleased = configs.filter((c) => c.unreleased).map((c) => c.label)
  const footnote = unreleased.length ? `* ${unreleased.join(', ')}: unreleased build` : ''
  render(
    buildHtml(
      `Render 2K+ views in runtime [ms] · ${name}`,
      `${device.model}, ${device.os} · median of 6 warm launches · ${results.date}`,
      entries,
      footnote
    ),
    join(opts.assets, file)
  )
}
