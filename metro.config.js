/**
 * Wander — Zhich, Yu, Justin
 * Metro configuration. Expo's default config (which handles the npm
 * workspaces monorepo on its own) plus one fix: pdf-lib depends on tslib
 * 1.x, whose "import" export (modules/index.js) default-imports a CommonJS
 * file and breaks under Metro's package-exports resolution on web. Resolve
 * tslib to its plain ES module build instead.
 */

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/** Redirects bare "tslib" imports to tslib.es6.js; everything else resolves normally. */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return { type: 'sourceFile', filePath: path.join(path.dirname(require.resolve('tslib')), 'tslib.es6.js') };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
