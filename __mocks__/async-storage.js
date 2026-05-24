/**
 * __mocks__/async-storage.js
 * FIX: File was missing — referenced in package.json moduleNameMapper
 * but not included in the zip, causing module resolution errors.
 */
const store = {};

const AsyncStorage = {
  setItem: jest.fn(async (k, v) => { store[k] = v; }),
  getItem: jest.fn(async (k) => store[k] ?? null),
  removeItem: jest.fn(async (k) => { delete store[k]; }),
  multiSet: jest.fn(async (pairs) => pairs.forEach(([k, v]) => { store[k] = v; })),
  multiGet: jest.fn(async (keys) => keys.map((k) => [k, store[k] ?? null])),
  multiRemove: jest.fn(async (keys) => keys.forEach((k) => delete store[k])),
  getAllKeys: jest.fn(async () => Object.keys(store)),
  clear: jest.fn(async () => Object.keys(store).forEach((k) => delete store[k])),
  _store: store,
  _clear: () => Object.keys(store).forEach((k) => delete store[k]),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
