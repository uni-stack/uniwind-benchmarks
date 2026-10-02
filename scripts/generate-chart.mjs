// Generates the README result tables, assets/result.jpg (iOS) / assets/result-android.jpg and, once the theme
// scenario was measured, assets/theme.jpg / assets/theme-android.jpg from results/results.json
// Usage: node scripts/generate-chart.mjs [--results <file>] [--readme <file>] [--assets <dir>] [--tables-only]
// Charts require Google Chrome (headless rendering) and ImageMagick. The config in bold is `highlight` in
// scripts/bench/configs.json, the 1.0x reference is `baseline` (both default to the latest uniwind version).
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readResults, updateReadme } from './bench/results-format.mjs'
import { baselineId, buildRelativeHtml, buildThemeHtml, highlightedId, render } from './chart.mjs'

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

const PLATFORMS = [
  ['ios', 'iOS', 'result.jpg', 'theme.jpg'],
  ['android', 'Android', 'result-android.jpg', 'theme-android.jpg'],
]

const highlight = highlightedId(results)
const baseline = baselineId(results)
const baselineLabel = results.configs.find((c) => c.id === baseline)?.label
const latest = (entries) =>
  entries
    .map((e) => e.measuredOn)
    .filter(Boolean)
    .sort()
    .at(-1) ?? results.date

for (const [platform, name, file] of PLATFORMS) {
  const device = results.devices[platform]
  const configs = results.configs.filter((c) => c[platform])
  const measuredOn = latest(configs.map((c) => c[platform]))
  render(
    buildRelativeHtml({
      title: `Render 2K+ views in runtime [ms] · ${name}`,
      subtitle: `${device.model}, ${device.os} · median of 6 warm launches · ${measuredOn}`,
      entries: configs.map((c) => ({
        label: c.label,
        library: c.library,
        value: c[platform].median,
        bold: c.id === highlight,
        baseline: c.id === baseline,
      })),
      axisLabel: `Relative to ${baselineLabel} (baseline = 1.0x)`,
    }),
    join(opts.assets, file)
  )
}

// Theme change: its own ranked-list chart (so it is not mistaken for the render chart), same baseline,
// only configs with a theme entry (StyleSheet has no themes).
for (const [platform, name, , themeFile] of PLATFORMS) {
  const device = results.devices[platform]
  const configs = results.configs.filter((c) => c.theme?.[platform])
  if (configs.length === 0) {
    console.log(`no ${platform} theme results in ${opts.results}, skipping ${themeFile}`)
    continue
  }
  if (!configs.some((c) => c.id === baseline)) {
    console.warn(`the ${platform} theme results have no ${baseline} (baseline), skipping ${themeFile}`)
    continue
  }
  render(
    buildThemeHtml({
      title: `Switch light / dark theme of 2K+ views [ms] · ${name}`,
      subtitle: `${device.model}, ${device.os} · median of 6 warm launches, 10 theme changes each · vs ${baselineLabel} · ${latest(configs.map((c) => c.theme[platform]))}`,
      entries: configs.map((c) => ({
        label: c.label,
        library: c.library,
        value: c.theme[platform].median,
        bold: c.id === highlight,
        baseline: c.id === baseline,
      })),
    }),
    join(opts.assets, themeFile)
  )
}
