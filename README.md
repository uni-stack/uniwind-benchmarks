# Uniwind Benchmarks

Benchmark repository for different React Native styling libraries.

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

## Prerequisites

- [Bun](https://bun.sh/) v1.2.22 or later
- Node.js >= 20
- React Native development environment setup

## Getting Started

### Installation

```bash
# Install all dependencies
bun install
```

### Available Commands

```bash
# Lint all files
bun run lint

# Lint and auto-fix
bun run lint:fix

# Format all files
bun run format

# Type check
bun run typecheck

# Run pre-commit checks (lint + typecheck)
bun run precommit
```

### Working with Apps

Each app in the `apps/` folder is a standalone React Native application:

```bash
# Navigate to an app
cd apps/nativewind4

# Start Metro bundler
bun run start

# Run on iOS
bun run ios

# Run on Android
bun run android
```

## Benchmark Package

The `packages/benchmark` folder contains shared utilities that can be imported by any app:

```typescript
import { add } from '@uniwind-benchmarks/benchmark'

const result = add(2, 3) // 5
```

### Adding New Functions

1. Edit `packages/benchmark/src/index.ts`
2. Export your function
3. Run `bun run typecheck` to verify TypeScript
4. Use it in any app via `@uniwind-benchmarks/benchmark`

## Development Workflow

1. Make changes to the benchmark package or any app
2. Run `bun run typecheck` to ensure TypeScript validity
3. Run `bun run lint:fix` to format code
4. Test your changes in the relevant apps
