# Uniwind Benchmarks

Benchmark repository for different React Native styling libraries.

iPhone 17 Pro running iOS 26.0 in Release mode.
Result after opening the app for the second time (cached by the OS).

Uniwind, NativeWind 4 and NativeWind 5 use the exact same classNames.

It’s difficult to directly compare Unistyles, Uniwind, and NativeWind to StyleSheet, as it has no features, it only serves as a baseline for performance.

## Results

<img src="./assets/chart-ios.png" alt="iOS Benchmark Chart">
<img src="./assets/chart-android.png" alt="Android Benchmark Chart">

### iOS

| Library | Time (ms) | vs Uniwind |
| --- | --- | --- |
| StyleSheet | 49.74 | 1.6x faster |
| Uniwind Pro RC | 57.11 | 1.4x faster |
| Unistyles | 66.40 | 1.2x faster |
| **Uniwind** | **81.36** | **baseline** |
| NativeWind 4 | 197.22 | 2.4x slower |
| NativeWind 5 | 258.49 | 3.2x slower |

### Android

| Library | Time (ms) | vs Uniwind |
| --- | --- | --- |
| StyleSheet | 60.78 | 1.5x faster |
| Uniwind Pro RC | 71.19 | 1.3x faster |
| Unistyles | 79.69 | 1.2x faster |
| **Uniwind** | **94.14** | **baseline** |
| NativeWind 4 | 226.66 | 2.4x slower |
| NativeWind 5 | 270.19 | 2.9x slower |

## Screenshots

<img src="./assets/stylesheet.png" width="300" alt="Stylesheet">
<img src="./assets/unistyles3.png" width="300" alt="Unistyles">
<img src="./assets/uniwind.png" width="300" alt="Uniwind">
<img src="./assets/uniwind-pro.png" width="300" alt="Uniwind Pro">
<img src="./assets/nativewind.png" width="300" alt="NativeWind 4">
<img src="./assets/nativewind5.png" width="300" alt="NativeWind 5">

## Repository Structure

```
uniwind-benchmarks/
├── apps/                    # React Native applications
│   ├── nativewind4/        # NativeWind v4 benchmark app
│   ├── nativewind5/        # NativeWind v5 benchmark app
│   ├── stylesheet/         # React Native StyleSheet benchmark app
│   ├── unistyles3/         # Unistyles v3 benchmark app
│   ├── uniwind/            # Uniwind benchmark app
│   └── uniwind-pro/        # Uniwind Pro benchmark app
├── packages/
│   └── benchmark/          # Shared benchmark utilities
├── biome.json              # Biome configuration (linting + formatting)
├── tsconfig.json           # TypeScript configuration
└── package.json            # Workspace root configuration
```
