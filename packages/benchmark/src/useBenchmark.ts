import { useCallback, useLayoutEffect, useState } from 'react'
import { BENCHMARK_CONFIG, type BenchmarkStats, calculateStats } from './index'

export interface UseBenchmarkReturn {
  // State
  measurements: number[]
  currentRun: number
  isComplete: boolean
  renderKey: number

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
 * Automatically runs multiple render cycles and tracks performance
 *
 * @returns Benchmark state and statistics
 */
export function useBenchmark(): UseBenchmarkReturn {
  const [measurements, setMeasurements] = useState<number[]>([])
  const [currentRun, setCurrentRun] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [renderKey, setRenderKey] = useState(0)

  const runBenchmark = useCallback(() => {
    // @ts-ignore
    const startTime = performance.now()

    // Force a re-render to measure
    setRenderKey((prev: number) => prev + 1)

    // Measure after layout
    // @ts-ignore
    requestIdleCallback(() => {
      // @ts-ignore
      const endTime = performance.now()
      const duration = endTime - startTime

      setMeasurements((prev: number[]) => [...prev, duration])
      setCurrentRun((prev: number) => prev + 1)
    })
  }, [])

  useLayoutEffect(() => {
    if (currentRun < BENCHMARK_CONFIG.RUNS) {
      // Small delay between runs to ensure clean measurements
      const timer = setTimeout(() => {
        runBenchmark()
      }, BENCHMARK_CONFIG.DELAY_BETWEEN_RUNS)
      return () => clearTimeout(timer)
    }
    if (currentRun === BENCHMARK_CONFIG.RUNS && !isComplete) {
      setIsComplete(true)
    }
  }, [currentRun, runBenchmark, isComplete])

  const stats = calculateStats(measurements)

  return {
    measurements,
    currentRun,
    isComplete,
    renderKey,
    stats,
    average: stats.average,
    min: stats.min,
    max: stats.max,
    totalRuns: BENCHMARK_CONFIG.RUNS,
    itemsCount: BENCHMARK_CONFIG.ITEMS_COUNT,
  }
}
