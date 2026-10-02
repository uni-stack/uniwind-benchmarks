/**
 * Benchmark scenarios. One build serves both, the scenario is picked at launch:
 * - render: re-mount the list of 1000 items (the default)
 * - theme: mount the list once, then switch between the light and dark theme
 */
export type Scenario = 'render' | 'theme'

export type Theme = 'light' | 'dark'

/**
 * iOS: launch argument `-benchmarkScenario theme` (NSUserDefaults argument domain, read through Settings).
 * Android: VIEW intent with data `uwbench://theme` (read through Linking).
 */
export const SCENARIO_LAUNCH_KEY = 'benchmarkScenario'
export const SCENARIO_URL_SCHEME = 'uwbench://'

/**
 * The React Native modules used to read the launch scenario. Apps pass their own, so this package never
 * imports react-native (the Expo app resolves a different react-native copy than the bare apps).
 */
export interface ScenarioSource {
  Settings: { get(key: string): unknown }
  Linking: { getInitialURL(): Promise<string | null> }
}

const isScenario = (value: unknown): value is Scenario => value === 'render' || value === 'theme'

/**
 * Reads the scenario the app was launched with, `render` when none was given.
 * On Android, Settings is a fallback that logs a warning and returns null.
 */
export async function readScenario(source?: ScenarioSource): Promise<Scenario> {
  if (!source) {
    return 'render'
  }

  const fromSettings = source.Settings.get(SCENARIO_LAUNCH_KEY)

  if (isScenario(fromSettings)) {
    return fromSettings
  }

  const url = await source.Linking.getInitialURL().catch(() => null)
  const fromUrl = url?.startsWith(SCENARIO_URL_SCHEME)
    ? url.slice(SCENARIO_URL_SCHEME.length)
    : null

  return isScenario(fromUrl) ? fromUrl : 'render'
}

export interface AppearanceLike {
  getColorScheme(): string | null | undefined
  addChangeListener(listener: (preferences: { colorScheme?: string | null }) => void): {
    remove(): void
  }
}

/**
 * For libraries whose theme follows React Native's Appearance (NativeWind): calls `apply` and resolves once
 * the native color scheme change event arrived, which is what makes those libraries re-render.
 */
export function applyColorScheme(
  Appearance: AppearanceLike,
  theme: Theme,
  apply: () => void
): Promise<void> {
  return new Promise((resolve) => {
    if (Appearance.getColorScheme() === theme) {
      apply()
      resolve()

      return
    }

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme === theme) {
        subscription.remove()
        resolve()
      }
    })

    apply()
  })
}
