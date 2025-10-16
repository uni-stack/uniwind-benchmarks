import './global.css'
import { useBenchmark } from '@uniwind-benchmarks/benchmark'
import { ScrollView, Text, View } from 'react-native'

function App() {
  const { isComplete, currentRun, totalRuns, average, min, max, itemsCount, renderKey } =
    useBenchmark()

  return (
    <View className="flex-1 mt-25 px-3">
      <Text className="text-lg text-typography font-bold text-center mb-4">
        Uniwind Pro Benchmark
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
            {itemsCount} views × {totalRuns} runs
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
            className="w-[32%] h-25 rounded-2xl bg-primary items-center justify-center"
          >
            <Text className="text-typography font-bold text-2xl">{index}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

export default App
