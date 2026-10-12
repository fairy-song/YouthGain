'use strict';

// CRA 5 leaves allowedHost undefined when HOST is a loopback address.
// Keep host validation enabled without editing the installed dependencies.
const configPath = require.resolve('react-scripts/config/webpackDevServer.config');
const makeConfig = require(configPath);
require.cache[configPath].exports = (proxy, allowedHost) => {
  const config = makeConfig(proxy, allowedHost || 'localhost');
  config.allowedHosts = ['localhost', '127.0.0.1'];
  return config;
};

// A served index page alone does not prove that the source compiled correctly.
const webpackPath = require.resolve('webpack');
const webpack = require(webpackPath);
const trackedWebpack = (...args) => {
  const compiler = webpack(...args);
  compiler.hooks.done.tap('YouthGainStartup', stats => {
    console.log(stats.hasErrors() ? 'YOUTHGAIN_COMPILE_ERROR' : 'YOUTHGAIN_COMPILE_READY');
  });
  return compiler;
};
for (const key of Object.keys(webpack)) {
  Object.defineProperty(trackedWebpack, key, Object.getOwnPropertyDescriptor(webpack, key));
}
require.cache[webpackPath].exports = trackedWebpack;
require('react-scripts/scripts/start');
