/**
 * __tests__/security/securityAudit.test.js
 *
 * Automated security audit tests.
 *
 * These tests scan the source code for known vulnerability patterns and
 * verify the security-critical runtime behaviour of the storage layer.
 *
 * Why static analysis in tests?
 * ─────────────────────────────
 * ESLint rules catch issues at lint time, but they only run when a developer
 * actively runs `npm run lint`. These Jest tests run in CI as part of every
 * push and PR, creating a second enforcement layer that cannot be skipped by
 * pushing with --no-verify.
 *
 * Categories:
 *   SEC-001: No console.error/log called with PHI objects (BUG-008)
 *   SEC-002: No hardcoded API domain strings in source
 *   SEC-003: No http:// URLs in source (must be https://)
 *   SEC-004: All known PHI keys route through SecureStore
 *   SEC-005: ADB backup prevention configured
 *   SEC-006: No API keys hardcoded in source files
 *   SEC-007: Storage module correctly separates PHI vs non-PHI keys
 *   SEC-008: EmergencyAlertManager uses env var, not hardcoded domain
 */

const fs = require('fs');
const path = require('path');

// ─── File helpers ─────────────────────────────────────────────────────────────
const SRC_DIR = path.join(__dirname, '../../src');
const BACKEND_DIR = path.join(__dirname, '../../backend');
const APP_CONFIG = path.join(__dirname, '../../app.config.js');

function readSourceFile(relPath) {
  const fullPath = path.join(SRC_DIR, relPath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function getAllSourceFiles(dir = SRC_DIR) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSourceFiles(fullPath));
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function getFileContent(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-001: No PHI logged to console (BUG-008)', () => {
  // Pattern: console.error(anything, variable) — the second argument
  // is often an error object that may contain response data with PHI.
  // Allowed pattern: console.warn('[Tag] message string') — single string arg.

  const PHI_LOG_PATTERN = /console\.(error|log)\s*\([^)]*,\s*[^)]+\)/g;
  const EXEMPTED_FILES = [
    // Test files intentionally use multiple-arg console calls
    '__tests__',
    '__mocks__',
  ];

  test('no source file contains console.error(label, variable) pattern', () => {
    const violations = [];
    const sourceFiles = getAllSourceFiles();

    for (const filePath of sourceFiles) {
      const isExempted = EXEMPTED_FILES.some((e) => filePath.includes(e));
      if (isExempted) continue;

      const content = getFileContent(filePath);
      const lines = content.split('\n');

      lines.forEach((line, i) => {
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        // Match console.error or console.log with multiple args
        if (/console\.(error|log)\s*\(/.test(line) && /,/.test(line)) {
          // Allow if it's a single-string template literal or concatenation (no bare variable)
          if (!/console\.(error|log)\s*\(['"]\[/.test(line)) {
            violations.push({ file: path.relative(SRC_DIR, filePath), line: i + 1, code: line.trim() });
          }
        }
      });
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.code}`)
        .join('\n');
      throw new Error(
        `[SEC-001] ${violations.length} potential PHI logging violation(s) found:\n${report}\n\n` +
        'Fix: use console.warn("[Module] description:", err?.message || "unknown") — never log raw objects.'
      );
    }

    expect(violations).toHaveLength(0);
  });

  test('CHWDashboard.jsx does not log the raw error object', () => {
    const content = readSourceFile('screens/CHWDashboard.jsx');
    // The original bug was: console.error('Error loading dashboard:', error)
    // The fix should be: console.warn('[CHWDashboard] ...', error?.message)
    expect(content).not.toMatch(/console\.error\('Error loading dashboard:', error\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-002: No hardcoded production domain in source', () => {
  test('EmergencyAlertManager uses env variable, not hardcoded api.mamacare.app', () => {
    const content = readSourceFile('utils/EmergencyAlertManager.js');
    // Should NOT have bare string literal with the domain
    expect(content).not.toMatch(/'https:\/\/api\.mamacare\.app/);
    expect(content).not.toMatch(/"https:\/\/api\.mamacare\.app/);
    // SHOULD have the env variable reference
    expect(content).toMatch(/EXPO_PUBLIC_API_BASE_URL|API_BASE_URL/);
  });

  test('no source file contains the literal string api.mamacare.app', () => {
    const violations = [];
    for (const filePath of getAllSourceFiles()) {
      const content = getFileContent(filePath);
      // Allow in comments and string that starts with process.env
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        if (line.includes('api.mamacare.app') && !line.includes('process.env') && !line.includes('API_BASE_URL')) {
          violations.push(`${path.relative(SRC_DIR, filePath)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    if (violations.length > 0) {
      throw new Error(`[SEC-002] Hardcoded domain in source:\n${violations.join('\n')}`);
    }
    expect(violations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-003: No HTTP (non-HTTPS) URLs in source', () => {
  test('no source file contains http:// URLs', () => {
    const violations = [];
    for (const filePath of getAllSourceFiles()) {
      const content = getFileContent(filePath);
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        if (/['"`]http:\/\//.test(line)) {
          violations.push(`${path.relative(SRC_DIR, filePath)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    if (violations.length > 0) {
      throw new Error(`[SEC-003] http:// URLs found (must use https://):\n${violations.join('\n')}`);
    }
    expect(violations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-004: PHI keys route through SecureStore', () => {
  // These keys contain PHI and MUST be in SENSITIVE_KEYS
  const PHI_KEYS = [
    'user_profile',
    'user_consents',
    'emergency_contacts',
    'symptom_history',
    'alert_throttle_history',
    'chw_visit_queue',
    'app_pin',
    'account_deletion_scheduled',
  ];

  test('all PHI keys are listed in SENSITIVE_KEYS in secureStorage.js', () => {
    const content = readSourceFile('utils/secureStorage.js');
    const missing = PHI_KEYS.filter((key) => !content.includes(`'${key}'`));
    if (missing.length > 0) {
      throw new Error(
        `[SEC-004] These PHI keys are NOT in SENSITIVE_KEYS — they will be stored UNENCRYPTED:\n` +
        `  ${missing.join(', ')}\n\n` +
        'Add them to the SENSITIVE_KEYS array in secureStorage.js.'
      );
    }
    expect(missing).toHaveLength(0);
  });

  test('secureStorage.js imports expo-secure-store (not AsyncStorage) for PHI', () => {
    const content = readSourceFile('utils/secureStorage.js');
    expect(content).toMatch(/import \* as SecureStore from 'expo-secure-store'/);
    expect(content).toMatch(/SecureStore\.setItemAsync/);
    expect(content).toMatch(/SecureStore\.getItemAsync/);
  });

  test('secureStorage.js does not call AsyncStorage.setItem for sensitive data', () => {
    const content = readSourceFile('utils/secureStorage.js');
    // The isSensitive() guard should prevent this, but let's verify the
    // code never directly calls AsyncStorage.setItem('user_profile', ...)
    expect(content).not.toMatch(/AsyncStorage\.setItem\s*\(\s*['"]user_profile/);
    expect(content).not.toMatch(/AsyncStorage\.setItem\s*\(\s*['"]emergency_contacts/);
    expect(content).not.toMatch(/AsyncStorage\.setItem\s*\(\s*['"]symptom_history/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-005: ADB backup prevention', () => {
  test('app.config.js sets allowBackup: false', () => {
    const content = getFileContent(APP_CONFIG);
    expect(content).toMatch(/allowBackup:\s*false/);
  });

  test('app.config.js explicitly sets usesCleartextTraffic: false', () => {
    const content = getFileContent(APP_CONFIG);
    expect(content).toMatch(/usesCleartextTraffic:\s*false/);
  });

  test('app.config.js contains a comment explaining the ADB backup risk', () => {
    const content = getFileContent(APP_CONFIG);
    expect(content).toMatch(/adb backup|ADB backup|ADB Backup/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-006: No API keys hardcoded in source', () => {
  // Common patterns for accidentally committed API keys
  const KEY_PATTERNS = [
    /EXPO_PUBLIC_GOOGLE_STT_KEY\s*=\s*['"][A-Za-z0-9_-]{10,}['"]/,
    /apiKey\s*:\s*['"][A-Za-z0-9_-]{20,}['"]/,
    /api_key\s*=\s*['"][A-Za-z0-9_-]{20,}['"]/,
    /AFRICASTALKING_API_KEY\s*=\s*['"][^'"\s]{10,}['"]/,
    // Google API key format: AIza...
    /AIza[0-9A-Za-z_-]{35}/,
  ];

  test('no source file contains hardcoded API key patterns', () => {
    const violations = [];
    for (const filePath of getAllSourceFiles()) {
      const content = getFileContent(filePath);
      for (const pattern of KEY_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(SRC_DIR, filePath)}: matches ${pattern}`);
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `[SEC-006] Possible hardcoded API key found:\n${violations.join('\n')}\n\n` +
        'Use process.env.EXPO_PUBLIC_* or EAS Secrets. Never commit API keys.'
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('.env file is not committed (must only exist .env.example)', () => {
    const envFile = path.join(__dirname, '../../.env');
    // If .env exists and is not .env.example, it may contain real secrets
    const envContent = fs.existsSync(envFile) ? getFileContent(envFile) : '';
    // It's OK if .env exists locally, but it must not contain real key values
    // (i.e. the values must still be placeholders)
    if (envContent) {
      expect(envContent).not.toMatch(/AIza[0-9A-Za-z_-]{35}/);
      expect(envContent).not.toMatch(/EXPO_PUBLIC_GOOGLE_STT_KEY=[A-Za-z0-9_-]{20,}/);
    }
    // Always pass — .env is gitignored and may legitimately exist locally
    expect(true).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-007: Storage module PHI vs non-PHI separation', () => {
  const SecureStoreMock = require('../../__mocks__/expo-secure-store');
  const AsyncStorageMock = require('../../__mocks__/async-storage');

  // Reset mocks and re-require fresh module before each test
  let secureStorage;
  beforeEach(() => {
    jest.resetModules();
    // Re-implement mock stores fresh
    const secureStore = {};
    const asyncStore = {};
    jest.mock('expo-secure-store', () => ({
      setItemAsync: jest.fn(async (k, v) => { secureStore[k] = v; }),
      getItemAsync: jest.fn(async (k) => secureStore[k] ?? null),
      deleteItemAsync: jest.fn(async (k) => { delete secureStore[k]; }),
    }));
    jest.mock('@react-native-async-storage/async-storage', () => ({
      setItem: jest.fn(async (k, v) => { asyncStore[k] = v; }),
      getItem: jest.fn(async (k) => asyncStore[k] ?? null),
      removeItem: jest.fn(async (k) => { delete asyncStore[k]; }),
      multiRemove: jest.fn(async (keys) => keys.forEach((k) => delete asyncStore[k])),
    }));
    secureStorage = require('../../src/utils/secureStorage').secureStorage;
  });

  test('alert_throttle_history routes to SecureStore', async () => {
    const SecureStore = require('expo-secure-store');
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await secureStorage.setItem('alert_throttle_history', '[]');
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('app_pin routes to SecureStore', async () => {
    const SecureStore = require('expo-secure-store');
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await secureStorage.setItem('app_pin', '1234');
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('ui_language routes to AsyncStorage (not SecureStore)', async () => {
    const SecureStore = require('expo-secure-store');
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await secureStorage.setItem('ui_language', 'sw-KE');
    expect(AsyncStorage.setItem).toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SEC-008: Network security config exists', () => {
  const NETWORK_CONFIG = path.join(
    __dirname,
    '../../android/app/src/main/res/xml/network_security_config.xml'
  );

  test('network_security_config.xml exists', () => {
    expect(fs.existsSync(NETWORK_CONFIG)).toBe(true);
  });

  test('network_security_config.xml blocks cleartext traffic', () => {
    if (!fs.existsSync(NETWORK_CONFIG)) return;
    const content = getFileContent(NETWORK_CONFIG);
    expect(content).toMatch(/cleartextTrafficPermitted="false"/);
  });

  test('network_security_config.xml only trusts system CAs (not user CAs)', () => {
    if (!fs.existsSync(NETWORK_CONFIG)) return;
    const content = getFileContent(NETWORK_CONFIG);
    expect(content).toMatch(/certificates src="system"/);
    // Must NOT blindly trust user-installed certs at the base level
    expect(content).not.toMatch(/<base-config[^>]*>[\s\S]*?certificates src="user"[\s\S]*?<\/base-config>/);
  });

  test('network_security_config.xml covers api.mamacare.app domain', () => {
    if (!fs.existsSync(NETWORK_CONFIG)) return;
    const content = getFileContent(NETWORK_CONFIG);
    expect(content).toMatch(/api\.mamacare\.app/);
  });

  test('network_security_config.xml covers Google STT domain', () => {
    if (!fs.existsSync(NETWORK_CONFIG)) return;
    const content = getFileContent(NETWORK_CONFIG);
    expect(content).toMatch(/speech\.googleapis\.com/);
  });
});
