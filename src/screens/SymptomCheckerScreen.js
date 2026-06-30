/**
 * SymptomCheckerScreen.js
 * ────────────────────────
 * Text-based symptom checker: the user selects symptoms from a list,
 * receives a triage result (RED/ORANGE/YELLOW/GREEN), and can trigger
 * an emergency SMS alert to their contacts.
 *
 * Complements VoiceSymptomCheckerScreen (voice input).
 *
 * Fixes applied:
 *   BUG-005 — guards empty contacts before alert
 *   BUG-006/007 — uses EmergencyAlertManager for throttled translated SMS
 *   BUG-008 — no PHI logged to console
 *   BUG-002 — uses secureStorage
 *
 * Path: src/screens/SymptomCheckerScreen.js
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { storage } from '../utils/secureStorage';
import { assessSymptoms, getSymptomList } from '../utils/riskAssessment';
import { sendEmergencyAlert, scheduleCHWVisit } from '../utils/EmergencyAlertManager';
import { t } from '../utils/languages';

// ─── Symptom display labels (English) ────────────────────────────────────────
const SYMPTOM_LABELS = {
  // RED
  severe_bleeding:                { label: 'Severe bleeding',                  group: 'Danger Signs', emoji: '🩸' },
  convulsions:                    { label: 'Convulsions / seizures',            group: 'Danger Signs', emoji: '⚡' },
  no_fetal_movement_24hrs:        { label: 'No fetal movement for 24+ hours',  group: 'Danger Signs', emoji: '👶' },
  severe_headache_blurred_vision: { label: 'Severe headache with blurred vision', group: 'Danger Signs', emoji: '👁️' },
  difficulty_breathing:           { label: 'Difficulty breathing',              group: 'Danger Signs', emoji: '😮‍💨' },
  // ORANGE
  severe_abdominal_pain:          { label: 'Severe abdominal pain',            group: 'Urgent Symptoms', emoji: '🫃' },
  severe_swelling:                { label: 'Severe swelling of face or hands', group: 'Urgent Symptoms', emoji: '🤚' },
  fever:                          { label: 'High fever',                        group: 'Urgent Symptoms', emoji: '🌡️' },
  persistent_vomiting:            { label: 'Persistent vomiting',              group: 'Urgent Symptoms', emoji: '🤢' },
  reduced_fetal_movement:         { label: 'Reduced fetal movement',           group: 'Urgent Symptoms', emoji: '👶' },
  // YELLOW
  mild_swelling:                  { label: 'Mild swelling of ankles or feet',  group: 'Monitor', emoji: '🦵' },
  mild_headache:                  { label: 'Mild headache',                    group: 'Monitor', emoji: '🤕' },
  backache:                       { label: 'Back pain',                         group: 'Monitor', emoji: '🔙' },
  heartburn:                      { label: 'Heartburn / indigestion',           group: 'Monitor', emoji: '🔥' },
  fatigue:                        { label: 'Extreme fatigue',                   group: 'Monitor', emoji: '😴' },
  leg_cramps:                     { label: 'Leg cramps',                        group: 'Monitor', emoji: '🦵' },
  nausea:                         { label: 'Nausea',                            group: 'Monitor', emoji: '🤢' },
  // GREEN
  breast_tenderness:              { label: 'Breast tenderness',                group: 'Common & Normal', emoji: '🩷' },
  frequent_urination:             { label: 'Frequent urination',               group: 'Common & Normal', emoji: '🚿' },
  mild_nausea:                    { label: 'Mild nausea (morning sickness)',    group: 'Common & Normal', emoji: '😕' },
  bloating:                       { label: 'Bloating',                          group: 'Common & Normal', emoji: '🫧' },
};

const SYMPTOM_GROUPS = ['Danger Signs', 'Urgent Symptoms', 'Monitor', 'Common & Normal'];

const GROUP_STYLES = {
  'Danger Signs':    { bg: '#FFEBEE', border: '#D32F2F', badge: '#D32F2F', badgeText: 'DANGER' },
  'Urgent Symptoms': { bg: '#FFF3E0', border: '#E65100', badge: '#E65100', badgeText: 'URGENT' },
  'Monitor':         { bg: '#FFFDE7', border: '#F9A825', badge: '#F9A825', badgeText: 'MONITOR' },
  'Common & Normal': { bg: '#E8F5E9', border: '#2E7D32', badge: '#2E7D32', badgeText: 'NORMAL' },
};

// ─── Risk result display config ───────────────────────────────────────────────
const RESULT_CONFIG = {
  '🔴': { bg: '#D32F2F', headerText: '🚨 EMERGENCY — Seek care NOW', color: '#fff' },
  '🟠': { bg: '#E65100', headerText: '⚠️ URGENT — Go to clinic today', color: '#fff' },
  '🟡': { bg: '#F9A825', headerText: '👀 MONITOR — Contact CHW within 24 hrs', color: '#222' },
  '🟢': { bg: '#2E7D32', headerText: '✅ NORMAL — Common pregnancy symptoms', color: '#fff' },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function SymptomCheckerScreen({ navigation }) {
  const [selected, setSelected] = useState(new Set());
  const [result, setResult] = useState(null);
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [language, setLanguage] = useState('en-KE');
  const [loading, setLoading] = useState(true);
  const [alerting, setAlerting] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const [p, c] = await Promise.all([
        storage.getProfile(),
        storage.getEmergencyContacts(),
      ]);
      setProfile(p);
      setContacts(c || []);
      setLanguage(p?.preferredLanguage || 'en-KE');
    } catch (_) {
      console.warn('[SymptomCheckerScreen] Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const toggleSymptom = (id) => {
    setResult(null); // Reset result when selection changes
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCheckSymptoms = () => {
    if (selected.size === 0) {
      Alert.alert(
        t('noSymptomsSelected', language),
        t('selectAtLeastOne', language)
      );
      return;
    }
    const assessment = assessSymptoms(Array.from(selected));
    setResult(assessment);

    // Save to history
    storage.saveSymptomCheck({
      symptoms: Array.from(selected),
      level: assessment.level,
      priority: assessment.priority,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    // Auto-scroll to result
  };

  const handleSendAlert = async () => {
    if (!result) {return;}

    if (contacts.length === 0) {
      Alert.alert(
        'No Emergency Contacts',
        'Please add emergency contacts first.',
        [
          { text: 'Add Contacts', onPress: () => navigation.navigate('EmergencyContacts') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    setAlerting(true);
    try {
      const alertResult = await sendEmergencyAlert({
        assessment: result,
        profile,
        contacts,
        language,
        motherId: profile?.phoneNumber || 'unknown',
      });

      if (alertResult.chwAction) {
        await scheduleCHWVisit(profile?.phoneNumber, result.symptoms?.[0]);
      }

      if (alertResult.sent) {
        Alert.alert(
          '✅ Alert Sent',
          `Emergency alert sent to ${alertResult.recipientCount} contact(s).`
        );
      } else if (alertResult.userMessage) {
        Alert.alert('Alert', alertResult.userMessage);
      }
    } catch (_) {
      console.warn('[SymptomCheckerScreen] Alert send failed');
      Alert.alert('Error', 'Could not send alert. Please call 999 directly.');
    } finally {
      setAlerting(false);
    }
  };

  const handleReset = () => {
    setSelected(new Set());
    setResult(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B9D" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.heading}>{t('howAreYouFeeling', language)}</Text>
        <Text style={styles.subheading}>{t('selectSymptoms', language)}</Text>

        {/* Symptom groups */}
        {SYMPTOM_GROUPS.map((group) => {
          const groupStyle = GROUP_STYLES[group];
          const groupSymptoms = Object.entries(SYMPTOM_LABELS).filter(
            ([, meta]) => meta.group === group
          );
          return (
            <View key={group} style={[styles.group, { backgroundColor: groupStyle.bg, borderColor: groupStyle.border }]}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group}</Text>
                <View style={[styles.badge, { backgroundColor: groupStyle.badge }]}>
                  <Text style={styles.badgeText}>{groupStyle.badgeText}</Text>
                </View>
              </View>
              {groupSymptoms.map(([id, meta]) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.symptomRow, selected.has(id) && styles.symptomRowSelected]}
                  onPress={() => toggleSymptom(id)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={meta.label}
                  accessibilityHint={selected.has(id) ? 'Double-tap to deselect' : 'Double-tap to select'}
                  accessibilityState={{ checked: selected.has(id) }}
                >
                  <Text style={styles.symptomEmoji} accessible={false}>{meta.emoji}</Text>
                  <Text style={[styles.symptomLabel, selected.has(id) && styles.symptomLabelSelected]}>
                    {meta.label}
                  </Text>
                  <View style={[styles.checkbox, selected.has(id) && styles.checkboxChecked]}>
                    {selected.has(id) && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {/* Check symptoms button */}
        <TouchableOpacity
          style={[styles.checkBtn, selected.size === 0 && styles.checkBtnDisabled]}
          onPress={handleCheckSymptoms}
          disabled={selected.size === 0}
          accessibilityRole="button"
          accessibilityLabel={result ? 'Check symptoms again' : 'Check selected symptoms'}
          accessibilityHint={selected.size === 0 ? 'Select at least one symptom first' : `${selected.size} symptom${selected.size === 1 ? '' : 's'} selected`}
          accessibilityState={{ disabled: selected.size === 0 }}
        >
          <Text style={styles.checkBtnText} accessible={false}>
            {result ? t('checkAgain', language) : t('checkSymptoms', language)}
          </Text>
        </TouchableOpacity>

        {/* Result card */}
        {result && (
          <View
            style={[styles.resultCard, { backgroundColor: RESULT_CONFIG[result.level]?.bg || '#555' }]}
            accessible={true}
            accessibilityLiveRegion={result.level === '🔴' || result.level === '🟠' ? 'assertive' : 'polite'}
            accessibilityLabel={`Assessment result: ${RESULT_CONFIG[result.level]?.headerText?.replace(/🚨|⚠️|👀|✅/gu, '')}. ${result.message}`}
          >
            <Text style={[styles.resultHeader, { color: RESULT_CONFIG[result.level]?.color || '#fff' }]}>
              {RESULT_CONFIG[result.level]?.headerText}
            </Text>
            <Text style={[styles.resultMessage, { color: RESULT_CONFIG[result.level]?.color || '#fff' }]}>
              {result.message}
            </Text>
            <Text style={[styles.resultAction, { color: RESULT_CONFIG[result.level]?.color || '#fff', opacity: 0.85 }]}>
              {result.action}
            </Text>

            {/* Alert button for RED and ORANGE */}
            {result.sendAlert && (
              <TouchableOpacity
                style={styles.alertBtn}
                onPress={handleSendAlert}
                disabled={alerting}
                accessibilityRole="button"
                accessibilityLabel={alerting ? 'Sending emergency alert' : 'Send emergency alert to your contacts'}
                accessibilityHint="Sends an SMS to all your emergency contacts with your symptom information"
                accessibilityState={{ disabled: alerting, busy: alerting }}
              >
                {alerting
                  ? <ActivityIndicator color="#D32F2F" accessibilityLabel="Sending..." />
                  : <Text style={styles.alertBtnText} accessible={false}>📲 Send Emergency Alert</Text>
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleReset}
              accessibilityRole="button"
              accessibilityLabel="Clear selection and check again"
            >
              <Text style={styles.resetBtnText} accessible={false}>Check Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F8' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  heading: { fontSize: 22, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#666', marginBottom: 20 },

  group: {
    borderRadius: 14, borderWidth: 1.5, marginBottom: 16, overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  groupTitle: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: '#fff' },

  symptomRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  symptomRowSelected: { backgroundColor: 'rgba(0,0,0,0.06)' },
  symptomEmoji: { fontSize: 20, marginRight: 10, width: 28, textAlign: 'center' },
  symptomLabel: { flex: 1, fontSize: 14, color: '#333' },
  symptomLabelSelected: { fontWeight: '600', color: '#111' },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: '#aaa', alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#FF6B9D', borderColor: '#FF6B9D' },
  checkmark: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  checkBtn: {
    backgroundColor: '#FF6B9D', padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  checkBtnDisabled: { backgroundColor: '#ccc' },
  checkBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  resultCard: {
    borderRadius: 16, padding: 20, marginBottom: 16,
  },
  resultHeader: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  resultMessage: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  resultAction: { fontSize: 13, lineHeight: 20, marginBottom: 16 },

  alertBtn: {
    backgroundColor: '#fff', padding: 14, borderRadius: 10,
    alignItems: 'center', marginBottom: 10,
  },
  alertBtnText: { color: '#D32F2F', fontWeight: 'bold', fontSize: 15 },
  resetBtn: {
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    padding: 12, borderRadius: 10, alignItems: 'center',
  },
  resetBtnText: { color: '#fff', fontSize: 14 },
});
