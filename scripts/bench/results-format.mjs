// Shared helpers for results/results.json and the generated README tables.
import { readFileSync, writeFileSync } from 'node:fs'

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

export const tableLabel = (config) =>
  config.unreleased
    ? `${config.label} (unreleased${config.branch ? `, built from ${config.branch}` : ''})`
    : config.label

export const renderTable = (results, platform) => {
  const rows = results.configs
    .filter((c) => c[platform])
    .sort((a, b) => a[platform].median - b[platform].median)
    .map(
      (c) =>
        `| ${tableLabel(c)} | ${c[platform].median.toFixed(2)} | ${c[platform].ratioToStyleSheet.toFixed(2)} |`
    )
  return ['| Library | Time [ms] | Relative to StyleSheet |', '| --- | --- | --- |', ...rows].join(
    '\n'
  )
}

// Rewrites the tables between <!-- results:<platform> --> and <!-- /results:<platform> --> markers.
export const updateReadme = (path, results, platforms = ['ios', 'android']) => {
  let text = readFileSync(path, 'utf8')
  for (const platform of platforms) {
    const open = `<!-- results:${platform} -->`
    const close = `<!-- /results:${platform} -->`
    const start = text.indexOf(open)
    const end = text.indexOf(close)
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`${path}: missing ${open} ... ${close} markers`)
    }
    text = `${text.slice(0, start + open.length)}\n${renderTable(results, platform)}\n${text.slice(end)}`
  }
  writeFileSync(path, text)
}
