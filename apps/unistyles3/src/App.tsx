import { useBenchmark } from '@uniwind-benchmarks/benchmark'
import { ScrollView, Text, View } from 'react-native'
import { StyleSheet } from 'react-native-unistyles'

function App() {
  const { isComplete, currentRun, totalRuns, average, min, max, itemsCount, renderKey } =
    useBenchmark()

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Unistyles 3 Benchmark</Text>

      {!isComplete ? (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>Running benchmark...</Text>
          <Text style={styles.statsText}>
            Run {currentRun + 1} of {totalRuns}
          </Text>
        </View>
      ) : (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>✓ Benchmark Complete</Text>
          <Text style={styles.statsText}>Average: {average.toFixed(2)}ms</Text>
          <Text style={styles.statsText}>Min: {min.toFixed(2)}ms</Text>
          <Text style={styles.statsText}>Max: {max.toFixed(2)}ms</Text>
          <Text style={styles.statsSubtext}>
            {itemsCount * 2 + 3} views × {totalRuns} runs
          </Text>
        </View>
      )}

      <ScrollView
        key={renderKey}
        contentContainerStyle={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: itemsCount }, (_, index) => (
          <View key={index} style={styles.item}>
            <Text style={styles.text}>{index}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    marginTop: 100,
    paddingHorizontal: 12,
  },
  scrollView: {
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  item: {
    width: '32%',
    height: 100,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: theme.colors.typography,
  },
  statsContainer: {
    padding: 16,
    backgroundColor: theme.colors.gray,
    borderRadius: 8,
    marginBottom: 16,
  },
  statsText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
    color: theme.colors.typography,
  },
  statsSubtext: {
    fontSize: 14,
    color: theme.colors.typography,
    textAlign: 'center',
    marginTop: 8,
  },
  text: {
    color: theme.colors.typography,
    fontSize: 16,
    fontWeight: 'bold',
  },
}))

export default App
