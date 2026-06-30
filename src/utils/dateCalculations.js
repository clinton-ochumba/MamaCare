/**
 * dateCalculations.js
 * ────────────────────
 * Utility functions for gestational age and due date calculations.
 * FIX: File was missing — imported by HomeScreen_Enhanced.js but not
 * included in the production zip, causing a module-not-found crash at startup.
 *
 * Path: src/utils/dateCalculations.js
 */

/**
 * Parse a date string in DD/MM/YYYY, YYYY-MM-DD, or DD-MM-YYYY format.
 * Returns a Date object or null if unparseable.
 */
export function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {return null;}

  let day, month, year;

  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) {return null;}
    [day, month, year] = parts.map(Number);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) {return null;}
    if (parts[0].length === 4) {
      [year, month, day] = parts.map(Number);
    } else {
      [day, month, year] = parts.map(Number);
    }
  } else {
    return null;
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) {return null;}
  if (month < 1 || month > 12) {return null;}
  if (day < 1 || day > 31) {return null;}

  const date = new Date(year, month - 1, day);
  // Validate calendar day (catches Feb 30 etc.)
  if (date.getMonth() !== month - 1) {return null;}

  return date;
}

/**
 * calculateGestationalAge(lmpDateStr)
 *
 * Returns { weeks: number, days: number } representing how far along
 * the pregnancy is based on the Last Menstrual Period date.
 *
 * Returns null if the date is invalid or would produce a negative age.
 *
 * @param {string} lmpDateStr - LMP date in DD/MM/YYYY or YYYY-MM-DD
 * @returns {{ weeks: number, days: number } | null}
 */
export function calculateGestationalAge(lmpDateStr) {
  const lmpDate = parseDateString(lmpDateStr);
  if (!lmpDate) {return null;}

  // Normalise both timestamps to midnight local time so the difference is
  // always an exact integer number of days regardless of the current clock time.
  const nowMidnight = new Date();
  nowMidnight.setHours(0, 0, 0, 0);

  const lmpMidnight = new Date(lmpDate);
  lmpMidnight.setHours(0, 0, 0, 0);

  const diffMs = nowMidnight - lmpMidnight;
  if (diffMs < 0) {return null;} // LMP in the future — invalid

  const totalDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;

  return { weeks, days, totalDays };
}

/**
 * calculateDueDate(lmpDateStr)
 *
 * Calculates Estimated Due Date (EDD) using Naegele's rule:
 * EDD = LMP + 280 days (40 weeks).
 *
 * @param {string} lmpDateStr
 * @returns {Date | null}
 */
export function calculateDueDate(lmpDateStr) {
  const lmpDate = parseDateString(lmpDateStr);
  if (!lmpDate) {return null;}

  // Use pure millisecond arithmetic to avoid setDate DST edge cases
  // where a daylight-saving transition can shift the result by ±1 day.
  const edd = new Date(lmpDate.getTime() + 280 * 24 * 60 * 60 * 1000);
  return edd;
}

/**
 * getDaysUntilDueDate(dueDate)
 *
 * Returns the number of days between today and the due date.
 * Negative if overdue.
 *
 * @param {Date} dueDate
 * @returns {number}
 */
export function getDaysUntilDueDate(dueDate) {
  if (!dueDate) {return null;}
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

/**
 * formatDate(date)
 *
 * Returns a human-readable date string in DD MMM YYYY format.
 * e.g. 15 Jan 2026
 *
 * @param {Date | string} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) {return '';}
  const d = date instanceof Date ? date : parseDateString(date);
  if (!d) {return '';}

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * getTrimesters(weeksPregnant)
 *
 * Returns trimester number (1, 2, or 3).
 *
 * @param {number} weeks
 * @returns {1 | 2 | 3}
 */
export function getTrimester(weeks) {
  if (weeks < 13) {return 1;}
  if (weeks < 27) {return 2;}
  return 3;
}
