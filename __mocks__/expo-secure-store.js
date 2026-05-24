const store = {};
module.exports = {
  setItemAsync: jest.fn(async (k, v) => { store[k] = v; }),
  getItemAsync: jest.fn(async (k) => store[k] ?? null),
  deleteItemAsync: jest.fn(async (k) => { delete store[k]; }),
  _store: store,
  _clear: () => Object.keys(store).forEach(k => delete store[k]),
};
