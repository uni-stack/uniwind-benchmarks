// Generates the README result tables and assets/result.jpg (iOS) / assets/result-android.jpg from results/results.json
// Usage: node scripts/generate-chart.mjs [--results <file>] [--readme <file>] [--assets <dir>] [--tables-only]
// Charts require Google Chrome (headless rendering) and ImageMagick. The config in bold is `highlight` in
// scripts/bench/configs.json, the 1.0x reference is `baseline` (both default to the latest uniwind version).
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readResults, updateReadme } from './bench/results-format.mjs'
import { baselineId, buildRelativeHtml, highlightedId, render } from './chart.mjs'

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
  ['ios', 'iOS', 'result.jpg'],
  ['android', 'Android', 'result-android.jpg'],
]

const highlight = highlightedId(results)
const baseline = baselineId(results)
const baselineLabel = results.configs.find((c) => c.id === baseline)?.label
for (const [platform, name, file] of PLATFORMS) {
  const device = results.devices[platform]
  const configs = results.configs.filter((c) => c[platform])
  const measuredOn =
    configs
      .map((c) => c[platform].measuredOn)
      .filter(Boolean)
      .sort()
      .at(-1) ?? results.date
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
