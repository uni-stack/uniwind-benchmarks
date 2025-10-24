# Uniwind Benchmarks

Benchmark repository for different React Native styling libraries.

<img src="./assets//result.jpg" width="500" alt="Result">

iPhone 17 Pro Max running iOS 26.0 in Release mode.
Result after opening the app for the second time (cached by the OS).

Uniwind and NativeWind use the exact same classNames.

It’s difficult to directly compare Unistyles, Uniwind, and Nativewind to StyleSheet, as the it has no features, it only serves as a baseline for performance.


| Library | Time | 
| --- | --- | 
| StyleSheet | 49.74 | 
| Unistyles | 66.40 | 
| Uniwind | 81.47 | 
| NativeWind | 197.22 | 

<img src="./assets/stylesheet.png" width="300" alt="Stylesheet">
<img src="./assets/unistyles3.png" width="300" alt="Unistyles">
<img src="./assets/uniwind.png" width="300" alt="Uniwind">
<img src="./assets/nativewind.png" width="300" alt="NativeWind">

## Repository Structure

```
uniwind-benchmarks/
├── apps/                    # React Native applications
│   ├── nativewind4/        # NativeWind v4 benchmark app
│   ├── stylesheet/         # React Native StyleSheet benchmark app
│   ├── unistyles3/         # Unistyles v3 benchmark app
│   ├── uniwind/            # Uniwind benchmark app
│   └── uniwind-pro/        # Uniwind Pro benchmark app (in development)
├── packages/
│   └── benchmark/          # Shared benchmark utilities
├── biome.json              # Biome configuration (linting + formatting)
├── tsconfig.json           # TypeScript configuration
└── package.json            # Workspace root configuration
```
