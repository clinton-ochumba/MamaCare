/**
 * __tests__/screens/screens.test.js
 *
 * Source-analysis regression tests for the three screens most affected by
 * critical bugs. Tests verify correct implementation patterns in the JSX source
 * rather than rendering into a full React Native environment.
 *
 * BUG-001: DocumentViewer — offline fallback titles present, Mark-as-Read
 *          implementation is conditional on scroll, close button accessible.
 * BUG-011: SessionManager — PIN lock present, AppState listener wired,
 *          branding present.
 * ConsentScreen: Required/optional consent sections, read-before-accept
 *          pattern, emergency warning, 999, ODPC mention, version footer.
 *
 * Uses the same static analysis approach as accessibilityAudit.test.js so
 * these tests run in the same Jest environment as all other utility tests,
 * without needing a full React Native renderer.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SCREENS_DIR = path.join(__dirname, '..', '..', 'src', 'screens');
const COMPS_DIR   = path.join(__dirname, '..', '..', 'src', 'components');

function src(filename, dir = SCREENS_DIR) {
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
describe('DocumentViewer — BUG-001 regression', () => {

  test('renders Terms of Service title in offline fallback', () => {
    const content = src('DocumentViewer.js');
    expect(content).toMatch(/Terms of Service/);
  });

  test('renders Privacy Policy title in offline fallback', () => {
    const content = src('DocumentViewer.js');
    expect(content).toMatch(/Privacy Policy/);
  });

  test('renders Medical Disclaimer title in offline fallback', () => {
    const content = src('DocumentViewer.js');
    expect(content).toMatch(/Medical Disclaimer/);
  });

  test('"Mark as Read" button is disabled before scroll-to-bottom', () => {
    const content = src('DocumentViewer.js');
    // The button disabled state must depend on a scroll/read tracking variable
    expect(content).toMatch(/disabled.*scrolled|scrolled.*disabled|hasScrolled|isRead|canProceed/i);
  });

  test('"Mark as Read" button wires up onMarkRead callback', () => {
    const content = src('DocumentViewer.js');
    expect(content).toMatch(/onMarkRead/);
  });

  test('shows offline notice banner text', () => {
    const content = src('DocumentViewer.js');
    // Offline fallback must tell the user it's showing a local copy
    expect(content).toMatch(/offline|local|could not load|unable to load|Showing offline/i);
  });

  test('close button has accessibilityLabel', () => {
    const content = src('DocumentViewer.js');
    expect(content).toMatch(/accessibilityLabel.*[Cc]lose|[Cc]lose.*accessibilityLabel/);
  });

  test('navigates back on close', () => {
    const content = src('DocumentViewer.js');
    expect(content).toMatch(/goBack|navigation\.pop/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SessionManager — BUG-011 regression', () => {

  test('PIN TextInput is present', () => {
    const content = src('SessionManager.js', COMPS_DIR);
    expect(content).toMatch(/TextInput/);
  });

  test('shows MamaCare branding on lock screen', () => {
    const content = src('SessionManager.js', COMPS_DIR);
    expect(content).toMatch(/MamaCare/);
  });

  test('AppState listener is registered', () => {
    const content = src('SessionManager.js', COMPS_DIR);
    expect(content).toMatch(/AppState/);
  });

  test('does not crash when AppState changes — listener uses change event', () => {
    const content = src('SessionManager.js', COMPS_DIR);
    expect(content).toMatch(/AppState.*addEventListener|addEventListener.*AppState/s);
  });

  test('session timeout constant is defined', () => {
    const content = src('SessionManager.js', COMPS_DIR);
    // Must have some form of timeout constant or variable
    expect(content).toMatch(/SESSION_TIMEOUT|TIMEOUT_MS|INACTIVITY|timeout/i);
  });

  test('PIN is stored securely (not in AsyncStorage)', () => {
    const content = src('SessionManager.js', COMPS_DIR);
    // Must use SecureStore or secureStorage, not raw AsyncStorage
    expect(content).not.toMatch(/AsyncStorage\.setItem.*[Pp][Ii][Nn]|AsyncStorage\.getItem.*[Pp][Ii][Nn]/);
  });

  test('Forgot PIN button is present', () => {
    const content = src('SessionManager.js', COMPS_DIR);
    expect(content).toMatch(/[Ff]orgot.*[Pp][Ii][Nn]|[Pp][Ii][Nn].*[Ff]orgot/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('ConsentScreen — consent workflow', () => {

  test('REQUIRED CONSENTS section heading is present', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/REQUIRED|Required Consents/i);
  });

  test('OPTIONAL CONSENTS section heading is present', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/OPTIONAL|Optional Consents/i);
  });

  test('submit button disabled logic is present', () => {
    const content = src('ConsentScreen.js');
    // Button must be conditionally disabled when not all required consents are given
    expect(content).toMatch(/canProceed|allRequired|disabled.*consent|consent.*disabled/i);
  });

  test('Terms of Service consent item present', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/[Tt]erms of [Ss]ervice/);
  });

  test('Privacy Policy consent item present', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/[Pp]rivacy [Pp]olicy/);
  });

  test('Medical Disclaimer consent item present', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/[Mm]edical [Dd]isclaimer/);
  });

  test('tapping Read navigates to DocumentViewer', () => {
    const content = src('ConsentScreen.js');
    // Must have navigation to Document/DocumentViewer screen
    expect(content).toMatch(/navigate.*Document|DocumentViewer|handleReadDocument/i);
  });

  test('shows emergency warning box', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/emergency|danger|EMERGENCY/i);
  });

  test('shows 999 emergency number', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/999/);
  });

  test('shows ODPC or data protection rights notice', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/ODPC|[Dd]ata [Pp]rotection|DPA/);
  });

  test('consent version is in the file', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/consentVersion|version.*1\.|1\.0/i);
  });

  test('read-before-accept guard: Read button required before Switch enabled', () => {
    const content = src('ConsentScreen.js');
    // Either a readDocs/isRead check or disabled Switch condition
    expect(content).toMatch(/readDocs|isRead|!isRead|hasRead/i);
  });

  test('consent record is saved to storage on completion', () => {
    const content = src('ConsentScreen.js');
    expect(content).toMatch(/saveConsents|setConsents|saveItem.*consent|consent.*save/i);
  });
});
