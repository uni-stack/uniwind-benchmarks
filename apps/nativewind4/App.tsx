import './global.css'
import { type Theme, applyColorScheme, useBenchmark } from '@uniwind-benchmarks/benchmark'
import { colorScheme } from 'nativewind'
import { Appearance, Linking, ScrollView, Settings, Text, View } from 'react-native'
import { ThemeProvider } from './ThemeProvider'

const scenarioSource = { Settings, Linking }

// NativeWind re-renders when React Native reports the new color scheme, so wait for that event
const setTheme = (theme: Theme) => applyColorScheme(Appearance, theme, () => colorScheme.set(theme))

function App() {
  const { isComplete, currentRun, totalRuns, average, min, max, itemsCount, renderKey, runsLabel } =
    useBenchmark({ scenarioSource, setTheme })

  return (
    <ThemeProvider>
      <View className="flex-1 mt-[100px] px-3">
        <Text className="text-lg text-typography font-bold text-center mb-4">
          Nativewind 4 Benchmark
        </Text>

        {!isComplete ? (
          <View className="p-4 bg-gray rounded-lg mb-4">
            <Text className="text-base text-typography font-semibold text-center mb-1">
              Running benchmark...
            </Text>
            <Text className="text-base text-typography font-semibold text-center mb-1">
              Run {currentRun + 1} of {totalRuns}
            </Text>
          </View>
        ) : (
          <View className="p-4 bg-gray rounded-lg mb-4">
            <Text className="text-base text-typography font-semibold text-center mb-1">
              ✓ Benchmark Complete
            </Text>
            <Text className="text-base text-typography font-semibold text-center mb-1">
              Average: {average.toFixed(2)}ms
            </Text>
            <Text className="text-base text-typography font-semibold text-center mb-1">
              Min: {min.toFixed(2)}ms
            </Text>
            <Text className="text-base text-typography font-semibold text-center mb-1">
              Max: {max.toFixed(2)}ms
            </Text>
            <Text className="text-[14px] text-typography text-center mt-2">
              {itemsCount * 2 + 3} views × {totalRuns} {runsLabel}
            </Text>
          </View>
        )}

        <ScrollView
          key={renderKey}
          contentContainerClassName="gap-2 flex-row flex-wrap"
          showsVerticalScrollIndicator={false}
        >
          {Array.from({ length: itemsCount }, (_, index) => (
            <View
              key={index}
              className="w-[32%] h-[100px] rounded-2xl bg-primary items-center justify-center"
            >
              <Text className="text-typography font-bold text-2xl">{index}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </ThemeProvider>
  )
}

export default App
