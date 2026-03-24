const { getDefaultConfig } = require('expo/metro-config')
const { withNativewind } = require('nativewind/metro')
const path = require('node:path')

const workspaceRoot = path.resolve(__dirname, '../../')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

config.watchFolders = [workspaceRoot]
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: ['../../node_modules', './node_modules'],
}

module.exports = withNativewind(config)
