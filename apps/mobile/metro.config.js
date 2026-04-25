const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const projectNodeModules = path.resolve(projectRoot, 'node_modules');
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules');
const expoUrlNodeModules = path.resolve(
  workspaceNodeModules,
  'whatwg-url-without-unicode',
  'node_modules'
);

const config = getDefaultConfig(projectRoot);

const shouldUseWorkspaceRoot =
  workspaceRoot !== projectRoot &&
  fs.existsSync(path.join(workspaceRoot, 'package.json')) &&
  !fs.existsSync(projectNodeModules) &&
  fs.existsSync(workspaceNodeModules);

if (shouldUseWorkspaceRoot) {
  config.watchFolders = [workspaceRoot];
  config.resolver.nodeModulesPaths = [
    projectNodeModules,
    workspaceNodeModules,
    expoUrlNodeModules,
  ].filter((candidatePath) => fs.existsSync(candidatePath));

  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    ...(fs.existsSync(path.join(expoUrlNodeModules, 'webidl-conversions'))
      ? {
          'webidl-conversions': path.join(expoUrlNodeModules, 'webidl-conversions'),
        }
      : {}),
  };
}

module.exports = config;
