const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const path = require('node:path')

const workspaceRoot = path.resolve(__dirname, '../../')

const config = getDefaultConfig(__dirname)
const customConfig = {
  watchFolders: [workspaceRoot],
}

module.exports = mergeConfig(config, customConfig)
