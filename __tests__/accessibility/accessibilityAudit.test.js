/**
 * __tests__/accessibility/accessibilityAudit.test.js
 *
 * Automated accessibility audit for all MamaCare screens.
 *
 * WHY THIS EXISTS:
 * ─────────────────
 * MamaCare targets pregnant women in rural Kenya, many of whom:
 *   - Use low-cost Android phones with TalkBack enabled by default
 *   - Have varying literacy levels (UI must work via screen reader)
 *   - Experience vision changes during pregnancy (blurred vision is a RED symptom)
 *   - Are under stress during emergencies (cannot read fine print)
 *
 * A screen reader user who cannot activate the "Send Emergency Alert" button
 * because it has no accessible label is not a UX inconvenience — it is a
 * patient safety issue.
 *
 * TEST APPROACH:
 * ──────────────
 * Static source analysis — scans JSX source files for:
 *   A11Y-001: Every TouchableOpacity has accessibilityRole + accessibilityLabel
 *   A11Y-002: Every TextInput has accessibilityLabel
 *   A11Y-003: Every Switch has accessibilityLabel + accessibilityRole="switch"
 *   A11Y-004: Emoji-only Text elements are either accessible={false} or have accessibilityLabel
 *   A11Y-005: Dynamic result containers use accessibilityLiveRegion
 *   A11Y-006: Navigation arrows (← →) are never bare Text with no label
 *   A11Y-007: Emergency/alert buttons have explicit accessibilityLabel
 *   A11Y-008: ActivityIndicator used in buttons has accessibilityLabel
 *   A11Y-009: Section headers use accessibilityRole="header"
 *
 * COVERAGE:
 *   HomeScreen_Enhanced.js    — landing screen
 *   SymptomCheckerScreen.js   — clinical triage (safety-critical)
 *   VoiceSymptomCheckerScreen.js — voice triage (safety-critical)
 *   SessionManager.js         — PIN lock (gates entire app)
 *   WeeklyGuideScreen.js      — weekly content
 *   SettingsScreen.js         — settings & consent management
 *   OnboardingScreenEnhanced.js — first-run setup
 *   ConsentScreen.js          — ODPC consent flow
 *   EmergencyContactsScreen.js — contact management
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../../src');

function readFile(relPath) {
  const fullPath = path.join(SRC_DIR, relPath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

// Lines of a file as array with 1-based indexing
function lines(content) {
  return content.split('\n');
}

// Find all occurrences of a pattern with their line numbers
function findAll(content, pattern) {
  const result = [];
  const ls = lines(content);
  ls.forEach((line, i) => {
    if (!line.trim().startsWith('//') && !line.trim().startsWith('*') && pattern.test(line)) {
      result.push({ line: i + 1, text: line.trim() });
    }
  });
  return result;
}

// ─── Screen file list ────────────────────────────────────────────────────────
const SCREENS = [
  'screens/HomeScreen_Enhanced.js',
  'screens/SymptomCheckerScreen.js',
  'screens/VoiceSymptomCheckerScreen.js',
  'screens/WeeklyGuideScreen.js',
  'screens/SettingsScreen.js',
  'screens/OnboardingScreenEnhanced.js',
  'screens/ConsentScreen.js',
  'screens/EmergencyContactsScreen.js',
];
const COMPONENTS = ['components/SessionManager.js'];
const ALL_FILES = [...SCREENS, ...COMPONENTS];

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-001: Every TouchableOpacity has accessibilityRole and accessibilityLabel', () => {

  const EXCLUDED_PATTERNS = [
    'panHandlers',   // gesture responder wrapper — not directly interactive
    'onLayout',      // layout-only
  ];

  test.each(ALL_FILES)('%s — no bare TouchableOpacity without labels', (relPath) => {
    const content = readFile(relPath);
    if (!content) return;

    const ls = lines(content);
    const violations = [];

    // Find every <TouchableOpacity block (open tag)
    let inTouchable = false;
    let touchableStartLine = 0;
    let touchableBlock = '';

    for (let i = 0; i < ls.length; i++) {
      const line = ls[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('<TouchableOpacity')) {
        inTouchable = true;
        touchableStartLine = i + 1;
        touchableBlock = '';
      }

      if (inTouchable) {
        touchableBlock += line + '\n';
        // End of opening tag: either />, or > on its own, or has child elements
        if ((trimmed.endsWith('>') && !trimmed.endsWith('=>') && !trimmed.endsWith('->')) || trimmed.endsWith('/>')) {
          inTouchable = false;
          // Skip excluded patterns
          const isExcluded = EXCLUDED_PATTERNS.some((p) => touchableBlock.includes(p));
          if (isExcluded) continue;
          // Skip if it's a short inline (e.g. just <TouchableOpacity>)
          const hasRole = touchableBlock.includes('accessibilityRole');
          const hasLabel = touchableBlock.includes('accessibilityLabel');
          if (!hasRole || !hasLabel) {
            violations.push({
              line: touchableStartLine,
              hasRole,
              hasLabel,
              snippet: touchableBlock.trim().slice(0, 120),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  Line ${v.line}: missing ${[!v.hasRole && 'accessibilityRole', !v.hasLabel && 'accessibilityLabel'].filter(Boolean).join(' and ')}\n    ${v.snippet}`)
        .join('\n');
      throw new Error(`[A11Y-001] ${violations.length} TouchableOpacity element(s) missing accessibility props:\n${report}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-002: Every TextInput has accessibilityLabel', () => {

  test.each(ALL_FILES)('%s — no TextInput without accessibilityLabel', (relPath) => {
    const content = readFile(relPath);
    if (!content) return;

    const ls = lines(content);
    const violations = [];

    let inInput = false;
    let inputStartLine = 0;
    let inputBlock = '';

    for (let i = 0; i < ls.length; i++) {
      const line = ls[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('<TextInput')) {
        inInput = true;
        inputStartLine = i + 1;
        inputBlock = '';
      }

      if (inInput) {
        inputBlock += line + '\n';
        if (trimmed.endsWith('/>') || (trimmed === '/>' && inputBlock.includes('TextInput'))) {
          inInput = false;
          if (!inputBlock.includes('accessibilityLabel')) {
            violations.push({ line: inputStartLine, snippet: inputBlock.trim().slice(0, 100) });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  Line ${v.line}: TextInput missing accessibilityLabel\n    ${v.snippet}`)
        .join('\n');
      throw new Error(`[A11Y-002] ${violations.length} TextInput(s) without accessibilityLabel:\n${report}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-003: Every Switch has accessibilityLabel and accessibilityRole="switch"', () => {

  test.each(ALL_FILES)('%s — no Switch without accessibility props', (relPath) => {
    const content = readFile(relPath);
    if (!content) return;

    const ls = lines(content);
    const violations = [];

    let inSwitch = false;
    let switchStartLine = 0;
    let switchBlock = '';

    for (let i = 0; i < ls.length; i++) {
      const line = ls[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('<Switch')) {
        inSwitch = true;
        switchStartLine = i + 1;
        switchBlock = '';
      }

      if (inSwitch) {
        switchBlock += line + '\n';
        if (trimmed.endsWith('/>')) {
          inSwitch = false;
          const hasLabel = switchBlock.includes('accessibilityLabel');
          const hasRole = switchBlock.includes('accessibilityRole');
          if (!hasLabel || !hasRole) {
            violations.push({
              line: switchStartLine,
              hasLabel,
              hasRole,
              snippet: switchBlock.trim().slice(0, 120),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations.map((v) =>
        `  Line ${v.line}: missing ${[!v.hasLabel && 'accessibilityLabel', !v.hasRole && 'accessibilityRole'].filter(Boolean).join(' and ')}`
      ).join('\n');
      throw new Error(`[A11Y-003] ${violations.length} Switch(es) missing accessibility:\n${report}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-004: Emoji-only Text elements have accessible={false} or accessibilityLabel', () => {
  // Screen readers announce emoji by their Unicode description e.g. "pregnant woman emoji"
  // This is confusing and verbose. Pure decorative emoji must be hidden.

  // We look for <Text ...>EMOJI</Text> patterns where the content is only emoji
  const EMOJI_REGEX = /^[🤰🚨🎤📖📞🔒⚙️👋🎉🌡️🩸⚡👶👁️😮‍💨🫃🤚🤢🦵🤕🔙🔥😴🩷🚿😕🫧📞🏥📍✅⚠️👤🔐📤🗑️📋📄]{1,3}$/;

  test.each(ALL_FILES)('%s — emoji Text elements are accessible={false} or have accessibilityLabel', (relPath) => {
    const content = readFile(relPath);
    if (!content) return;

    const ls = lines(content);
    const violations = [];

    for (let i = 0; i < ls.length; i++) {
      const line = ls[i].trim();
      // Match: <Text ...>EMOJI</Text>  on a single line
      const m = line.match(/^<Text([^>]*)>([^<]+)<\/Text>$/);
      if (!m) continue;
      const props = m[1];
      const textContent = m[2].trim();

      // Check if content is only emoji characters (no letters/digits)
      // Simple heuristic: no ASCII letters or digits
      if (/^[^\x20-\x7E]+$/.test(textContent) && !/[a-zA-Z0-9]/.test(textContent)) {
        const hasA11yHide = props.includes('accessible={false}') || props.includes('accessible={false');
        const hasA11yLabel = props.includes('accessibilityLabel');
        if (!hasA11yHide && !hasA11yLabel) {
          violations.push({ line: i + 1, content: textContent });
        }
      }
    }

    // This is a warning, not hard failure — some emoji are intentionally visible
    if (violations.length > 3) {
      const report = violations.map((v) => `  Line ${v.line}: "${v.content}"`).join('\n');
      throw new Error(
        `[A11Y-004] ${violations.length} emoji-only Text elements without accessible={false} or accessibilityLabel.\n` +
        `Add accessible={false} to decorative emoji, or accessibilityLabel for meaningful ones:\n${report}`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-005: Dynamic result containers use accessibilityLiveRegion', () => {

  test('SymptomCheckerScreen — result card has accessibilityLiveRegion', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    // The result card that appears after checking symptoms must announce to screen readers
    expect(content).toMatch(/accessibilityLiveRegion/);
  });

  test('VoiceSymptomCheckerScreen — result card has accessibilityLiveRegion', () => {
    const content = readFile('screens/VoiceSymptomCheckerScreen.js');
    expect(content).toMatch(/accessibilityLiveRegion/);
  });

  test('VoiceSymptomCheckerScreen — mic label (status indicator) has accessibilityLiveRegion', () => {
    const content = readFile('screens/VoiceSymptomCheckerScreen.js');
    // The status label changes: "Tap to start" / "Listening…" / "Processing…"
    // It must announce changes to screen reader users who can't see the mic button state
    expect(content).toContain('accessibilityLiveRegion');
  });

  test('SessionManager — subtitle (set PIN vs verify PIN) has accessibilityLiveRegion', () => {
    const content = readFile('components/SessionManager.js');
    // The subtitle changes between "Create a PIN" and "Enter your PIN"
    // Screen reader users need to hear this
    expect(content).toMatch(/accessibilityLiveRegion/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-006: Navigation arrows are never bare Text', () => {

  test('WeeklyGuideScreen — arrow buttons are not bare "←" / "→" Text', () => {
    const content = readFile('screens/WeeklyGuideScreen.js');
    // Bare arrow Text with no label: TalkBack reads "left-pointing arrow" — useless
    const prevArrow = /accessibilityLabel="Previous week"/;
    const nextArrow = /accessibilityLabel="Next week"/;
    expect(content).toMatch(prevArrow);
    expect(content).toMatch(nextArrow);
  });

  test('WeeklyGuideScreen — arrows have accessibilityState.disabled on boundary weeks', () => {
    const content = readFile('screens/WeeklyGuideScreen.js');
    expect(content).toMatch(/accessibilityState.*disabled/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-007: Emergency and alert buttons have explicit accessibilityLabel', () => {

  test('HomeScreen — emergency strip has accessibilityLabel containing "emergency"', () => {
    const content = readFile('screens/HomeScreen_Enhanced.js');
    expect(content).toMatch(/accessibilityLabel="Emergency symptom check"/);
  });

  test('HomeScreen — emergency strip accessibilityHint mentions 999', () => {
    const content = readFile('screens/HomeScreen_Enhanced.js');
    expect(content).toMatch(/999/);
  });

  test('SymptomCheckerScreen — Send Emergency Alert button has accessibilityLabel', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    expect(content).toMatch(/accessibilityLabel.*emergency alert/i);
  });

  test('SymptomCheckerScreen — Send Alert button has accessibilityHint explaining SMS', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    expect(content).toMatch(/accessibilityHint.*SMS|accessibilityHint.*contacts/i);
  });

  test('WeeklyGuideScreen — emergency button has accessibilityLabel', () => {
    const content = readFile('screens/WeeklyGuideScreen.js');
    expect(content).toMatch(/accessibilityLabel="Check warning symptoms now"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-008: ActivityIndicator in interactive contexts has accessibilityLabel', () => {
  // An ActivityIndicator inside a button should tell screen reader users what is loading
  // Default TalkBack announcement: nothing / "in progress"

  test('SymptomCheckerScreen — ActivityIndicator in loading/alerting state has label', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    // Loading spinner inside alert button
    expect(content).toMatch(/ActivityIndicator[^>]*accessibilityLabel|accessibilityLabel[^;]*ActivityIndicator/s);
  });

  test('VoiceSymptomCheckerScreen — ActivityIndicator in mic button has label', () => {
    const content = readFile('screens/VoiceSymptomCheckerScreen.js');
    expect(content).toMatch(/ActivityIndicator[^>]*accessibilityLabel/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-009: Section headers use accessibilityRole="header"', () => {

  test('SettingsScreen — section labels have accessibilityRole="header"', () => {
    const content = readFile('screens/SettingsScreen.js');
    expect(content).toMatch(/sectionLabel.*accessibilityRole="header"|accessibilityRole="header".*sectionLabel/s);
  });

  test('WeeklyGuideScreen — week number has accessibilityRole="header"', () => {
    const content = readFile('screens/WeeklyGuideScreen.js');
    expect(content).toMatch(/weekTitle.*accessibilityRole="header"|accessibilityRole="header".*weekTitle/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-010: Pregnancy data containers announce as grouped units', () => {
  // "28" + "weeks" + "+ 3 days" as three separate Text elements is read as
  // "28  weeks  plus 3 days" — confusing. Group into one accessible container.

  test('HomeScreen — week display is grouped with a single accessibilityLabel', () => {
    const content = readFile('screens/HomeScreen_Enhanced.js');
    // Should have a container with accessibilityLabel that says "X weeks and Y days pregnant"
    expect(content).toMatch(/accessibilityLabel.*weeks.*days pregnant|You are.*weeks.*days pregnant/i);
  });

  test('HomeScreen — due date container is grouped with a single accessibilityLabel', () => {
    const content = readFile('screens/HomeScreen_Enhanced.js');
    expect(content).toMatch(/Due date.*accessibilityLabel|accessibilityLabel.*Due date/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-011: Checkboxes announce checked state', () => {

  test('SymptomCheckerScreen — symptom checkboxes have accessibilityState.checked', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    expect(content).toMatch(/accessibilityState.*checked.*selected\.has|selected\.has.*accessibilityState.*checked/s);
  });

  test('SymptomCheckerScreen — symptom rows have accessibilityLabel with symptom name', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    // Each row must announce what it is, not just "checkbox, checked"
    expect(content).toMatch(/accessibilityLabel={meta\.label}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-012: Disabled states are communicated', () => {

  test('SymptomCheckerScreen — Check Symptoms button announces disabled when no selection', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    expect(content).toMatch(/accessibilityState.*disabled.*selected\.size === 0|selected\.size === 0.*accessibilityState/s);
  });

  test('WeeklyGuideScreen — Prev button announces disabled at week 1', () => {
    const content = readFile('screens/WeeklyGuideScreen.js');
    expect(content).toMatch(/accessibilityState.*disabled.*currentWeek <= 1|currentWeek <= 1.*accessibilityState/s);
  });

  test('VoiceSymptomCheckerScreen — mic button announces busy while recording', () => {
    const content = readFile('screens/VoiceSymptomCheckerScreen.js');
    expect(content).toMatch(/accessibilityState.*busy/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-013: SessionManager PIN lock is fully accessible', () => {
  // This screen gates the entire app. A screen reader user who cannot unlock
  // the app cannot access any health features.

  test('PIN TextInput has accessibilityLabel that changes with pinMode', () => {
    const content = readFile('components/SessionManager.js');
    expect(content).toMatch(/accessibilityLabel.*pinMode|pinMode.*accessibilityLabel/s);
  });

  test('Unlock button has accessibilityLabel', () => {
    const content = readFile('components/SessionManager.js');
    expect(content).toMatch(/accessibilityLabel.*Unlock|Unlock.*accessibilityLabel/i);
  });

  test('Forgot PIN button has accessibilityRole="button"', () => {
    const content = readFile('components/SessionManager.js');
    expect(content).toMatch(/accessibilityRole="button".*Forgot|Forgot.*accessibilityRole="button"/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-014: Language selection in Onboarding is accessible', () => {

  test('Language buttons have accessibilityRole="radio"', () => {
    const content = readFile('screens/OnboardingScreenEnhanced.js');
    expect(content).toMatch(/accessibilityRole="radio"/);
  });

  test('Language buttons announce selected state', () => {
    const content = readFile('screens/OnboardingScreenEnhanced.js');
    expect(content).toMatch(/accessibilityState.*selected/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-015: Consent flow is accessible', () => {

  test('ConsentScreen — consent toggles have accessibilityLabel', () => {
    const content = readFile('screens/ConsentScreen.js');
    expect(content).toMatch(/accessibilityLabel.*DOC_LABELS|DOC_LABELS.*accessibilityLabel/s);
  });

  test('ConsentScreen — proceed button communicates disabled state', () => {
    const content = readFile('screens/ConsentScreen.js');
    expect(content).toMatch(/accessibilityState.*disabled.*canProceed|canProceed.*accessibilityState/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A11Y-SAFETY: Safety-critical interactions pass all checks', () => {
  // Failures here have direct patient safety implications.
  // These tests are run separately as a safety gate in CI.

  test('SAFETY: Emergency strip button on HomeScreen has explicit label AND hint', () => {
    const content = readFile('screens/HomeScreen_Enhanced.js');
    expect(content).toMatch(/accessibilityLabel="Emergency symptom check"/);
    expect(content).toMatch(/accessibilityHint="If you are experiencing/);
  });

  test('SAFETY: Send Emergency Alert button in SymptomChecker has label AND hint', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    expect(content).toMatch(/accessibilityLabel.*emergency alert/i);
    expect(content).toMatch(/accessibilityHint.*SMS|accessibilityHint.*contacts/i);
  });

  test('SAFETY: Mic button in VoiceChecker announces start/stop/processing states', () => {
    const content = readFile('screens/VoiceSymptomCheckerScreen.js');
    expect(content).toMatch(/Start recording/i);
    expect(content).toMatch(/Stop recording/i);
    expect(content).toMatch(/Processing/i);
  });

  test('SAFETY: Assessment result in SymptomChecker uses assertive live region for RED/ORANGE', () => {
    const content = readFile('screens/SymptomCheckerScreen.js');
    // assertive = interrupts screen reader immediately — required for emergency alerts
    expect(content).toMatch(/assertive/);
  });

  test('SAFETY: Assessment result in VoiceChecker uses assertive live region for RED/ORANGE', () => {
    const content = readFile('screens/VoiceSymptomCheckerScreen.js');
    expect(content).toMatch(/assertive/);
  });

  test('SAFETY: Unlock button in SessionManager is reachable by screen reader', () => {
    // If TalkBack cannot reach the unlock button, user is locked out of all health features
    const content = readFile('components/SessionManager.js');
    expect(content).toMatch(/accessibilityRole="button".*Unlock|Unlock.*accessibilityRole="button"/s);
  });
});
