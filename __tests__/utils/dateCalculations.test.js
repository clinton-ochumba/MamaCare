/**
 * __tests__/utils/dateCalculations.test.js
 *
 * Full test suite for src/utils/dateCalculations.js
 *
 * This file was created during the alpha test as a NEW file with no prior
 * test coverage. Given that gestational age and due date calculations
 * directly influence clinical guidance shown to pregnant women, correctness
 * is safety-critical.
 *
 * Coverage:
 *   parseDateString()         — format parsing, edge cases
 *   calculateGestationalAge() — week/day accuracy, boundary conditions
 *   calculateDueDate()        — Naegele's rule (LMP + 280 days)
 *   getDaysUntilDueDate()     — positive / negative / zero
 *   formatDate()              — human-readable output
 *   getTrimester()            — trimester boundaries (1/2/3)
 */

import {
  parseDateString,
  calculateGestationalAge,
  calculateDueDate,
  getDaysUntilDueDate,
  formatDate,
  getTrimester,
} from '../../src/utils/dateCalculations';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Returns a date string in DD/MM/YYYY representing "today minus N days".
 */
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function isoStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('parseDateString()', () => {

  describe('DD/MM/YYYY format', () => {
    test('parses a typical date', () => {
      const d = parseDateString('15/08/2025');
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(7); // 0-indexed August
      expect(d.getDate()).toBe(15);
    });

    test('parses start of year', () => {
      const d = parseDateString('01/01/2025');
      expect(d).not.toBeNull();
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(1);
    });

    test('parses end of year', () => {
      const d = parseDateString('31/12/2024');
      expect(d).not.toBeNull();
      expect(d.getMonth()).toBe(11);
      expect(d.getDate()).toBe(31);
    });
  });

  describe('YYYY-MM-DD format (ISO 8601)', () => {
    test('parses ISO date', () => {
      const d = parseDateString('2025-08-15');
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(15);
    });
  });

  describe('DD-MM-YYYY format', () => {
    test('parses hyphen-separated date with day first', () => {
      const d = parseDateString('15-08-2025');
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(7);
      expect(d.getDate()).toBe(15);
    });
  });

  describe('invalid inputs', () => {
    test('returns null for null', () => {
      expect(parseDateString(null)).toBeNull();
    });

    test('returns null for undefined', () => {
      expect(parseDateString(undefined)).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(parseDateString('')).toBeNull();
    });

    test('returns null for text string', () => {
      expect(parseDateString('last month')).toBeNull();
    });

    test('returns null for no separator', () => {
      expect(parseDateString('20250815')).toBeNull();
    });

    test('returns null for invalid month 13', () => {
      expect(parseDateString('01/13/2025')).toBeNull();
    });

    test('returns null for invalid month 0', () => {
      expect(parseDateString('01/00/2025')).toBeNull();
    });

    test('returns null for day 0', () => {
      expect(parseDateString('00/06/2025')).toBeNull();
    });

    test('returns null for day 32', () => {
      expect(parseDateString('32/06/2025')).toBeNull();
    });

    test('returns null for Feb 29 in non-leap year', () => {
      expect(parseDateString('29/02/2025')).toBeNull();
    });

    test('accepts Feb 29 in leap year', () => {
      const d = parseDateString('29/02/2024'); // 2024 is a leap year
      expect(d).not.toBeNull();
      expect(d.getDate()).toBe(29);
    });

    test('returns null for Feb 30', () => {
      expect(parseDateString('30/02/2025')).toBeNull();
    });

    test('returns null for Sept 31', () => {
      expect(parseDateString('31/09/2025')).toBeNull();
    });

    test('returns null for incomplete slash format', () => {
      expect(parseDateString('15/08')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('calculateGestationalAge()', () => {

  describe('accuracy within ±1 day', () => {
    test('returns 0 weeks 0 days for today (same day LMP)', () => {
      const todayStr = daysAgoStr(0);
      const result = calculateGestationalAge(todayStr);
      expect(result).not.toBeNull();
      expect(result.weeks).toBe(0);
      expect(result.days).toBe(0);
    });

    test('returns correct weeks for LMP exactly 7 days ago (1 week)', () => {
      const result = calculateGestationalAge(daysAgoStr(7));
      expect(result.weeks).toBe(1);
      expect(result.days).toBe(0);
    });

    test('returns correct weeks for LMP 84 days ago (12 weeks)', () => {
      const result = calculateGestationalAge(daysAgoStr(84));
      expect(result.weeks).toBe(12);
      expect(result.days).toBe(0);
    });

    test('returns correct weeks for LMP 280 days ago (40 weeks — full term)', () => {
      const result = calculateGestationalAge(daysAgoStr(280));
      expect(result.weeks).toBe(40);
      expect(result.days).toBe(0);
    });

    test('partial week: 10 days ago = 1 week 3 days', () => {
      const result = calculateGestationalAge(daysAgoStr(10));
      expect(result.weeks).toBe(1);
      expect(result.days).toBe(3);
    });

    test('totalDays is sum of weeks × 7 + days', () => {
      const result = calculateGestationalAge(daysAgoStr(50));
      expect(result.totalDays).toBe(result.weeks * 7 + result.days);
    });
  });

  describe('boundary and safety cases', () => {
    test('returns null for a future LMP date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const str = `${String(future.getDate()).padStart(2, '0')}/${String(future.getMonth() + 1).padStart(2, '0')}/${future.getFullYear()}`;
      expect(calculateGestationalAge(str)).toBeNull();
    });

    test('returns null for null input', () => {
      expect(calculateGestationalAge(null)).toBeNull();
    });

    test('returns null for invalid date string', () => {
      expect(calculateGestationalAge('not-a-date')).toBeNull();
    });

    test('weeks >= 0 for any valid past date', () => {
      const result = calculateGestationalAge(daysAgoStr(1));
      expect(result.weeks).toBeGreaterThanOrEqual(0);
    });
  });

  describe('HomeScreen BUG-004 guard compatibility', () => {
    // HomeScreen only displays if weeks >= 0 && weeks <= 45
    // These tests ensure the values stay within that guard range for valid inputs
    test('LMP 1 day ago gives weeks <= 45', () => {
      const result = calculateGestationalAge(daysAgoStr(1));
      expect(result.weeks).toBeLessThanOrEqual(45);
    });

    test('LMP 300 days ago gives weeks >= 42 (overdue range, no cap)', () => {
      const result = calculateGestationalAge(daysAgoStr(300));
      // 300 days = 42 weeks + 6 days. Verify result is not capped below the true age.
      expect(result.weeks).toBeGreaterThanOrEqual(42);
      expect(result.days).toBe(6);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('calculateDueDate()', () => {

  test('EDD is exactly 280 days after LMP (Naegele\'s rule)', () => {
    const lmpDate = new Date();
    lmpDate.setDate(lmpDate.getDate() - 100); // 100 days ago
    // Normalise to midnight so diff calculation matches parseDateString's output
    lmpDate.setHours(0, 0, 0, 0);
    const lmpStr = `${String(lmpDate.getDate()).padStart(2, '0')}/${String(lmpDate.getMonth() + 1).padStart(2, '0')}/${lmpDate.getFullYear()}`;

    const edd = calculateDueDate(lmpStr);
    expect(edd).toBeInstanceOf(Date);

    const diffDays = Math.round((edd - lmpDate) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(280);
  });

  test('EDD is in the future when LMP is recent', () => {
    const edd = calculateDueDate(daysAgoStr(14)); // 2 weeks ago
    expect(edd > new Date()).toBe(true);
  });

  test('EDD is in the past when LMP was 290+ days ago (overdue)', () => {
    const edd = calculateDueDate(daysAgoStr(290));
    expect(edd < new Date()).toBe(true);
  });

  test('returns null for invalid LMP string', () => {
    expect(calculateDueDate('bad-input')).toBeNull();
  });

  test('returns null for null', () => {
    expect(calculateDueDate(null)).toBeNull();
  });

  test('EDD date is a real, valid Date object (not Invalid Date)', () => {
    const edd = calculateDueDate(daysAgoStr(60));
    expect(edd).not.toBeNull();
    expect(isNaN(edd.getTime())).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getDaysUntilDueDate()', () => {

  test('returns a positive number for a future due date', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    expect(getDaysUntilDueDate(futureDate)).toBe(30);
  });

  test('returns 0 for today', () => {
    const today = new Date();
    expect(getDaysUntilDueDate(today)).toBe(0);
  });

  test('returns a negative number for a past due date (overdue)', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);
    expect(getDaysUntilDueDate(pastDate)).toBe(-7);
  });

  test('returns null for null input', () => {
    expect(getDaysUntilDueDate(null)).toBeNull();
  });

  test('full pipeline: LMP → EDD → days until', () => {
    // 10 weeks pregnant → ~210 days until due
    const lmpStr = daysAgoStr(70); // 10 weeks ago
    const edd = calculateDueDate(lmpStr);
    const daysLeft = getDaysUntilDueDate(edd);
    // 280 - 70 = 210 days remaining ± 1 for rounding
    expect(Math.abs(daysLeft - 210)).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('formatDate()', () => {

  test('formats a Date object as "DD Mon YYYY"', () => {
    const d = new Date(2025, 7, 15); // Aug 15 2025
    expect(formatDate(d)).toBe('15 Aug 2025');
  });

  test('formats January correctly', () => {
    const d = new Date(2026, 0, 1);
    expect(formatDate(d)).toBe('1 Jan 2026');
  });

  test('formats December correctly', () => {
    const d = new Date(2025, 11, 31);
    expect(formatDate(d)).toBe('31 Dec 2025');
  });

  test('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  test('accepts a date string (DD/MM/YYYY) and formats it', () => {
    const result = formatDate('15/08/2025');
    expect(result).toBe('15 Aug 2025');
  });

  test('returns empty string for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('');
  });

  test('output never contains slashes or dashes (user-friendly format)', () => {
    const result = formatDate(new Date(2025, 5, 20));
    expect(result).not.toMatch(/[\/\-]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getTrimester()', () => {

  describe('First Trimester — weeks 1-12', () => {
    test('week 1 is trimester 1', () => expect(getTrimester(1)).toBe(1));
    test('week 6 is trimester 1', () => expect(getTrimester(6)).toBe(1));
    test('week 12 is trimester 1', () => expect(getTrimester(12)).toBe(1));
  });

  describe('Second Trimester — weeks 13-26', () => {
    test('week 13 is trimester 2', () => expect(getTrimester(13)).toBe(2));
    test('week 20 is trimester 2', () => expect(getTrimester(20)).toBe(2));
    test('week 26 is trimester 2', () => expect(getTrimester(26)).toBe(2));
  });

  describe('Third Trimester — weeks 27+', () => {
    test('week 27 is trimester 3', () => expect(getTrimester(27)).toBe(3));
    test('week 32 is trimester 3', () => expect(getTrimester(32)).toBe(3));
    test('week 40 is trimester 3 (full term)', () => expect(getTrimester(40)).toBe(3));
    test('week 42 is trimester 3 (post-term)', () => expect(getTrimester(42)).toBe(3));
  });

  describe('boundary transitions are correct', () => {
    test('T1→T2 boundary: week 12 is T1, week 13 is T2', () => {
      expect(getTrimester(12)).toBe(1);
      expect(getTrimester(13)).toBe(2);
    });

    test('T2→T3 boundary: week 26 is T2, week 27 is T3', () => {
      expect(getTrimester(26)).toBe(2);
      expect(getTrimester(27)).toBe(3);
    });
  });

  describe('week 0 (just conceived)', () => {
    test('week 0 is trimester 1', () => expect(getTrimester(0)).toBe(1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: gestational age pipeline', () => {

  test('known LMP → gestational age → trimester is consistent', () => {
    // 20 weeks pregnant
    const lmpStr = daysAgoStr(140); // 20 weeks = 140 days
    const age = calculateGestationalAge(lmpStr);
    expect(age).not.toBeNull();
    expect(age.weeks).toBe(20);
    expect(getTrimester(age.weeks)).toBe(2); // 20 weeks = 2nd trimester
  });

  test('4 weeks pregnant → trimester 1, due date ~36 weeks away', () => {
    const lmpStr = daysAgoStr(28);
    const age = calculateGestationalAge(lmpStr);
    const edd = calculateDueDate(lmpStr);
    const daysLeft = getDaysUntilDueDate(edd);

    expect(getTrimester(age.weeks)).toBe(1);
    // 280 - 28 = 252 days remaining ± 1
    expect(Math.abs(daysLeft - 252)).toBeLessThanOrEqual(1);
  });

  test('38 weeks pregnant → trimester 3, EDD within ~2 weeks', () => {
    const lmpStr = daysAgoStr(266); // 38 weeks
    const age = calculateGestationalAge(lmpStr);
    const edd = calculateDueDate(lmpStr);
    const daysLeft = getDaysUntilDueDate(edd);

    expect(age.weeks).toBe(38);
    expect(getTrimester(age.weeks)).toBe(3);
    // Should have ~14 days left ± 1
    expect(Math.abs(daysLeft - 14)).toBeLessThanOrEqual(1);
  });

  test('formatDate on EDD returns a readable string', () => {
    const edd = calculateDueDate(daysAgoStr(84)); // 12 weeks pregnant
    const formatted = formatDate(edd);
    expect(formatted).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });
});
