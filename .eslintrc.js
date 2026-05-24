/**
 * .eslintrc.js — MamaCare ESLint Configuration
 * ──────────────────────────────────────────────
 * Security-aware rules for a React Native app handling Personal Health Information.
 *
 * Three priorities:
 *   1. Catch PHI leakage patterns (console.log with sensitive params, etc.)
 *   2. Enforce code quality baseline (unused vars, no-eval, etc.)
 *   3. React Native best practices
 *
 * Run: npm run lint
 * Fix: npm run lint:fix
 */

module.exports = {
  root: true,
  env: {
    browser: false,
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    requireConfigFile: false,
    babelOptions: { presets: ['babel-preset-expo'] },
  },
  plugins: ['react', 'react-hooks', 'react-native'],
  settings: { react: { version: 'detect' } },
  rules: {
    // ── Code Quality ─────────────────────────────────────────────────────────
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-undef': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['warn', 'all'],

    // ── Security: PHI Leakage ─────────────────────────────────────────────────
    'no-restricted-syntax': [
      'warn',
      {
        selector:
          'CallExpression[callee.object.name="console"][callee.property.name="error"][arguments.length>1]',
        message:
          '[BUG-008] console.error() with 2+ args may log PHI. Log err?.message only, never the raw error object.',
      },
      {
        selector:
          'CallExpression[callee.object.name="console"][callee.property.name="log"][arguments.length>1]',
        message:
          '[BUG-008] console.log() with 2+ args may log PHI. Log counts/codes, not raw objects.',
      },
      {
        selector: 'Literal[value=/^http:\\/\\//]',
        message: '[SECURITY] Hardcoded http:// URL. Use https:// or process.env.EXPO_PUBLIC_API_BASE_URL.',
      },
      {
        selector: 'Literal[value=/api\\.mamacare\\.app/]',
        message: '[SECURITY] Hardcoded domain. Use process.env.EXPO_PUBLIC_API_BASE_URL instead.',
      },
    ],

    // ── React ─────────────────────────────────────────────────────────────────
    'react/prop-types': 'off',
    'react/display-name': 'off',
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // ── React Native ──────────────────────────────────────────────────────────
    'react-native/no-unused-styles': 'warn',
    'react-native/split-platform-components': 'warn',
    'react-native/no-raw-text': 'off',
    'react-native/no-color-literals': 'warn',
    'react-native/no-inline-styles': 'warn',
  },

  overrides: [
    {
      files: ['**/__tests__/**/*.{js,jsx}', '**/*.test.{js,jsx}', '**/__mocks__/**/*.js'],
      rules: {
        'no-restricted-syntax': 'off',
        'no-undef': 'off',
        'react-native/no-inline-styles': 'off',
        'react-native/no-color-literals': 'off',
      },
    },
    {
      files: ['backend/**/*.js'],
      env: { node: true, browser: false },
      rules: {
        'react-native/no-unused-styles': 'off',
        'react-native/no-color-literals': 'off',
        'react-native/no-inline-styles': 'off',
        'react-native/split-platform-components': 'off',
      },
    },
  ],

  ignorePatterns: ['node_modules/', 'coverage/', '.expo/', 'dist/', 'build/', '*.min.js', 'android/', 'ios/'],
};
