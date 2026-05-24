/**
 * __tests__/utils/riskAssessment.test.js
 *
 * Full test suite for src/utils/riskAssessment.js
 *
 * This module is the clinical core of MamaCare: it maps reported symptoms
 * to risk levels and determines whether an emergency alert should be sent.
 * Errors here could cause life-threatening under-triage (GREEN for a
 * genuinely RED symptom) or alert fatigue from over-triage.
 *
 * Test philosophy:
 *   - Every RED symptom MUST produce level '🔴' and sendAlert: true
 *   - No GREEN symptom should ever produce sendAlert: true
 *   - Multi-symptom assessment must return the HIGHEST risk level present
 *   - Unknown symptoms must default to URGENT (safe-side triage)
 *   - Empty input must never crash; returns GREEN
 */

import { assessSymptoms, getSymptomList, isEmergencySymptom } from '../../src/utils/riskAssessment';

// ─── Expected risk levels ─────────────────────────────────────────────────────
const RED    = '🔴';
const ORANGE = '🟠';
const YELLOW = '🟡';
const GREEN  = '🟢';

// Canonical symptom groupings from the risk map
const RED_SYMPTOMS = [
  'severe_bleeding',
  'convulsions',
  'no_fetal_movement_24hrs',
  'severe_headache_blurred_vision',
  'difficulty_breathing',
];

const ORANGE_SYMPTOMS = [
  'severe_abdominal_pain',
  'severe_swelling',
  'fever',
  'persistent_vomiting',
  'reduced_fetal_movement',
];

const YELLOW_SYMPTOMS = [
  'mild_swelling',
  'mild_headache',
  'backache',
  'heartburn',
  'fatigue',
  'leg_cramps',
  'nausea',
];

const GREEN_SYMPTOMS = [
  'breast_tenderness',
  'frequent_urination',
  'mild_nausea',
  'bloating',
];

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — empty and null inputs', () => {

  test('empty array returns GREEN / NORMAL, sendAlert: false', () => {
    const result = assessSymptoms([]);
    expect(result.level).toBe(GREEN);
    expect(result.priority).toBe('NORMAL');
    expect(result.sendAlert).toBe(false);
  });

  test('null input returns GREEN / NORMAL, sendAlert: false', () => {
    const result = assessSymptoms(null);
    expect(result.level).toBe(GREEN);
    expect(result.sendAlert).toBe(false);
  });

  test('undefined input returns GREEN / NORMAL, sendAlert: false', () => {
    const result = assessSymptoms(undefined);
    expect(result.level).toBe(GREEN);
    expect(result.sendAlert).toBe(false);
  });

  test('always returns a message string (never undefined)', () => {
    expect(typeof assessSymptoms([]).message).toBe('string');
    expect(assessSymptoms([]).message.length).toBeGreaterThan(0);
  });

  test('always returns a messageSwahili string', () => {
    expect(typeof assessSymptoms([]).messageSwahili).toBe('string');
    expect(assessSymptoms([]).messageSwahili.length).toBeGreaterThan(0);
  });

  test('always returns an action string', () => {
    expect(typeof assessSymptoms([]).action).toBe('string');
  });

  test('result.symptoms is always an array', () => {
    expect(Array.isArray(assessSymptoms([]).symptoms)).toBe(true);
    expect(Array.isArray(assessSymptoms(null).symptoms)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — RED symptoms (life-threatening)', () => {

  test.each(RED_SYMPTOMS)(
    '"%s" → level RED, priority EMERGENCY, sendAlert true',
    (symptom) => {
      const result = assessSymptoms([symptom]);
      expect(result.level).toBe(RED);
      expect(result.priority).toBe('EMERGENCY');
      expect(result.sendAlert).toBe(true);
    }
  );

  test('RED symptoms produce message containing emergency language', () => {
    const result = assessSymptoms(['convulsions']);
    expect(result.message.toUpperCase()).toMatch(/EMERGENCY|999|HOSPITAL|DANGER/);
  });

  test('RED symptoms produce Swahili message containing emergency language', () => {
    const result = assessSymptoms(['severe_bleeding']);
    expect(result.messageSwahili).toMatch(/999|HATARI|dharura|hospitali/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — ORANGE symptoms (urgent)', () => {

  test.each(ORANGE_SYMPTOMS)(
    '"%s" → level ORANGE or RED, priority URGENT or EMERGENCY',
    (symptom) => {
      const result = assessSymptoms([symptom]);
      expect([ORANGE, RED]).toContain(result.level);
      expect(['URGENT', 'EMERGENCY']).toContain(result.priority);
    }
  );

  test('fever → sendAlert true', () => {
    const result = assessSymptoms(['fever']);
    expect(result.sendAlert).toBe(true);
  });

  test('persistent_vomiting → does not trigger alert (monitor, call CHW)', () => {
    const result = assessSymptoms(['persistent_vomiting']);
    expect(result.sendAlert).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — YELLOW symptoms (monitor)', () => {

  test.each(YELLOW_SYMPTOMS)(
    '"%s" → level YELLOW, sendAlert false',
    (symptom) => {
      const result = assessSymptoms([symptom]);
      expect(result.level).toBe(YELLOW);
      expect(result.sendAlert).toBe(false);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — GREEN symptoms (normal pregnancy)', () => {

  test.each(GREEN_SYMPTOMS)(
    '"%s" → level GREEN, sendAlert false',
    (symptom) => {
      const result = assessSymptoms([symptom]);
      expect(result.level).toBe(GREEN);
      expect(result.sendAlert).toBe(false);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — highest-risk escalation', () => {

  test('RED + GREEN → RED (highest risk wins)', () => {
    const result = assessSymptoms(['bloating', 'severe_bleeding']);
    expect(result.level).toBe(RED);
    expect(result.priority).toBe('EMERGENCY');
  });

  test('ORANGE + YELLOW → ORANGE', () => {
    const result = assessSymptoms(['backache', 'fever']);
    expect(result.level).toBe(ORANGE);
  });

  test('RED + ORANGE → RED', () => {
    const result = assessSymptoms(['severe_abdominal_pain', 'convulsions']);
    expect(result.level).toBe(RED);
    expect(result.sendAlert).toBe(true);
  });

  test('multiple GREEN symptoms stay GREEN', () => {
    const result = assessSymptoms(['bloating', 'breast_tenderness', 'frequent_urination']);
    expect(result.level).toBe(GREEN);
    expect(result.sendAlert).toBe(false);
  });

  test('order of symptoms does not affect result', () => {
    const r1 = assessSymptoms(['bloating', 'severe_bleeding', 'backache']);
    const r2 = assessSymptoms(['severe_bleeding', 'backache', 'bloating']);
    expect(r1.level).toBe(r2.level);
    expect(r1.priority).toBe(r2.priority);
    expect(r1.sendAlert).toBe(r2.sendAlert);
  });

  test('single RED symptom among 10 others escalates entire assessment', () => {
    const result = assessSymptoms([
      ...GREEN_SYMPTOMS,
      ...YELLOW_SYMPTOMS,
      'no_fetal_movement_24hrs',
    ]);
    expect(result.level).toBe(RED);
  });

  test('sendAlert is true if ANY alertable symptom is present', () => {
    const result = assessSymptoms(['mild_headache', 'severe_swelling']);
    expect(result.sendAlert).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — unknown symptom IDs', () => {

  test('a single unknown symptom defaults to URGENT (safe over-triage)', () => {
    const result = assessSymptoms(['something_we_dont_know_about']);
    expect(result.level).toBe(ORANGE);
    expect(result.priority).toBe('URGENT');
    expect(result.sendAlert).toBe(true);
  });

  test('unknown symptoms are listed in unknownSymptoms array', () => {
    const result = assessSymptoms(['bloating', 'mystery_symptom']);
    expect(result.unknownSymptoms).toContain('mystery_symptom');
  });

  test('unknown symptoms are NOT in the main symptoms array', () => {
    const result = assessSymptoms(['mystery_symptom']);
    expect(result.symptoms).not.toContain('mystery_symptom');
  });

  test('mix of known GREEN + unknown → ORANGE (unknown raises the floor)', () => {
    const result = assessSymptoms(['bloating', 'unknown_xyz']);
    // Known is GREEN, but unknown bumps to ORANGE safe triage
    expect([ORANGE, RED]).toContain(result.level);
  });

  test('known RED + unknown → RED (RED still dominates)', () => {
    const result = assessSymptoms(['severe_bleeding', 'unknown_xyz']);
    expect(result.level).toBe(RED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('assessSymptoms() — result shape contract', () => {
  // These tests verify the shape used by EmergencyAlertManager and VoiceChecker

  const REQUIRED_FIELDS = [
    'level', 'priority', 'message', 'messageSwahili',
    'action', 'sendAlert', 'symptoms', 'unknownSymptoms',
  ];

  test.each([[[]], [['fever']], [['bloating', 'convulsions']], [['unknown']]])(
    'assessSymptoms(%j) always returns all required fields',
    (input) => {
      const result = assessSymptoms(input);
      for (const field of REQUIRED_FIELDS) {
        expect(result).toHaveProperty(field);
        expect(result[field]).not.toBeUndefined();
      }
    }
  );

  test('level is always one of the 4 known emoji values', () => {
    const VALID_LEVELS = ['🔴', '🟠', '🟡', '🟢'];
    const inputs = [[], ['fever'], ['backache'], ['severe_bleeding'], ['unknown']];
    for (const input of inputs) {
      const { level } = assessSymptoms(input);
      expect(VALID_LEVELS).toContain(level);
    }
  });

  test('priority is always one of EMERGENCY / URGENT / MONITOR / NORMAL', () => {
    const VALID_PRIORITIES = ['EMERGENCY', 'URGENT', 'MONITOR', 'NORMAL'];
    const inputs = [
      [], ['severe_bleeding'], ['fever'], ['backache'], ['bloating'],
    ];
    for (const input of inputs) {
      const { priority } = assessSymptoms(input);
      expect(VALID_PRIORITIES).toContain(priority);
    }
  });

  test('sendAlert is always boolean', () => {
    const inputs = [[], ['bloating'], ['severe_bleeding'], ['unknown']];
    for (const input of inputs) {
      expect(typeof assessSymptoms(input).sendAlert).toBe('boolean');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getSymptomList()', () => {

  test('returns an array', () => {
    expect(Array.isArray(getSymptomList())).toBe(true);
  });

  test('returns at least 20 symptoms', () => {
    expect(getSymptomList().length).toBeGreaterThanOrEqual(20);
  });

  test('every entry has id, level, and priority', () => {
    for (const entry of getSymptomList()) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('priority');
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
    }
  });

  test('no duplicate symptom IDs', () => {
    const ids = getSymptomList().map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('all RED_SYMPTOMS appear in getSymptomList()', () => {
    const ids = getSymptomList().map((s) => s.id);
    for (const symptom of RED_SYMPTOMS) {
      expect(ids).toContain(symptom);
    }
  });

  test('all listed symptoms are assessable (round-trip)', () => {
    const list = getSymptomList();
    for (const { id } of list) {
      const result = assessSymptoms([id]);
      // Should not fall into the "unknown" path
      expect(result.unknownSymptoms).not.toContain(id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('isEmergencySymptom()', () => {

  test.each(RED_SYMPTOMS)(
    '"%s" is an emergency symptom',
    (symptom) => {
      expect(isEmergencySymptom(symptom)).toBe(true);
    }
  );

  test.each([...ORANGE_SYMPTOMS, ...YELLOW_SYMPTOMS, ...GREEN_SYMPTOMS])(
    '"%s" is NOT an emergency symptom (RED only)',
    (symptom) => {
      expect(isEmergencySymptom(symptom)).toBe(false);
    }
  );

  test('returns false for unknown symptom ID', () => {
    expect(isEmergencySymptom('completely_unknown')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isEmergencySymptom(null)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isEmergencySymptom('')).toBe(false);
  });

  test('returns boolean (never truthy object)', () => {
    for (const symptom of [...RED_SYMPTOMS, ...GREEN_SYMPTOMS]) {
      const result = isEmergencySymptom(symptom);
      expect(typeof result).toBe('boolean');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Clinical safety invariants (non-negotiable)', () => {
  // These tests represent minimum safety requirements for a maternal health app.
  // A failure here is a patient safety issue, not just a software defect.

  test('INVARIANT: no RED symptom ever produces sendAlert: false', () => {
    const violations = [];
    for (const symptom of RED_SYMPTOMS) {
      const result = assessSymptoms([symptom]);
      if (!result.sendAlert) violations.push(symptom);
    }
    if (violations.length > 0) {
      throw new Error(
        `SAFETY VIOLATION: These RED symptoms did not trigger sendAlert:\n  ${violations.join('\n  ')}`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('INVARIANT: no GREEN symptom ever produces sendAlert: true', () => {
    const violations = [];
    for (const symptom of GREEN_SYMPTOMS) {
      const result = assessSymptoms([symptom]);
      if (result.sendAlert) violations.push(symptom);
    }
    if (violations.length > 0) {
      throw new Error(
        `SAFETY VIOLATION: These GREEN symptoms incorrectly triggered sendAlert:\n  ${violations.join('\n  ')}`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('INVARIANT: convulsions always produces EMERGENCY priority', () => {
    // Convulsions (eclampsia) is the single highest-mortality obstetric emergency
    const result = assessSymptoms(['convulsions']);
    expect(result.priority).toBe('EMERGENCY');
    expect(result.level).toBe(RED);
    expect(result.sendAlert).toBe(true);
  });

  test('INVARIANT: no_fetal_movement_24hrs always produces RED', () => {
    const result = assessSymptoms(['no_fetal_movement_24hrs']);
    expect(result.level).toBe(RED);
    expect(result.sendAlert).toBe(true);
  });

  test('INVARIANT: severe_bleeding always produces RED', () => {
    const result = assessSymptoms(['severe_bleeding']);
    expect(result.level).toBe(RED);
    expect(result.sendAlert).toBe(true);
  });

  test('INVARIANT: assessSymptoms never throws for any string input', () => {
    const fuzzInputs = [
      [''],
      ['null'],
      ['undefined'],
      ['<script>'],
      ['DROP TABLE symptoms;'],
      ['a'.repeat(500)],
      ['\n\t\r'],
    ];
    for (const input of fuzzInputs) {
      expect(() => assessSymptoms(input)).not.toThrow();
    }
  });
});
