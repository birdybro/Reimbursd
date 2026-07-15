// SPDX-License-Identifier: GPL-3.0-only
const { getDefaultConfig } = require('expo/metro-config');
const { existsSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^\.{1,2}\/.+\.js$/.test(moduleName)) {
    const sourceModuleName = moduleName.slice(0, -3);
    const sourcePath = resolve(dirname(context.originModulePath), sourceModuleName);

    for (const extension of ['.ts', '.tsx']) {
      if (existsSync(`${sourcePath}${extension}`)) {
        return context.resolveRequest(context, `${sourceModuleName}${extension}`, platform);
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};
config.server.enhanceMiddleware = (middleware) => (request, response, next) => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(request, response, next);
};

module.exports = config;
