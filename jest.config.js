/**
 * jest.config.js
 *
 * Single project configuration. All tests use the mocked React environment.
 * screens.test.js now uses static source analysis (no RNTL render needed),
 * so all 12 test suites run in the same environment.
 */

module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  clearMocks: true,
  setupFilesAfterEnv: [],

  testMatch: ['**/__tests__/**/*.test.js'],

  moduleNameMapper: {
    '^express$':                                       require.resolve('express'),
    '^body-parser$':                                   require.resolve('body-parser'),
    '^supertest$':                                     require.resolve('supertest'),
    '^expo-secure-store$':                             '<rootDir>/__mocks__/expo-secure-store.js',
    '^@react-native-async-storage/async-storage$':     '<rootDir>/__mocks__/async-storage.js',
    '^expo-sms$':                                      '<rootDir>/__mocks__/expo-sms.js',
    '^expo-av$':                                       '<rootDir>/__mocks__/expo-av.js',
    '^expo-speech$':                                   '<rootDir>/__mocks__/expo-speech.js',
    '^expo-file-system$':                              '<rootDir>/__mocks__/expo-file-system.js',
    '^react-native-webview$':                          '<rootDir>/__mocks__/react-native-webview.js',
    '^react-native$':                                  '<rootDir>/__mocks__/react-native.js',
    '^react$':                                         '<rootDir>/__mocks__/react.js',
    '^africastalking$':                                '<rootDir>/__mocks__/africastalking.js',
  },

  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/*.test.{js,jsx}',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
  },
};
