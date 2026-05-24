/**
 * __tests__/utils/validateLmpDate.test.js
 *
 * BUG-004 regression suite — LMP date validation
 * Tests the validateLmpDate() logic extracted from OnboardingScreenEnhanced.js
 */

// ─── Extract the pure function for isolated testing ───────────────────────────
// We copy the function here rather than importing the screen component,
// which would pull in all React Native UI deps. Same logic, zero UI coupling.

function validateLmpDate(dateStr) {
  if (!dateStr || dateStr.trim().length === 0) {
    return { valid: false, message: 'Please enter your last menstrual period date.' };
  }

  let day, month, year;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) {
      return { valid: false, message: 'Please use the format DD/MM/YYYY (e.g. 15/08/2025).' };
    }
    [day, month, year] = parts.map(Number);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) {
      return { valid: false, message: 'Please use the format DD/MM/YYYY (e.g. 15/08/2025).' };
    }
    if (parts[0].length === 4) {
      [year, month, day] = parts.map(Number);
    } else {
      [day, month, year] = parts.map(Number);
    }
  } else {
    return { valid: false, message: 'Please enter date as DD/MM/YYYY (e.g. 15/08/2025).' };
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return { valid: false, message: 'Date contains non-numeric characters.' };
  }
  if (month < 1 || month > 12) {
    return { valid: false, message: `Month ${month} is not valid. Enter a month between 1 and 12.` };
  }
  if (day < 1 || day > 31) {
    return { valid: false, message: `Day ${day} is not valid. Enter a day between 1 and 31.` };
  }

  const lmpDate = new Date(year, month - 1, day);

  const today = new Date();
  today.setHours(23, 59, 59, 0);
  if (lmpDate > today) {
    return { valid: false, message: 'Your last menstrual period date cannot be in the future.' };
  }

  const MAX_WEEKS_AGO = 44;
  const maxPastDate = new Date();
  maxPastDate.setDate(maxPastDate.getDate() - MAX_WEEKS_AGO * 7);
  if (lmpDate < maxPastDate) {
    return {
      valid: false,
      message: `That date is more than ${MAX_WEEKS_AGO} weeks ago. Please check the date and try again.`,
    };
  }

  if (lmpDate.getMonth() !== month - 1) {
    return { valid: false, message: `Day ${day} is not valid for month ${month}.` };
  }

  return { valid: true, date: lmpDate };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Test suite ───────────────────────────────────────────────────────────────
describe('validateLmpDate — BUG-004 regression', () => {

  // ── Valid inputs ──────────────────────────────────────────────────────────
  describe('valid dates', () => {
    test('accepts a typical LMP 8 weeks ago (DD/MM/YYYY)', () => {
      const result = validateLmpDate(daysAgo(56));
      expect(result.valid).toBe(true);
    });

    test('accepts LMP 20 weeks ago', () => {
      const result = validateLmpDate(daysAgo(140));
      expect(result.valid).toBe(true);
    });

    test('accepts LMP exactly 1 day ago', () => {
      const result = validateLmpDate(daysAgo(1));
      expect(result.valid).toBe(true);
    });

    test('accepts LMP 43 weeks ago (within 44-week limit)', () => {
      const result = validateLmpDate(daysAgo(43 * 7));
      expect(result.valid).toBe(true);
    });

    test('accepts YYYY-MM-DD format', () => {
      // 16 weeks ago in ISO format
      const d = new Date();
      d.setDate(d.getDate() - 112);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const result = validateLmpDate(iso);
      expect(result.valid).toBe(true);
    });
  });

  // ── BUG-004 core fix: future dates ────────────────────────────────────────
  describe('BUG-004: rejects future LMP dates', () => {
    test('rejects tomorrow', () => {
      const result = validateLmpDate(daysFromNow(1));
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/cannot be in the future/i);
    });

    test('rejects 1 week in the future', () => {
      const result = validateLmpDate(daysFromNow(7));
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/cannot be in the future/i);
    });

    test('rejects 6 months in the future', () => {
      const result = validateLmpDate(daysFromNow(180));
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/cannot be in the future/i);
    });

    test('rejects year 2099', () => {
      const result = validateLmpDate('15/06/2099');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/cannot be in the future/i);
    });
  });

  // ── BUG-004 core fix: too far in past ────────────────────────────────────
  describe('BUG-004: rejects dates older than 44 weeks', () => {
    test('rejects LMP 45 weeks ago', () => {
      const result = validateLmpDate(daysAgo(45 * 7));
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/more than 44 weeks ago/i);
    });

    test('rejects LMP 2 years ago', () => {
      const result = validateLmpDate(daysAgo(730));
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/more than 44 weeks ago/i);
    });

    test('rejects year 2020 LMP', () => {
      const result = validateLmpDate('01/01/2020');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/more than 44 weeks ago/i);
    });
  });

  // ── Empty / missing input ─────────────────────────────────────────────────
  describe('empty and null inputs', () => {
    test('rejects empty string', () => {
      expect(validateLmpDate('').valid).toBe(false);
    });

    test('rejects null', () => {
      expect(validateLmpDate(null).valid).toBe(false);
    });

    test('rejects undefined', () => {
      expect(validateLmpDate(undefined).valid).toBe(false);
    });

    test('rejects whitespace-only', () => {
      expect(validateLmpDate('   ').valid).toBe(false);
    });
  });

  // ── Invalid format ────────────────────────────────────────────────────────
  describe('format validation', () => {
    test('rejects no separator', () => {
      expect(validateLmpDate('15082025').valid).toBe(false);
    });

    test('rejects partial date', () => {
      expect(validateLmpDate('15/08').valid).toBe(false);
    });

    test('rejects letters', () => {
      const result = validateLmpDate('ab/cd/efgh');
      expect(result.valid).toBe(false);
    });

    test('rejects invalid month 13', () => {
      const result = validateLmpDate('15/13/2025');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/month/i);
    });

    test('rejects month 0', () => {
      expect(validateLmpDate('15/00/2025').valid).toBe(false);
    });

    test('rejects day 0', () => {
      expect(validateLmpDate('00/06/2025').valid).toBe(false);
    });

    test('rejects day 32', () => {
      expect(validateLmpDate('32/06/2025').valid).toBe(false);
    });
  });

  // ── Calendar accuracy ─────────────────────────────────────────────────────
  describe('calendar accuracy', () => {
    test('rejects Feb 30 as invalid calendar date', () => {
      // Need a Feb 30 in the valid past range (e.g. ~2 months ago)
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const year = twoMonthsAgo.getFullYear();
      const result = validateLmpDate(`30/02/${year}`);
      expect(result.valid).toBe(false);
    });

    test('rejects April 31 as invalid', () => {
      const result = validateLmpDate('31/04/2025');
      // April has 30 days — JS Date will overflow to May, caught by month check
      expect(result.valid).toBe(false);
    });
  });

  // ── Return shape ──────────────────────────────────────────────────────────
  describe('return value shape', () => {
    test('valid result includes a Date object', () => {
      const result = validateLmpDate(daysAgo(60));
      expect(result.valid).toBe(true);
      expect(result.date).toBeInstanceOf(Date);
    });

    test('invalid result includes a human-readable message', () => {
      const result = validateLmpDate('');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });
  });
});
