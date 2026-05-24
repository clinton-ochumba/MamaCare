/**
 * SettingsScreen.js — Privacy Controls & Account Management
 * ──────────────────────────────────────────────────────────
 * BUG-012 FIX: Implements the "Delete Account" (30-day grace period) and
 *              "Export My Data" flows required by Kenya DPA 2019 / ODPC.
 *
 * Also exposes:
 *  - Privacy preference toggles
 *  - PIN reset
 *  - Language switch
 *  - Consent review & withdrawal
 *
 * Path: src/screens/SettingsScreen.js
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
  Share,
  Switch,
} from 'react-native';
import { storage, secureStorage } from '../utils/secureStorage';

const DELETION_GRACE_DAYS = 30;
const DELETION_SCHEDULED_KEY = 'account_deletion_scheduled';

export default function SettingsScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [consents, setConsents] = useState(null);
  const [deletionScheduled, setDeletionScheduled] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [p, c, del] = await Promise.all([
      storage.getProfile(),
      storage.getConsents(),
      secureStorage.getItem(DELETION_SCHEDULED_KEY),
    ]);
    setProfile(p);
    setConsents(c);
    if (del) setDeletionScheduled(JSON.parse(del));
  };

  // ── Export My Data (ODPC Right to Portability) ────────────────────────────
  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const data = await storage.exportAllData();
      const json = JSON.stringify(data, null, 2);

      await Share.share({
        title: 'MamaCare — My Health Data Export',
        message: json,
      });
    } catch (err) {
      Alert.alert('Export Failed', 'Could not export your data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Delete Account (ODPC Right to Erasure, 30-day grace) ──────────────────
  const handleDeleteAccount = () => {
    if (deletionScheduled) {
      // Already scheduled — offer to cancel
      Alert.alert(
        'Deletion Already Scheduled',
        `Your account is scheduled for deletion on ${new Date(deletionScheduled.deleteAt).toDateString()}.\n\nWould you like to cancel the deletion?`,
        [
          { text: 'Keep Deletion', style: 'cancel' },
          {
            text: 'Cancel Deletion',
            onPress: async () => {
              await secureStorage.removeItem(DELETION_SCHEDULED_KEY);
              setDeletionScheduled(null);
              Alert.alert('Deletion Cancelled', 'Your account will not be deleted. Welcome back!');
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      '⚠️ Delete Account',
      `This will permanently delete all your health data, symptom history, and profile after a ${DELETION_GRACE_DAYS}-day grace period.\n\nYou can cancel within ${DELETION_GRACE_DAYS} days by returning to this screen.\n\nAnonymized research data (if you consented) will be retained for public health purposes only.`,
      [
        { text: 'Keep My Account', style: 'cancel' },
        {
          text: 'Schedule Deletion',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    const deleteAt = Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
    const record = {
      scheduledAt: Date.now(),
      deleteAt,
      userId: profile?.phoneNumber || 'unknown',
    };

    await secureStorage.setItem(DELETION_SCHEDULED_KEY, JSON.stringify(record));
    setDeletionScheduled(record);

    // Notify backend to schedule deletion
    try {
      const _apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || '';
      await fetch(`${_apiBase}/account/schedule-deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (_) {
      // Offline — will sync on next open
    }

    Alert.alert(
      'Deletion Scheduled',
      `Your account will be deleted on ${new Date(deleteAt).toDateString()}.\n\nYou can cancel anytime by returning to Settings > Delete Account.`
    );
  };

  // ── Consent withdrawal ────────────────────────────────────────────────────
  const handleWithdrawConsent = (consentType) => {
    Alert.alert(
      'Withdraw Consent',
      `Are you sure you want to withdraw consent for "${consentType}"? This may limit some app features.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            const updated = { ...consents, [consentType]: false };
            await storage.saveConsents(updated);
            setConsents(updated);
            Alert.alert('Consent Withdrawn', 'Your preference has been updated.');
          },
        },
      ]
    );
  };

  // ── PIN Reset ─────────────────────────────────────────────────────────────
  const handleResetPin = () => {
    Alert.alert(
      'Reset PIN',
      'You will need to set a new PIN on next app open.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            await secureStorage.removeItem('app_pin');
            Alert.alert('PIN Reset', 'Your PIN has been removed. You will be prompted to set a new one.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>⚙️ Settings & Privacy</Text>
          {profile && (
            <Text style={styles.headerSub}>{profile.name} · {profile.phoneNumber}</Text>
          )}
        </View>

        {/* ── Account Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel} accessibilityRole="header">ACCOUNT</Text>

          <TouchableOpacity
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            accessibilityHint="Open your profile"
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.rowIcon} accessible={false}>👤</Text>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} accessible={false}>Edit Profile</Text>
              <Text style={styles.rowSub}>Update name, phone, LMP date</Text>
            </View>
            <Text style={styles.rowArrow} accessible={false}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} accessibilityRole="button"
            accessibilityLabel="Change App PIN"
            accessibilityHint="Change the PIN used to unlock MamaCare"
            onPress={handleResetPin}>
            <Text style={styles.rowIcon} accessible={false}>🔐</Text>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} accessible={false}>Change App PIN</Text>
              <Text style={styles.rowSub}>Reset your security PIN</Text>
            </View>
            <Text style={styles.rowArrow} accessible={false}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Data & Privacy ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel} accessibilityRole="header">DATA & PRIVACY (Your ODPC Rights)</Text>

          <TouchableOpacity
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel="Export my data"
            accessibilityHint="Download a copy of your health data"
            onPress={handleExportData}
            disabled={isExporting}
          >
            <Text style={styles.rowIcon} accessible={false}>📤</Text>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} accessible={false}>Export My Data</Text>
              <Text style={styles.rowSub}>
                {isExporting ? 'Preparing export…' : 'Download all your health records as JSON'}
              </Text>
            </View>
            <Text style={styles.rowArrow} accessible={false}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, styles.rowDanger]}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
            accessibilityHint="Start the 30-day account deletion process"
            onPress={handleDeleteAccount}
          >
            <Text style={styles.rowIcon} accessible={false}>🗑️</Text>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, styles.dangerText]}>
                {deletionScheduled ? '⚠️ Cancel Account Deletion' : 'Delete My Account'}
              </Text>
              <Text style={styles.rowSub}>
                {deletionScheduled
                  ? `Scheduled for ${new Date(deletionScheduled.deleteAt).toDateString()}`
                  : `${DELETION_GRACE_DAYS}-day grace period — can be cancelled`}
              </Text>
            </View>
            <Text style={styles.rowArrow} accessible={false}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Consent Management ── */}
        {consents && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel} accessibilityRole="header">CONSENT MANAGEMENT</Text>

            {/* Optional consents can be withdrawn */}
            {[
              { key: 'researchData', label: 'Research Use (Anonymous)', desc: 'Allow anonymized data for public health research' },
              { key: 'marketing', label: 'Health Tips via SMS', desc: 'Receive pregnancy tips and updates' },
            ].map(({ key, label, desc }) => (
              <View key={key} style={styles.consentRow}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{label}</Text>
                  <Text style={styles.rowSub}>{desc}</Text>
                </View>
                <Switch
                  value={consents[key] || false}
                  onValueChange={(val) => {
                    if (!val) {
                      handleWithdrawConsent(key);
                    } else {
                      const updated = { ...consents, [key]: true };
                      storage.saveConsents(updated);
                      setConsents(updated);
                    }
                  }}
                  trackColor={{ false: '#ddd', true: '#FF6B9D' }}
                  thumbColor="#fff"
                  accessibilityLabel={label}
                  accessibilityHint={desc}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: consents[key] || false }}
                />
              </View>
            ))}

            <TouchableOpacity
              style={styles.row}
              accessibilityRole="button"
            accessibilityLabel="Manage consents"
            accessibilityHint="View and change your consent settings"
            onPress={() => navigation.navigate('Consent')}
            >
              <Text style={styles.rowIcon} accessible={false}>📋</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Review Full Consent Log</Text>
                <Text style={styles.rowSub}>
                  {consents.timestamp
                    ? `Consented on ${new Date(consents.timestamp).toDateString()}`
                    : 'View all consents you have given'}
                </Text>
              </View>
              <Text style={styles.rowArrow} accessible={false}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Legal & Compliance ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel} accessibilityRole="header">LEGAL</Text>

          {[
            { label: 'Terms of Service', doc: 'terms' },
            { label: 'Privacy Policy', doc: 'privacy' },
            { label: 'Medical Disclaimer', doc: 'disclaimer' },
          ].map(({ label, doc }) => (
            <TouchableOpacity
              key={doc}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`Read ${label}`}
              accessibilityHint="Opens the document for reading"
              onPress={() =>
                navigation.navigate('DocumentViewer', { docType: doc, onMarkRead: () => {} })
              }
            >
              <Text style={styles.rowIcon}>📄</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{label}</Text>
              </View>
              <Text style={styles.rowArrow} accessible={false}>›</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.contactBox}>
            <Text style={styles.contactTitle}>Data Protection Officer</Text>
            <Text style={styles.contactDetail}>privacy@mamacare.app</Text>
            <Text style={styles.contactTitle}>ODPC Complaints</Text>
            <Text style={styles.contactDetail}>complaints@odpc.go.ke</Text>
          </View>
        </View>

        {/* Version */}
        <Text style={styles.version}>MamaCare v2.0 · Kenya DPA 2019 Compliant</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F7' },
  scroll: { paddingBottom: 40 },
  header: { backgroundColor: '#FF6B9D', padding: 20, paddingTop: 30 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  section: { marginTop: 24, marginHorizontal: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 8,
  },
  rowDanger: { borderWidth: 1, borderColor: '#FFCDD2' },
  rowIcon: { fontSize: 22, marginRight: 12 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#222' },
  rowSub: { fontSize: 12, color: '#888', marginTop: 2 },
  rowArrow: { fontSize: 22, color: '#ccc' },
  dangerText: { color: '#D32F2F' },
  consentRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 8,
  },
  contactBox: {
    backgroundColor: '#E3F2FD', padding: 14, borderRadius: 10, marginTop: 8,
  },
  contactTitle: { fontSize: 11, color: '#555', fontWeight: '700', marginTop: 6 },
  contactDetail: { fontSize: 13, color: '#1565C0' },
  version: { textAlign: 'center', color: '#bbb', fontSize: 11, marginTop: 24 },
});
