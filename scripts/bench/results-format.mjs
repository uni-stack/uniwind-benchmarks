// Shared helpers for results/results.json and the generated README tables.
import { readFileSync, writeFileSync } from 'node:fs'
import { baselineId, highlightedId } from '../chart.mjs'

// results.json was first written by Python: measured values are floats (1.0, 58.0), counts are ints.
const INT_KEYS = new Set(['cores', 'n'])
const num = (key, value) =>
  Number.isInteger(value) && !INT_KEYS.has(key) ? JSON.rawJSON(value.toFixed(1)) : value

export const readResults = (path) => JSON.parse(readFileSync(path, 'utf8'))

export const stringifyResults = (results) =>
  `${JSON.stringify(
    results,
    (key, value) => {
      if (typeof value === 'number') return num(key, value)
      if (Array.isArray(value)) return value.map((v) => (typeof v === 'number' ? num(key, v) : v))
      return value
    },
    2
  )}\n`

export const writeResults = (path, results) => writeFileSync(path, stringifyResults(results))

// <platform>.branch overrides the config's branch when one platform was measured from a different build.
export const tableLabel = (config, platform) => {
  const branch = config[platform]?.branch ?? config.branch
  return config.unreleased
    ? `${config.label} (unreleased${branch ? `, built from ${branch}` : ''})`
    : config.label
}

// The highlighted config (scripts/bench/configs.json) is bold, as in the charts.
const rowLabel = (results, c, platform) =>
  c.id === highlightedId(results) ? `**${tableLabel(c, platform)}**` : tableLabel(c, platform)

// Time, the same "Nx faster/slower" against the baseline (Uniwind) as the charts, and the ratio to StyleSheet.
export const renderTable = (results, platform) => {
  const base = results.configs.find((c) => c.id === baselineId(results))
  const baseMedian = base?.[platform]?.median
  const relative = (c) => {
    if (!baseMedian) return '-'
    if (c.id === base.id) return 'baseline'
    const ratio = c[platform].median / baseMedian
    return ratio < 1 ? `${(1 / ratio).toFixed(2)}x faster` : `${ratio.toFixed(2)}x slower`
  }
  const rows = results.configs
    .filter((c) => c[platform])
    .sort((a, b) => a[platform].median - b[platform].median)
    .map(
      (c) =>
        `| ${rowLabel(results, c, platform)} | ${c[platform].median.toFixed(2)} | ${relative(c)} | ${c[platform].ratioToStyleSheet.toFixed(2)} |`
    )
  return [
    `| Library | Time [ms] | vs ${base?.label ?? 'baseline'} | Relative to StyleSheet |`,
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

// Memory after the run (forced GC), in MB, with the difference to StyleSheet; iOS also has the peak.
export const renderMemoryTable = (results, platform) => {
  const measured = results.configs.filter((c) => c[platform]?.memory)
  if (measured.length === 0) return '_Not measured yet._'
  const ss = results.configs.find((c) => c.id === 'stylesheet')?.[platform]?.memory?.median
  const withPeak = measured.some((c) => c[platform].memory.peak)
  const delta = (c, m) =>
    c.id === 'stylesheet'
      ? 'baseline'
      : ss
        ? `${m - ss >= 0 ? '+' : ''}${(m - ss).toFixed(1)}`
        : '-'
  const rows = measured
    .sort((a, b) => a[platform].memory.median - b[platform].memory.median)
    .map((c) => {
      const m = c[platform].memory
      const peak = withPeak ? ` ${m.peak ? m.peak.toFixed(1) : '-'} |` : ''
      return `| ${rowLabel(results, c, platform)} | ${m.median.toFixed(1)} | ${delta(c, m.median)} |${peak}`
    })
  const head = `| Library | Memory [MB] | vs StyleSheet [MB] |${withPeak ? ' Peak [MB] |' : ''}`
  return [head, `| --- | --- | --- |${withPeak ? ' --- |' : ''}`, ...rows].join('\n')
}

const replaceBetween = (path, text, name, body) => {
  const open = `<!-- ${name} -->`
  const close = `<!-- /${name} -->`
  const start = text.indexOf(open)
  const end = text.indexOf(close)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${path}: missing ${open} ... ${close} markers`)
  }
  return `${text.slice(0, start + open.length)}\n${body}\n${text.slice(end)}`
}

// Rewrites the tables between <!-- results:<platform> --> / <!-- memory:<platform> --> and their closing markers.
export const updateReadme = (path, results, platforms = ['ios', 'android']) => {
  let text = readFileSync(path, 'utf8')
  for (const platform of platforms) {
    text = replaceBetween(path, text, `results:${platform}`, renderTable(results, platform))
    text = replaceBetween(path, text, `memory:${platform}`, renderMemoryTable(results, platform))
  }
  writeFileSync(path, text)
}
