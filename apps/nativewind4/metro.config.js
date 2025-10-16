const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('node:path')

const workspaceRoot = path.resolve(__dirname, '../../')

const defaultConfig = getDefaultConfig(__dirname)
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: ['../../node_modules', './node_modules'],
  },
}
const mergedConfigs = mergeConfig(defaultConfig, config)

module.exports = withNativeWind(mergedConfigs, { input: './global.css' })
