// Metro config. Only addition over the Expo default: `.riv` is an asset, so the unicorn's Rive file
// can be bundled with require() and ships over the air like any other asset.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('riv');

module.exports = config;
