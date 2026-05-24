/**
 * ConsentScreen.js — PRODUCTION FIXED
 * ─────────────────────────────────────
 * BUG-001 FIX: DocumentViewer navigation now uses correct callback pattern
 *              and passes onMarkRead param that DocumentViewer will call.
 * BUG-002 FIX: Uses secureStorage instead of AsyncStorage.
 * BUG-008 FIX: No PHI logged — catch block only logs error type.
 *
 * Consent version (v1.0) is stored alongside timestamp for ODPC audit trail.
 *
 * Path: src/screens/ConsentScreen.js
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { storage } from '../utils/secureStorage';

const CONSENT_VERSION = '1.0';

// Required consents — user cannot proceed without all of these
const REQUIRED_KEYS = [
  'termsOfService',
  'privacyPolicy',
  'medicalDisclaimer',
  'dataProcessing',
  'emergencySharing',
  'chwAccess',
];

// Documents that require explicit "Read" action before toggling
const DOCS_MUST_READ = ['termsOfService', 'privacyPolicy', 'medicalDisclaimer'];

const DOC_TYPE_MAP = {
  termsOfService: 'terms',
  privacyPolicy: 'privacy',
  medicalDisclaimer: 'disclaimer',
};

const DOC_LABELS = {
  termsOfService: 'Terms of Service',
  privacyPolicy: 'Privacy Policy',
  medicalDisclaimer: 'Medical Disclaimer',
  dataProcessing: 'Data Processing Consent',
  emergencySharing: 'Emergency Contact Alerts',
  chwAccess: 'Community Health Worker Access',
  researchData: 'Research Use (Anonymous) — Optional',
  marketing: 'Health Tips via SMS — Optional',
};

const DOC_DESCRIPTIONS = {
  termsOfService: 'Rules and conditions for using MamaCare',
  privacyPolicy: 'How we collect, use, and protect your personal data',
  medicalDisclaimer: '⚠️ MamaCare is NOT a medical service — read carefully',
  dataProcessing: 'We need permission to process your health information for the app to function',
  emergencySharing: 'Allows automatic SMS alerts to your emergency contacts when danger signs are detected',
  chwAccess: 'Lets your assigned Community Health Worker view your pregnancy progress and alerts',
  researchData: 'Share anonymized data to help improve maternal health outcomes in Kenya',
  marketing: 'Receive helpful pregnancy tips and app updates via SMS',
};

export default function ConsentScreen({ navigation }) {
  const [consents, setConsents] = useState({
    termsOfService: false,
    privacyPolicy: false,
    medicalDisclaimer: false,
    dataProcessing: false,
    emergencySharing: false,
    chwAccess: false,
    researchData: false,
    marketing: false,
  });

  // Track which legal docs have been read via DocumentViewer
  const [readDocs, setReadDocs] = useState({
    termsOfService: false,
    privacyPolicy: false,
    medicalDisclaimer: false,
  });

  const canProceed =
    REQUIRED_KEYS.every((k) => consents[k]) &&
    DOCS_MUST_READ.every((k) => readDocs[k]);

  // BUG-001 FIX: Pass onMarkRead callback so DocumentViewer can mark the doc as read
  const handleReadDocument = useCallback(
    (consentKey) => {
      const docType = DOC_TYPE_MAP[consentKey];
      navigation.navigate('DocumentViewer', {
        docType,
        onMarkRead: (readDocType) => {
          // Map back from docType to consentKey
          const keyMap = { terms: 'termsOfService', privacy: 'privacyPolicy', disclaimer: 'medicalDisclaimer' };
          const ck = keyMap[readDocType];
          if (ck) {
            setReadDocs((prev) => ({ ...prev, [ck]: true }));
          }
        },
      });
    },
    [navigation]
  );

  const handleToggle = (key) => {
    // Docs that require reading first
    // a11y: handled per-element below
  if (DOCS_MUST_READ.includes(key) && !consents[key]) {
      if (!readDocs[key]) {
        Alert.alert(
          'Please Read First',
          `You must read the ${DOC_LABELS[key]} before accepting it.`,
          [
            { text: 'Read Now', onPress: () => handleReadDocument(key) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
    }
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (!canProceed) {
      Alert.alert(
        'Required Consents Missing',
        'Please read and accept all required documents to continue.'
      );
      return;
    }

    try {
      const consentRecord = {
        ...consents,
        consentVersion: CONSENT_VERSION,
        timestamp: new Date().toISOString(),
        docsRead: readDocs,
      };

      await storage.saveConsents(consentRecord);

      // Fire-and-forget backend log (do not block user)
      const _apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || '';
      fetch(`${_apiBase}/consents/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consentRecord),
      }).catch(() => {/* offline — will retry */});

      navigation.replace('Home');
    } catch (_) {
      // BUG-008: no PHI in error log
      console.warn('[ConsentScreen] Failed to save consent record');
      Alert.alert('Error', 'Could not save your consent. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.logo}>🔒</Text>
          <Text style={styles.title}>Privacy & Consent</Text>
          <Text style={styles.subtitle}>
            Kenya Data Protection Act 2019 Compliant
          </Text>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            ℹ️ Read each document before accepting. Your consents are stored
            securely and versioned for compliance.
          </Text>
        </View>

        {/* Required consents */}
        <Text style={styles.sectionLabel}>REQUIRED CONSENTS</Text>

        {REQUIRED_KEYS.map((key) => {
          const needsDoc = DOCS_MUST_READ.includes(key);
          const isRead = readDocs[key];
          const docType = DOC_TYPE_MAP[key];
          return (
            <View key={key} style={styles.consentItem}>
              <View style={styles.consentHeader}>
                <Text style={styles.consentTitle}>{DOC_LABELS[key]}</Text>
                {needsDoc && (
                  <TouchableOpacity
                    style={[styles.readBtn, isRead && styles.readBtnDone]}
                    onPress={() => handleReadDocument(key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Read ${DOC_LABELS[key]}`}
                    accessibilityHint={readDocs[key] ? 'Document already read' : 'You must read this document before accepting'}
                  >
                    <Text style={styles.readBtnText}>
                      {isRead ? '✓ Read' : 'Read →'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.consentDesc}>{DOC_DESCRIPTIONS[key]}</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>
                  {consents[key] ? '✓ Accepted' : 'Tap to accept'}
                </Text>
                <Switch
                  value={consents[key]}
                  onValueChange={() => handleToggle(key)}
                  accessibilityRole="switch"
                  accessibilityLabel={`${key} consent`}
                  trackColor={{ false: '#ddd', true: '#FF6B9D' }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          );
        })}

        {/* Optional consents */}
        <Text style={styles.sectionLabel}>OPTIONAL CONSENTS</Text>
        {['researchData', 'marketing'].map((key) => (
          <View key={key} style={styles.consentItem}>
            <Text style={styles.consentTitle}>{DOC_LABELS[key]}</Text>
            <Text style={styles.consentDesc}>{DOC_DESCRIPTIONS[key]}</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>
                {consents[key] ? '✓ Opted in' : 'Optional'}
              </Text>
              <Switch
                value={consents[key]}
                onValueChange={() =>
                  setConsents((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                accessibilityRole="switch"
                accessibilityLabel={`${key} optional consent`}
                trackColor={{ false: '#ddd', true: '#FF6B9D' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        ))}

        {/* Rights reminder */}
        <View style={styles.rightsBox}>
          <Text style={styles.rightsTitle}>Your Rights (ODPC)</Text>
          {[
            'Access your data anytime',
            'Correct inaccurate information',
            'Delete your account (30-day grace)',
            'Export your data as JSON',
            'Withdraw optional consents',
            'File a complaint: complaints@odpc.go.ke',
          ].map((r) => (
            <Text key={r} style={styles.rightItem}>✓ {r}</Text>
          ))}
          <Text style={styles.rightsFooter}>Manage in Settings › Privacy</Text>
        </View>

        {/* Emergency reminder */}
        <View style={styles.emergencyBox}>
          <Text style={styles.emergencyTitle}>🚨 In an Emergency</Text>
          <Text style={styles.emergencyText}>
            Always call 999 immediately.{'\n'}Do not rely solely on this app.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, !canProceed && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canProceed}
          accessibilityRole="button"
          accessibilityLabel={canProceed ? 'Accept all consents and continue' : 'Cannot continue yet. Please read and accept all required items.'}
          accessibilityState={{ disabled: !canProceed }}
        >
          <Text style={styles.submitBtnText} accessible={false}>
            {canProceed ? '✓ Accept & Continue' : 'Read & Accept All Required Items'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Consent version {CONSENT_VERSION} · privacy@mamacare.app
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F8' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 20 },
  logo: { fontSize: 52 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#222', marginTop: 8 },
  subtitle: { fontSize: 13, color: '#888', marginTop: 4, textAlign: 'center' },
  notice: { backgroundColor: '#E3F2FD', padding: 12, borderRadius: 10, marginBottom: 20 },
  noticeText: { fontSize: 13, color: '#1565C0', lineHeight: 19 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 10, marginTop: 6 },
  consentItem: {
    backgroundColor: '#fff', padding: 14, borderRadius: 12,
    marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0',
  },
  consentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  consentTitle: { fontSize: 14, fontWeight: '700', color: '#222', flex: 1 },
  readBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#FF6B9D' },
  readBtnDone: { backgroundColor: '#2E7D32' },
  readBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  consentDesc: { fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 10 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 12, color: '#888' },
  rightsBox: { backgroundColor: '#E8F5E9', padding: 14, borderRadius: 12, marginVertical: 16 },
  rightsTitle: { fontSize: 13, fontWeight: '700', color: '#2E7D32', marginBottom: 8 },
  rightItem: { fontSize: 12, color: '#333', marginBottom: 4 },
  rightsFooter: { fontSize: 11, color: '#666', marginTop: 8, fontStyle: 'italic' },
  emergencyBox: { backgroundColor: '#FFEBEE', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  emergencyTitle: { fontSize: 16, fontWeight: 'bold', color: '#D32F2F', marginBottom: 6 },
  emergencyText: { fontSize: 13, color: '#333', textAlign: 'center', lineHeight: 20 },
  submitBtn: { backgroundColor: '#FF6B9D', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  submitBtnDisabled: { backgroundColor: '#ccc' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  footer: { textAlign: 'center', color: '#bbb', fontSize: 11 },
});
