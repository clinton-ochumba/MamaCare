/**
 * __mocks__/react-native.js
 * FIX: File was completely missing — caused all screen imports to crash.
 * Provides the minimum RN surface used by MamaCare screens.
 */
const createMockComponent = (name) => {
  const Comp = jest.fn(({ children }) => children || null);
  Comp.displayName = name;
  return Comp;
};

const StyleSheet = {
  create: jest.fn((styles) => styles),
  flatten: jest.fn((style) => style),
  hairlineWidth: 1,
};

const Alert = {
  alert: jest.fn(),
};

const Share = {
  share: jest.fn(async () => ({ action: 'sharedAction' })),
};

const AppState = {
  currentState: 'active',
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

const Animated = {
  Value: jest.fn(() => ({
    setValue: jest.fn(),
    interpolate: jest.fn(() => ({})),
  })),
  timing: jest.fn(() => ({ start: jest.fn() })),
  spring: jest.fn(() => ({ start: jest.fn() })),
  View: createMockComponent('Animated.View'),
  Text: createMockComponent('Animated.Text'),
};

const PanResponder = {
  create: jest.fn(() => ({ panHandlers: {} })),
};

const Platform = {
  OS: 'ios',
  select: jest.fn((obj) => obj.ios || obj.default),
};

const Linking = {
  openURL: jest.fn(),
  canOpenURL: jest.fn(async () => true),
};

const Keyboard = {
  dismiss: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

module.exports = {
  StyleSheet,
  Alert,
  Share,
  AppState,
  Animated,
  PanResponder,
  Platform,
  Linking,
  Keyboard,
  View: createMockComponent('View'),
  Text: createMockComponent('Text'),
  TextInput: createMockComponent('TextInput'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  ScrollView: createMockComponent('ScrollView'),
  FlatList: createMockComponent('FlatList'),
  Modal: createMockComponent('Modal'),
  Switch: createMockComponent('Switch'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  SafeAreaView: createMockComponent('SafeAreaView'),
  Image: createMockComponent('Image'),
  Pressable: createMockComponent('Pressable'),
  StatusBar: createMockComponent('StatusBar'),
  Dimensions: { get: jest.fn(() => ({ width: 390, height: 844 })) },
  useColorScheme: jest.fn(() => 'light'),
  useWindowDimensions: jest.fn(() => ({ width: 390, height: 844 })),
};
