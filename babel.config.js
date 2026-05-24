/**
 * babel.config.js
 *
 * FIX: File was missing from production zip.
 * Without this, Jest cannot transpile ES modules (import/export syntax)
 * used throughout the source files, causing the entire test suite to fail
 * with "SyntaxError: Cannot use import statement in a module" errors.
 *
 * Also required for Expo bundler (Metro) to build the app.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Optional chaining (?.) and nullish coalescing (??) — used in several screens
      '@babel/plugin-proposal-optional-chaining',
      '@babel/plugin-proposal-nullish-coalescing-operator',
    ],
  };
};
