const fs = require('fs');
const path = require('path');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;
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

function escapePathForRegex(filePath) {
  return filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockPath(filePath) {
  return new RegExp(`${escapePathForRegex(filePath)}(?:[/\\\\].*)?`);
}

function blockNodeModuleNativePath(nodeModulesPath, nativePath) {
  const packagePathPattern = `${escapePathForRegex(nodeModulesPath)}[/\\\\](?:@[^/\\\\]+[/\\\\])?[^/\\\\]+`;
  const nativePathPattern = nativePath
    .split('/')
    .map((segment) => escapePathForRegex(segment))
    .join('[/\\\\]');

  return new RegExp(`${packagePathPattern}[/\\\\]${nativePathPattern}(?:[/\\\\].*)?`);
}

const shouldUseWorkspaceRoot =
  workspaceRoot !== projectRoot &&
  fs.existsSync(path.join(workspaceRoot, 'package.json')) &&
  !fs.existsSync(projectNodeModules) &&
  fs.existsSync(workspaceNodeModules);

if (shouldUseWorkspaceRoot) {
  // The mobile app does not import source from another workspace, and Metro
  // resolves hoisted dependencies through nodeModulesPaths below. Avoid
  // external watch folders so Expo watches only apps/mobile.
  config.watchFolders = [];
  config.resolver.blockList = exclusionList([
    blockPath(path.resolve(workspaceRoot, 'apps/web')),
    blockPath(path.resolve(workspaceRoot, '.git')),
    blockPath(path.resolve(workspaceRoot, '.expo')),
    blockPath(path.resolve(workspaceRoot, 'downloads')),
    blockPath(path.resolve(workspaceRoot, '.next')),
    blockPath(path.resolve(workspaceRoot, 'dist')),
    blockPath(path.resolve(workspaceRoot, 'build')),
    blockPath(path.resolve(workspaceRoot, 'coverage')),
    blockPath(path.resolve(workspaceRoot, 'supabase')),
    blockPath(path.resolve(workspaceRoot, 'test-results')),
    blockPath(path.resolve(projectRoot, '.expo')),
    blockPath(path.resolve(projectRoot, '.expo-shared')),
    blockPath(path.resolve(projectRoot, 'android/.gradle')),
    blockPath(path.resolve(projectRoot, 'android/.cxx')),
    blockPath(path.resolve(projectRoot, 'android/build')),
    blockPath(path.resolve(projectRoot, 'android/app/build')),
    blockPath(path.resolve(projectRoot, 'ios/build')),
    blockPath(path.resolve(projectRoot, 'ios/Pods')),
    blockNodeModuleNativePath(workspaceNodeModules, 'android/.cxx'),
    blockNodeModuleNativePath(workspaceNodeModules, 'android/.gradle'),
    blockNodeModuleNativePath(workspaceNodeModules, 'android/build'),
    blockNodeModuleNativePath(workspaceNodeModules, 'ios/build'),
    blockNodeModuleNativePath(workspaceNodeModules, 'ios/Pods'),
  ]);
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
