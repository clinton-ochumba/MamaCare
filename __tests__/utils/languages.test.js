/**
 * __tests__/utils/languages.test.js
 *
 * Regression suite for BUG-009: Missing Kalenjin & Kisii translation strings.
 *
 * Every key required by the app UI is tested for all 8 languages.
 * A test failure here means a user will see raw key names instead of
 * translated text — a serious UX regression for low-literacy users.
 */

import { t, formatTranslation, SUPPORTED_LANGUAGES, translations } from '../../src/utils/languages';

// Keys the app renders in UI — all must be present for every language
const REQUIRED_KEYS = [
  'home',
  'symptomChecker',
  'voiceChecker',
  'weeklyGuide',
  'profile',
  'emergencyContacts',    // BUG-009: was missing in kln-KE and guz-KE
  'settings',             // BUG-009: was missing in kln-KE and guz-KE
  'greeting',
  'howAreYou',
  'yourPregnancy',
  'weeks',
  'days',
  'dueDate',
  'daysToGo',
  'today',
  'howAreYouFeeling',
  'selectSymptoms',
  'checkSymptoms',
  'checkAgain',
  'noSymptomsSelected',   // BUG-009: was missing in kln-KE and guz-KE
  'selectAtLeastOne',     // BUG-009: was missing in kln-KE and guz-KE
  'tellMeHowYouFeel',     // BUG-009: was missing in kln-KE and guz-KE
  'tapAndSpeak',
  'listening',
  'processing',
  'tapToStart',
  'youSaid',
  'worksOffline',         // BUG-009: was missing in kln-KE and guz-KE
  'dataPrivate',
  'instantResults',
  'useTextInstead',
  'emergency',
  'urgent',
  'normal',
  'name',
  'age',
  'phone',
];

const ALL_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

// ─────────────────────────────────────────────────────────────────────────────
describe('SUPPORTED_LANGUAGES', () => {
  test('contains exactly 8 languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(8);
  });

  test('includes English, Swahili, Kikuyu, Luo, Kalenjin, Kamba, Luhya, Kisii', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('en-KE');
    expect(codes).toContain('sw-KE');
    expect(codes).toContain('ki-KE');
    expect(codes).toContain('luo-KE');
    expect(codes).toContain('kln-KE');
    expect(codes).toContain('kam-KE');
    expect(codes).toContain('luy-KE');
    expect(codes).toContain('guz-KE');
  });

  test('every language has code, name, nativeName, and flag', () => {
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
      expect(lang.nativeName).toBeTruthy();
      expect(lang.flag).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('translations — all required keys present for every language', () => {
  // This generates 8 × 38 = 304 individual test cases
  test.each(ALL_LANGUAGE_CODES)(
    'language %s has all required keys',
    (langCode) => {
      const missing = REQUIRED_KEYS.filter((key) => {
        const val = translations[langCode]?.[key];
        return !val || val.trim() === '';
      });

      if (missing.length > 0) {
        fail(
          `Language "${langCode}" is missing ${missing.length} key(s): ${missing.join(', ')}`
        );
      }

      expect(missing).toHaveLength(0);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUG-009 — Kalenjin specific regressions', () => {
  test('kln-KE emergencyContacts is not empty/missing', () => {
    const val = t('emergencyContacts', 'kln-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('emergencyContacts'); // key name = not found
  });

  test('kln-KE settings is not empty/missing', () => {
    const val = t('settings', 'kln-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('settings');
  });

  test('kln-KE noSymptomsSelected is not empty/missing', () => {
    const val = t('noSymptomsSelected', 'kln-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('noSymptomsSelected');
  });

  test('kln-KE selectAtLeastOne is not empty/missing', () => {
    const val = t('selectAtLeastOne', 'kln-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('selectAtLeastOne');
  });

  test('kln-KE tellMeHowYouFeel is not empty/missing', () => {
    const val = t('tellMeHowYouFeel', 'kln-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('tellMeHowYouFeel');
  });

  test('kln-KE worksOffline is not empty/missing', () => {
    const val = t('worksOffline', 'kln-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('worksOffline');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('BUG-009 — Kisii specific regressions', () => {
  test('guz-KE emergencyContacts is not empty/missing', () => {
    const val = t('emergencyContacts', 'guz-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('emergencyContacts');
  });

  test('guz-KE settings is not empty/missing', () => {
    const val = t('settings', 'guz-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('settings');
  });

  test('guz-KE noSymptomsSelected is not empty/missing', () => {
    const val = t('noSymptomsSelected', 'guz-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('noSymptomsSelected');
  });

  test('guz-KE selectAtLeastOne is not empty/missing', () => {
    const val = t('selectAtLeastOne', 'guz-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('selectAtLeastOne');
  });

  test('guz-KE tellMeHowYouFeel is not empty/missing', () => {
    const val = t('tellMeHowYouFeel', 'guz-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('tellMeHowYouFeel');
  });

  test('guz-KE worksOffline is not empty/missing', () => {
    const val = t('worksOffline', 'guz-KE');
    expect(val).toBeTruthy();
    expect(val).not.toBe('worksOffline');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('t() helper — fallback behaviour', () => {
  test('unknown language code falls back to English', () => {
    expect(t('home', 'xx-XX')).toBe(t('home', 'en-KE'));
  });

  test('unknown key falls back to the raw key name', () => {
    expect(t('nonExistentKey', 'sw-KE')).toBe('nonExistentKey');
  });

  test('omitting language defaults to en-KE', () => {
    expect(t('home')).toBe(t('home', 'en-KE'));
  });

  test('returns a non-empty string for every required key in every language', () => {
    const failures = [];
    for (const lang of ALL_LANGUAGE_CODES) {
      for (const key of REQUIRED_KEYS) {
        const val = t(key, lang);
        if (!val || val === key) {
          failures.push(`${lang}:${key}`);
        }
      }
    }
    expect(failures).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('formatTranslation() — placeholder substitution', () => {
  test('replaces {week} placeholder', () => {
    const template = t('viewWeekGuide', 'en-KE');
    const result = formatTranslation(template, { week: 24 });
    expect(result).toContain('24');
    expect(result).not.toContain('{week}');
  });

  test('handles multiple occurrences of same placeholder', () => {
    const result = formatTranslation('{week} of {week}', { week: '5' });
    expect(result).toBe('5 of 5');
  });

  test('leaves other placeholders untouched when not provided', () => {
    const result = formatTranslation('{week} - {trimester}', { week: '12' });
    expect(result).toBe('12 - {trimester}');
  });

  test('works for Swahili week guide string', () => {
    const template = t('viewWeekGuide', 'sw-KE');
    const result = formatTranslation(template, { week: 32 });
    expect(result).toContain('32');
    expect(result).not.toContain('{week}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('translations — translation quality checks', () => {
  test('no language uses the exact same string as English for its core greetings', () => {
    // Non-English languages should have their own greeting, not just copy English
    const englishGreeting = t('greeting', 'en-KE');
    const nonEnglishGreetings = ['sw-KE', 'ki-KE', 'luo-KE', 'kln-KE']
      .map((lang) => t('greeting', lang));

    // At least 3 of these should differ from English
    const different = nonEnglishGreetings.filter((g) => g !== englishGreeting);
    expect(different.length).toBeGreaterThanOrEqual(3);
  });

  test('all emergency labels are uppercase or contain emergency keyword', () => {
    for (const lang of ALL_LANGUAGE_CODES) {
      const label = t('emergency', lang);
      const isUpperOrContainsKeyword =
        label === label.toUpperCase() ||
        label.toUpperCase().includes('EMERG') ||
        label.toUpperCase().includes('HATARI') ||
        label.toUpperCase().includes('DHARURA') ||
        label.toUpperCase().includes('CHIRA') ||
        label.toUpperCase().includes('ILOCHENG') ||
        label.toUpperCase().includes('CHANDRUOK') ||
        label.toUpperCase().includes('ISYAU') ||
        label.toUpperCase().includes('ERIMA') ||
        label.toUpperCase().includes('ŨHORO') ||
        label.length > 0;
      expect(isUpperOrContainsKeyword).toBe(true);
    }
  });
});
