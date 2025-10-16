/**
 * Configuration for benchmark runs
 */
export const BENCHMARK_CONFIG = {
  RUNS: 10,
  ITEMS_COUNT: 1000,
  DELAY_BETWEEN_RUNS: 100,
} as const

/**
 * Calculate average from an array of numbers
 * @param values - Array of numbers
 * @returns Average value
 */
export function calculateAverage(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, val) => sum + val, 0) / values.length
}

/**
 * Calculate minimum value from an array
 * @param values - Array of numbers
 * @returns Minimum value
 */
export function calculateMin(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return Math.min(...values)
}

/**
 * Calculate maximum value from an array
 * @param values - Array of numbers
 * @returns Maximum value
 */
export function calculateMax(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return Math.max(...values)
}

/**
 * Calculate standard deviation
 * @param values - Array of numbers
 * @returns Standard deviation
 */
export function calculateStdDev(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const avg = calculateAverage(values)
  const squareDiffs = values.map((value) => (value - avg) ** 2)
  const avgSquareDiff = calculateAverage(squareDiffs)

  return Math.sqrt(avgSquareDiff)
}

/**
 * Calculate median value
 * @param values - Array of numbers
 * @returns Median value
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Calculate statistics for benchmark measurements
 * @param measurements - Array of measurement values
 * @returns Statistics object
 */
export interface BenchmarkStats {
  average: number
  min: number
  max: number
  median: number
  stdDev: number
  count: number
}

export function calculateStats(measurements: number[]): BenchmarkStats {
  return {
    average: calculateAverage(measurements),
    min: calculateMin(measurements),
    max: calculateMax(measurements),
    median: calculateMedian(measurements),
    stdDev: calculateStdDev(measurements),
    count: measurements.length,
  }
}

/**
 * Format milliseconds to a readable string
 * @param ms - Milliseconds
 * @param decimals - Number of decimal places
 * @returns Formatted string
 */
export function formatMs(ms: number, decimals = 2): string {
  return `${ms.toFixed(decimals)}ms`
}

// Export the hook
export { useBenchmark, type UseBenchmarkReturn } from './useBenchmark'
