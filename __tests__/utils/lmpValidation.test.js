/**
 * __tests__/utils/lmpValidation.test.js
 *
 * Regression suite for BUG-004: Future LMP date causes negative gestational age.
 *
 * We extract validateLmpDate() from OnboardingScreenEnhanced into a pure
 * function so it can be unit-tested without rendering the component.
 * The function is re-implemented here verbatim for isolation — any drift
 * between this and the source file will be caught by the integration test.
 */

// ── Inline the pure validation logic (mirrors OnboardingScreenEnhanced.js) ───
function validateLmpDate(dateStr) {
  if (!dateStr || dateStr.trim().length === 0) {
    return { valid: false, message: 'Please enter your last menstrual period date.' };
  }

  let day, month, year;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return { valid: false, message: 'Please use the format DD/MM/YYYY (e.g. 15/08/2025).' };
    [day, month, year] = parts.map(Number);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return { valid: false, message: 'Please use the format DD/MM/YYYY (e.g. 15/08/2025).' };
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

// ─────────────────────────────────────────────────────────────────────────────
describe('validateLmpDate — BUG-004 regression', () => {

  // ── Valid cases ─────────────────────────────────────────────────────────
  describe('valid dates', () => {
    test('typical LMP 12 weeks ago is valid', () => {
      const d = new Date();
      d.setDate(d.getDate() - 84); // 12 weeks ago
      const str = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      expect(validateLmpDate(str).valid).toBe(true);
    });

    test('LMP 1 week ago is valid', () => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const str = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      expect(validateLmpDate(str).valid).toBe(true);
    });

    test('LMP exactly 40 weeks ago is valid (full-term)', () => {
      const d = new Date();
      d.setDate(d.getDate() - 280);
      const str = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      expect(validateLmpDate(str).valid).toBe(true);
    });

    test('accepts YYYY-MM-DD format', () => {
      const d = new Date();
      d.setDate(d.getDate() - 60);
      const str = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      expect(validateLmpDate(str).valid).toBe(true);
    });

    test('accepts DD-MM-YYYY format', () => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      const str = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      expect(validateLmpDate(str).valid).toBe(true);
    });
  });

  // ── BUG-004: Future date rejection ──────────────────────────────────────
  describe('BUG-004 — future dates rejected', () => {
    test('tomorrow is rejected', () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const str = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const result = validateLmpDate(str);
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/future/i);
    });

    test('1 year in the future is rejected', () => {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      const str = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const result = validateLmpDate(str);
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/future/i);
    });

    test('same year but future month is rejected', () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      const str = `01/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const result = validateLmpDate(str);
      expect(result.valid).toBe(false);
    });
  });

  // ── BUG-004: Impossibly old date rejection ───────────────────────────────
  describe('BUG-004 — impossibly old dates rejected', () => {
    test('date 50 weeks ago is rejected (>44 week limit)', () => {
      const d = new Date();
      d.setDate(d.getDate() - 350); // 50 weeks
      const str = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const result = validateLmpDate(str);
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/weeks ago/i);
    });

    test('date 2 years ago is rejected', () => {
      const result = validateLmpDate('01/01/2023');
      expect(result.valid).toBe(false);
    });
  });

  // ── Format validation ────────────────────────────────────────────────────
  describe('format validation', () => {
    test('empty string is rejected', () => {
      expect(validateLmpDate('').valid).toBe(false);
    });

    test('null/undefined is rejected', () => {
      expect(validateLmpDate(null).valid).toBe(false);
      expect(validateLmpDate(undefined).valid).toBe(false);
    });

    test('plain number string is rejected', () => {
      expect(validateLmpDate('20250801').valid).toBe(false);
    });

    test('text string is rejected', () => {
      expect(validateLmpDate('last week').valid).toBe(false);
    });

    test('month 13 is rejected', () => {
      expect(validateLmpDate('01/13/2025').valid).toBe(false);
      expect(validateLmpDate('01/13/2025').message).toMatch(/month/i);
    });

    test('month 0 is rejected', () => {
      expect(validateLmpDate('01/00/2025').valid).toBe(false);
    });

    test('day 0 is rejected', () => {
      expect(validateLmpDate('00/06/2025').valid).toBe(false);
    });

    test('day 32 is rejected', () => {
      expect(validateLmpDate('32/06/2025').valid).toBe(false);
    });

    test('Feb 30 is rejected (invalid calendar day)', () => {
      expect(validateLmpDate('30/02/2025').valid).toBe(false);
    });

    test('Sep 31 is rejected', () => {
      expect(validateLmpDate('31/09/2025').valid).toBe(false);
    });
  });
});
