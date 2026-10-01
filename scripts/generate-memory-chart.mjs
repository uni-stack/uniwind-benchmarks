// Generates assets/memory.jpg (iOS) / assets/memory-android.jpg from the memory readings in results/results.json
// (<platform>.memory, written by scripts/bench/update-results.mjs). Platforms without readings are skipped.
// Usage: node scripts/generate-memory-chart.mjs [--results <file>] [--assets <dir>] [--sample]
// --sample draws made-up values (marked in the subtitle) to preview the look before a measured round.
// Requires Google Chrome (headless rendering) and ImageMagick.
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readResults } from './bench/results-format.mjs'
import { COLORS, buildHtml, highlightedId, render } from './chart.mjs'

const root = resolve(import.meta.dirname, '..')
const { values: opts } = parseArgs({
  options: {
    results: { type: 'string', default: join(root, 'results', 'results.json') },
    assets: { type: 'string', default: join(root, 'assets') },
    sample: { type: 'boolean', default: false },
  },
})
const results = readResults(opts.results)

// Made-up numbers in the range of the first smoke runs, only for --sample.
const SAMPLE = {
  stylesheet: { ios: [85.2, 134.6], android: [171.6] },
  unistyles: { ios: [112.4, 151.8], android: [184.3] },
  uniwind: { ios: [120.5, 156.0], android: [155.7] },
  nativewind4: { ios: [141.9, 189.3], android: [212.8] },
  nativewind5: { ios: [168.3, 231.7], android: [246.1] },
  'pro-1.0.1': { ios: [104.6, 149.2], android: [166.4] },
  'pro-1.8.0': { ios: [98.7, 141.1], android: [162.2] },
}
const memoryOf = (c, platform) => {
  if (!opts.sample) return c[platform]?.memory
  const [median, peak] = SAMPLE[c.id]?.[platform] ?? []
  return median ? { median, peak } : undefined
}

const PLATFORMS = [
  ['ios', 'iOS', 'memory.jpg', 'phys_footprint'],
  ['android', 'Android', 'memory-android.jpg', 'PSS'],
]

const highlight = highlightedId(results)
for (const [platform, name, file, metric] of PLATFORMS) {
  const configs = results.configs.filter((c) => memoryOf(c, platform))
  if (configs.length === 0) {
    console.log(`no ${platform} memory readings in ${opts.results}, skipping ${file}`)
    continue
  }
  const device = results.devices[platform]
  const withPeak = configs.some((c) => memoryOf(c, platform).peak)
  const measuredOn = opts.sample ? 'SAMPLE DATA' : (configs[0][platform].measuredOn ?? results.date)
  render(
    buildHtml({
      title: `App memory [MB] · ${name}`,
      subtitle: `${device.model}, ${device.os} · ${metric} after the run and a forced GC · median of 6 warm launches · ${measuredOn}`,
      entries: configs.map((c) => {
        const m = memoryOf(c, platform)
        return { label: c.label, value: m.median, peak: m.peak, bold: c.id === highlight }
      }),
      decimals: 1,
      peakLabel: withPeak ? ['After GC', 'Peak'] : undefined,
      colors: COLORS.memory,
    }),
    join(opts.assets, file)
  )
}
