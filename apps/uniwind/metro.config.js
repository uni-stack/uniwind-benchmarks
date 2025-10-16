const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withUniwindConfig } = require('uniwind/metro')
const path = require('node:path')

const workspaceRoot = path.resolve(__dirname, '../../')

const defaultConfig = getDefaultConfig(__dirname)
const config = {
  watchFolders: [workspaceRoot],
}
const mergedConfigs = mergeConfig(defaultConfig, config)

module.exports = withUniwindConfig(mergedConfigs, {
  cssEntryFile: './global.css',
})
