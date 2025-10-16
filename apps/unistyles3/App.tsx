import { useBenchmark } from '@uniwind-benchmarks/benchmark'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

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
            {itemsCount} views × {totalRuns} runs
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

const styles = StyleSheet.create({
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
    backgroundColor: '#273c75',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  statsContainer: {
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 16,
  },
  statsText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  statsSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
})

export default App
