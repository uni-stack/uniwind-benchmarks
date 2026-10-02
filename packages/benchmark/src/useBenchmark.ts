import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { BENCHMARK_CONFIG, type BenchmarkStats, calculateStats } from './index'
import { type Scenario, type ScenarioSource, type Theme, readScenario } from './scenario'

export interface UseBenchmarkOptions {
  /**
   * Reads the scenario from the launch arguments (see scenario.ts). Without it the app always runs
   * the render scenario.
   */
  scenarioSource?: ScenarioSource

  /**
   * Switches the library to a theme. Return a promise when the switch is applied asynchronously,
   * the measurement then starts waiting for idle once it resolves. Required for the theme scenario.
   */
  setTheme?: (theme: Theme) => void | Promise<void>
}

export interface UseBenchmarkReturn {
  // State
  measurements: number[]
  currentRun: number
  isComplete: boolean
  renderKey: number

  // Scenario this launch measures, null until it was read from the launch arguments
  scenario: Scenario | null
  // What one run is ("runs" / "theme changes"), shown next to the results
  runsLabel: string

  // Stats
  stats: BenchmarkStats

  // Computed values for backward compatibility
  average: number
  min: number
  max: number

  // Config
  totalRuns: number
  itemsCount: number
}

/**
 * Custom hook to run benchmark measurements
 * Automatically runs multiple render cycles (or theme changes) and tracks performance
 *
 * render: every run re-mounts the list (new renderKey)
 * theme: the list stays mounted, every run switches the theme (dark, light, dark, ...), after an
 * unmeasured switch to light so that every measured run is a real change
 *
 * Each run is timed from the state / theme change until the JS thread is idle again.
 *
 * @returns Benchmark state and statistics
 */
export function useBenchmark(options: UseBenchmarkOptions = {}): UseBenchmarkReturn {
  const { scenarioSource, setTheme } = options
  const [scenario, setScenario] = useState<Scenario | null>(scenarioSource ? null : 'render')
  const [isReady, setIsReady] = useState(false)
  const [measurements, setMeasurements] = useState<number[]>([])
  const [currentRun, setCurrentRun] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [renderKey, setRenderKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    readScenario(scenarioSource).then(async (launched) => {
      // An app without theme support always measures rendering
      const next = launched === 'theme' && setTheme ? 'theme' : 'render'

      if (next === 'theme' && setTheme) {
        await setTheme('light')
      }

      if (!cancelled) {
        setScenario(next)
        setIsReady(true)
      }
    })

    return () => {
      cancelled = true
    }
    // Read once per launch
  }, [])

  const runBenchmark = useCallback(
    (run: number) => {
      // @ts-ignore
      const startTime = performance.now()

      const measure = () => {
        // Measure after layout
        // @ts-ignore
        requestIdleCallback(() => {
          // @ts-ignore
          const endTime = performance.now()
          const duration = endTime - startTime

          setMeasurements((prev: number[]) => [...prev, duration])
          setCurrentRun((prev: number) => prev + 1)
        })
      }

      if (scenario === 'theme' && setTheme) {
        const pending = setTheme(run % 2 === 0 ? 'dark' : 'light')

        if (pending) {
          pending.then(measure)

          return
        }

        measure()

        return
      }

      // Force a re-render to measure
      setRenderKey((prev: number) => prev + 1)
      measure()
    },
    [scenario, setTheme]
  )

  useLayoutEffect(() => {
    if (!isReady) {
      return
    }

    if (currentRun < BENCHMARK_CONFIG.RUNS) {
      // Small delay between runs to ensure clean measurements
      const timer = setTimeout(() => {
        runBenchmark(currentRun)
      }, BENCHMARK_CONFIG.DELAY_BETWEEN_RUNS)
      return () => clearTimeout(timer)
    }
    if (currentRun === BENCHMARK_CONFIG.RUNS && !isComplete) {
      setIsComplete(true)
    }
  }, [currentRun, runBenchmark, isComplete, isReady])

  const stats = calculateStats(measurements)

  return {
    measurements,
    currentRun,
    isComplete,
    renderKey,
    scenario,
    runsLabel: scenario === 'theme' ? 'theme changes' : 'runs',
    stats,
    average: stats.average,
    min: stats.min,
    max: stats.max,
    totalRuns: BENCHMARK_CONFIG.RUNS,
    itemsCount: BENCHMARK_CONFIG.ITEMS_COUNT,
  }
}
