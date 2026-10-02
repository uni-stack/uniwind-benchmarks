// Merge measure.py runs into results/results.json, then regenerate the README tables and charts.
//
// Usage: node scripts/bench/update-results.mjs <run.json...> [--allow-drift] [--allow-incomplete]
//          [--skip-memory <platform>] [--results <file>] [--readme <file>] [--assets <dir>] [--no-charts] [--dry-run]
//
// A config measured in several run files takes the last file's numbers (e.g. a full round followed by a
// re-measurement of one config whose block drifted). --skip-memory leaves a platform's memory out.
//
// Per measured config and platform: median, ratio against the StyleSheet median already in results.json,
// spread, accepted warm launches, StyleSheet controls, memory (when the run recorded it) and a device/date note. The replaced
// entry is dropped: results.json holds the current numbers only. version/label follow the measured build; `unreleased`, `branch` and `note` are
// cleared once every platform of the config was measured from a published (npm) version.
//
// Refuses when the StyleSheet control median of a config drifted more than 5% from the StyleSheet median
// (the host or device is not in the state the other numbers were taken in). --allow-drift merges anyway
// and also records the value normalized by the controls.
// StyleSheet itself can only be merged in a full round (every config on that platform), because every
// other ratio refers to it.
//
// Theme scenario runs (measure.py --scenario theme) go to <config>.theme.<platform>: median, spread, warm
// launches and controls, no ratio to StyleSheet (it has no themes) and no memory. They never change the
// render entries, version or label; a build version that differs from the config's version is a warning.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readResults, stringifyResults, writeResults } from './results-format.mjs'

const root = resolve(import.meta.dirname, '../..')
const MAX_DRIFT = 0.05
const PLATFORMS = ['ios', 'android']

const { values: opts, positionals: files } = parseArgs({
  allowPositionals: true,
  options: {
    'allow-drift': { type: 'boolean', default: false },
    'allow-incomplete': { type: 'boolean', default: false },
    results: { type: 'string', default: join(root, 'results', 'results.json') },
    readme: { type: 'string', default: join(root, 'README.md') },
    assets: { type: 'string', default: join(root, 'assets') },
    'no-charts': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'skip-memory': { type: 'string', multiple: true, default: [] },
  },
})

if (files.length === 0) {
  console.error(
    'Usage: node scripts/bench/update-results.mjs <run.json...> [--allow-drift] [--dry-run]'
  )
  process.exit(1)
}

const round2 = (x) => Math.round(x * 100) / 100
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const benchConfigs = JSON.parse(
  readFileSync(join(root, 'scripts', 'bench', 'configs.json'), 'utf8')
).configs
const results = readResults(opts.results)
const errors = []
const warnings = []

// Collect measured (config, platform) pairs.
const measured = []
for (const file of files) {
  const run = JSON.parse(readFileSync(file, 'utf8'))
  if (!PLATFORMS.includes(run.platform) || !run.results) {
    errors.push(`${file}: not a measure.py run file`)
    continue
  }
  const scenario = run.scenario ?? 'render'
  for (const [id, r] of Object.entries(run.results)) {
    const earlier = measured.findIndex(
      (m) => m.id === id && m.platform === run.platform && m.scenario === scenario
    )
    if (earlier !== -1) {
      console.log(
        `${id} ${run.platform} ${scenario}: using ${file}, not the earlier ${measured[earlier].file}`
      )
      measured.splice(earlier, 1)
    }
    if (!r.n) errors.push(`${file}: ${id} has no accepted warm launches`)
    else if (!r.complete && !opts['allow-incomplete']) {
      errors.push(
        `${file}: ${id} did not get an accepted block in every sweep (--allow-incomplete)`
      )
    }
    if (scenario === 'theme' && id === 'stylesheet') {
      errors.push(`${file}: StyleSheet has no theme scenario`)
    }
    measured.push({ id, platform: run.platform, scenario, r, run, file })
  }
}

// StyleSheet reference per platform: the existing median, or the new one in a full round.
const reference = {}
for (const platform of PLATFORMS) {
  const onPlatform = measured.filter((m) => m.platform === platform && m.scenario === 'render')
  const ss = onPlatform.find((m) => m.id === 'stylesheet')
  if (ss) {
    const missing = results.configs.filter((c) => !onPlatform.some((m) => m.id === c.id))
    if (missing.length) {
      errors.push(
        `StyleSheet ${platform} can only be merged in a full round; missing ${missing.map((c) => c.id).join(', ')}`
      )
    }
    reference[platform] = ss.r.median
  } else {
    reference[platform] = results.configs.find((c) => c.id === 'stylesheet')?.[platform]?.median
  }
}

for (const m of measured) {
  const ref = reference[m.platform]
  if (!ref) {
    errors.push(`no StyleSheet ${m.platform} median to compare ${m.id} with`)
    continue
  }
  m.ref = ref
  m.drift = m.r.controlMedian ? m.r.controlMedian / ref - 1 : null
  m.name = m.scenario === 'render' ? `${m.id} ${m.platform}` : `${m.id} ${m.platform} ${m.scenario}`
  if (m.drift === null) errors.push(`${m.name}: no StyleSheet control readings`)
  else if (Math.abs(m.drift) > MAX_DRIFT && !opts['allow-drift']) {
    errors.push(
      `${m.name}: StyleSheet controls median ${m.r.controlMedian} ms is ${pct(m.drift)} from the StyleSheet median ${ref} ms (limit 5%). Re-measure on a quieter host, or pass --allow-drift to record it with a normalized value.`
    )
  }
  const known = results.devices?.[m.platform]?.model
  if (known && m.run.device?.model && known !== m.run.device.model) {
    warnings.push(
      `${m.name}: measured on ${m.run.device.model}, results.json devices say ${known}`
    )
  }
}

if (errors.length) {
  console.error(`Refusing to update ${opts.results}:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}

const labelFor = (bench, version) =>
  bench.label.replace('{library}', bench.library).replace('{version}', version)

const entryFor = (m) => {
  const { r, run } = m
  const date = run.startedAt.slice(0, 10)
  const device = [run.device?.model, run.device?.os].filter(Boolean).join(', ')
  const s = run.settings
  const theme = m.scenario === 'theme'
  const entry = {
    median: r.median,
    ...(theme ? {} : { ratioToStyleSheet: round2(r.median / m.ref) }),
    spread: r.spread,
    warmLaunches: r.warmLaunches,
    controls: r.controls,
    measuredOn: date,
    note: `Measured on ${date} on ${device} with scripts/bench/measure.py${theme ? ' --scenario theme' : ''} (${s.sweeps} sweeps x ${s.launches} warm launches${theme ? ', each the average of 10 theme changes' : ''}). StyleSheet controls median ${r.controlMedian} ms, ${pct(m.drift)} vs the StyleSheet median ${m.ref} ms.`,
  }
  if (theme) {
    // no memory in the theme scenario
  } else if (r.memory && !opts['skip-memory'].includes(m.platform)) {
    const { median, peak, spread, launches, controls, controlMedian, breakdown } = r.memory
    entry.memory = {
      median,
      ...(peak ? { peak } : {}),
      spread,
      launches,
      controls,
      controlMedian,
      ...(breakdown ? { breakdown } : {}),
    }
  } else if (!r.memory) {
    warnings.push(
      `${m.id} ${m.platform}: the run has no memory readings, the entry will have no memory`
    )
  }
  if (r.build?.version) {
    entry.build = { version: r.build.version, spec: r.build.spec, published: r.build.published }
  }
  if (Math.abs(m.drift) > MAX_DRIFT) {
    entry.normalized = {
      median: round2((r.median * m.ref) / r.controlMedian),
      ...(theme ? {} : { ratioToStyleSheet: round2(r.median / r.controlMedian) }),
      note: `Merged with --allow-drift: controls drifted ${pct(m.drift)}. normalized = median scaled by StyleSheet median / controls median.`,
    }
  }
  return entry
}

// Theme entries sit next to the render ones and leave the config's version and label alone.
for (const m of measured.filter((m) => m.scenario === 'theme')) {
  const config = results.configs.find((c) => c.id === m.id)
  if (!config) throw new Error(`${m.id}: measure the render scenario first, it is not in results.json`)
  config.theme = { ...config.theme, [m.platform]: entryFor(m) }
  const version = m.r.build?.version
  if (version && config.version && version !== config.version) {
    warnings.push(
      `${m.name}: measured ${version}, the render numbers (and label) are ${config.version}`
    )
  }
}

const byConfig = Map.groupBy(
  measured.filter((m) => m.scenario === 'render'),
  (m) => m.id
)
for (const [id, ms] of byConfig) {
  const bench = benchConfigs.find((c) => c.id === id)
  let config = results.configs.find((c) => c.id === id)
  if (!config) {
    if (!bench) throw new Error(`${id} is neither in results.json nor in configs.json`)
    config = {
      id,
      library: bench.library,
      package: bench.package,
      version: null,
      label: bench.label,
    }
    const order = benchConfigs.map((c) => c.id)
    const at = results.configs.findIndex((c) => order.indexOf(c.id) > order.indexOf(id))
    results.configs.splice(at === -1 ? results.configs.length : at, 0, config)
  }

  for (const m of ms) config[m.platform] = entryFor(m)

  const versions = [...new Set(ms.map((m) => m.r.build?.version).filter(Boolean))]
  if (versions.length > 1)
    warnings.push(`${id}: runs report different versions ${versions.join(', ')}`)
  if (versions.length && bench) {
    config.version = versions[0]
    config.label = labelFor(bench, versions[0])
  } else if (!versions.length) {
    warnings.push(`${id}: no build version in the run, version/label left as ${config.label}`)
  }

  const published = PLATFORMS.filter((p) => config[p]).every((p) =>
    config[p].build ? config[p].build.published : !config.unreleased
  )
  if (published) {
    for (const key of ['unreleased', 'branch', 'note']) delete config[key]
  } else {
    config.unreleased = true
    warnings.push(
      `${id}: not every platform comes from a published version, kept unreleased; review its note/branch`
    )
  }
}

for (const m of measured) {
  if (m.scenario === 'render' && m.run.memoryMetrics && !opts['skip-memory'].includes(m.platform))
    results.memoryMetrics = { ...results.memoryMetrics, [m.platform]: m.run.memoryMetrics }
}

for (const platform of PLATFORMS) {
  const ss = measured.find(
    (m) => m.platform === platform && m.id === 'stylesheet' && m.scenario === 'render'
  )
  if (ss?.run.baseline?.source?.startsWith('rebaseline')) {
    results.sessionBaseline[platform] = ss.run.baseline.value
  }
}
const allReplaced = results.configs.every((c) =>
  PLATFORMS.every(
    (p) =>
      !c[p] ||
      measured.some((m) => m.id === c.id && m.platform === p && m.scenario === 'render')
  )
)
if (allReplaced)
  results.date = measured
    .filter((m) => m.scenario === 'render')
    .map((m) => m.run.startedAt.slice(0, 10))
    .sort()
    .at(-1)

for (const w of warnings) console.warn(`warning: ${w}`)
for (const m of measured) {
  const config = results.configs.find((c) => c.id === m.id)
  const e = m.scenario === 'theme' ? config.theme[m.platform] : config[m.platform]
  const ratio = e.ratioToStyleSheet === undefined ? 'theme' : `x${e.ratioToStyleSheet.toFixed(2)}`
  console.log(
    `${m.id.padEnd(12)} ${m.platform.padEnd(8)} ${String(e.median).padStart(8)} ms  ${ratio}  controls ${pct(m.drift)}${e.normalized ? `  normalized ${e.normalized.median} ms` : ''}${e.memory ? `  memory ${e.memory.median} MB` : ''}`
  )
}

if (opts['dry-run']) {
  process.stdout.write(stringifyResults(results))
  process.exit(0)
}

writeResults(opts.results, results)
console.log(`wrote ${opts.results}`)
execFileSync(
  process.execPath,
  [
    join(root, 'scripts', 'generate-chart.mjs'),
    '--results',
    opts.results,
    '--readme',
    opts.readme,
    '--assets',
    opts.assets,
    ...(opts['no-charts'] ? ['--tables-only'] : []),
  ],
  { stdio: 'inherit' }
)
if (!opts['no-charts']) {
  execFileSync(
    process.execPath,
    [
      join(root, 'scripts', 'generate-memory-chart.mjs'),
      '--results',
      opts.results,
      '--assets',
      opts.assets,
    ],
    { stdio: 'inherit' }
  )
}
console.log(
  'Review README.md prose (dates, notes about unreleased builds) and git diff before committing.'
)
