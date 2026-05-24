/**
 * __mocks__/react.js
 * Minimal React mock for Jest test environment.
 * FIX: File was empty — caused all component tests to crash on import.
 */
const React = {
  createElement: jest.fn((type, props, ...children) => ({ type, props, children })),
  createContext: jest.fn((defaultValue) => ({
    Provider: jest.fn(({ children }) => children),
    Consumer: jest.fn(({ children }) => children(defaultValue)),
    _currentValue: defaultValue,
  })),
  useContext: jest.fn((ctx) => ctx._currentValue),
  useState: jest.fn((initial) => {
    let val = initial;
    const setter = jest.fn((next) => { val = typeof next === 'function' ? next(val) : next; });
    return [val, setter];
  }),
  useEffect: jest.fn((fn) => { fn(); }),
  useLayoutEffect: jest.fn((fn) => { fn(); }),
  useRef: jest.fn((initial) => ({ current: initial })),
  useCallback: jest.fn((fn) => fn),
  useMemo: jest.fn((fn) => fn()),
  useReducer: jest.fn((reducer, initial) => [initial, jest.fn()]),
  Component: class Component {
    render() { return null; }
  },
  PureComponent: class PureComponent {
    render() { return null; }
  },
  Fragment: 'Fragment',
  Children: {
    map: jest.fn((children, fn) => (Array.isArray(children) ? children.map(fn) : fn(children, 0))),
    forEach: jest.fn(),
    count: jest.fn(() => 0),
    only: jest.fn((c) => c),
    toArray: jest.fn((c) => (Array.isArray(c) ? c : [c])),
  },
  isValidElement: jest.fn(() => true),
  cloneElement: jest.fn((el, props) => ({ ...el, props: { ...el?.props, ...props } })),
  forwardRef: jest.fn((fn) => fn),
  memo: jest.fn((fn) => fn),
  version: '18.0.0',
  // Required by react-test-renderer and @testing-library/react-native
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentOwner: { current: null },
    ReactCurrentDispatcher: { current: null },
    ReactCurrentBatchConfig: { transition: 0 },
    assign: Object.assign,
  },
};

module.exports = React;
module.exports.default = React;
