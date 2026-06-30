/**
 * HomeScreen_Enhanced.js — PRODUCTION FIXED
 * ──────────────────────────────────────────
 * Changes from original:
 *  - Uses secureStorage (not plaintext AsyncStorage)
 *  - Settings gear icon in header (navigates to SettingsScreen)
 *  - BUG-008: No PHI in console logs
 *  - Graceful handling of negative/invalid gestational age (guards BUG-004)
 *
 * Path: src/screens/HomeScreen_Enhanced.js
 */

import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { storage } from '../utils/secureStorage';
import {
  calculateGestationalAge,
  calculateDueDate,
  formatDate,
  getDaysUntilDueDate,
} from '../utils/dateCalculations';

export default function HomeScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [gestationalAge, setGestationalAge] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [loading, setLoading] = useState(true);

  // Add Settings ⚙️ to the navigation header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          style={{ marginRight: 16 }}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          accessibilityHint="Open app settings"
        >
          <Text style={{ fontSize: 22 }} accessible={false}>⚙️</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadProfile);
    loadProfile();
    return unsubscribe;
  }, [navigation]);

  const loadProfile = async () => {
    try {
      const userProfile = await storage.getProfile();
      if (!userProfile) {
        // Profile missing — go back to onboarding
        navigation.replace('Onboarding');
        return;
      }

      setProfile(userProfile);

      if (userProfile.lmpDate) {
        const age = calculateGestationalAge(userProfile.lmpDate);
        const due = calculateDueDate(userProfile.lmpDate);

        // BUG-004 guard: if LMP was somehow bad, don't show negative weeks
        if (age && age.weeks >= 0 && age.weeks <= 45) {
          setGestationalAge(age);
          setDueDate(due);
        } else {
          setGestationalAge(null);
          setDueDate(null);
        }
      }
    } catch (_) {
      // BUG-008: no PHI in error log
      console.warn('[HomeScreen] Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B9D" />
      </View>
    );
  }

  if (!profile) {return null;}

  const daysUntilDue = dueDate ? getDaysUntilDueDate(dueDate) : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Greeting */}
        <View
          style={styles.greetingCard}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={`Hello ${profile.name}. How are you and baby doing today?`}
        >
          <Text style={styles.greeting} accessible={false}>Hello, {profile.name}! 👋</Text>
          <Text style={styles.subGreeting} accessible={false}>How are you and baby doing today?</Text>
        </View>

        {/* Pregnancy Progress */}
        {gestationalAge ? (
          <View style={styles.progressCard}>
            <Text style={styles.cardTitle}>Your Pregnancy</Text>

            <View
              style={styles.weekDisplay}
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel={`You are ${gestationalAge.weeks} weeks and ${gestationalAge.days} days pregnant`}
            >
              <Text style={styles.weekNumber} accessible={false}>{gestationalAge.weeks}</Text>
              <Text style={styles.weekLabel} accessible={false}>weeks</Text>
              <Text style={styles.weekDays} accessible={false}>+ {gestationalAge.days} days</Text>
            </View>

            {dueDate && (
              <View
                style={styles.dueDateContainer}
                accessible={true}
                accessibilityRole="text"
                accessibilityLabel={daysUntilDue !== null && daysUntilDue > 0 ? `Due date ${formatDate(dueDate)}, ${daysUntilDue} days to go` : daysUntilDue === 0 ? `Due date is today, ${formatDate(dueDate)}` : `Due date was ${formatDate(dueDate)}`}
              >
                <Text style={styles.dueDateLabel} accessible={false}>Due Date</Text>
                <Text style={styles.dueDate} accessible={false}>{formatDate(dueDate)}</Text>
                {daysUntilDue !== null && (
                  <Text style={styles.daysLeft} accessible={false}>
                    {daysUntilDue > 0 ? `${daysUntilDue} days to go!` : '🎉 Today!'}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.viewWeekButton}
              onPress={() =>
                navigation.navigate('WeeklyGuide', { week: gestationalAge.weeks })
              }
              accessibilityRole="button"
              accessibilityLabel={`View week ${gestationalAge.weeks} pregnancy guide`}
            >
              <Text style={styles.viewWeekButtonText} accessible={false}>
                View Week {gestationalAge.weeks} Guide →
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.progressCard}>
            <Text style={styles.cardTitle}>Pregnancy Dates</Text>
            <Text style={{ color: '#888', textAlign: 'center', paddingVertical: 12 }}>
              Could not calculate — please update your LMP date in Profile.
            </Text>
            <TouchableOpacity
              style={styles.viewWeekButton}
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Update Profile"
              accessibilityHint="Go to Profile to update your last menstrual period date"
            >
              <Text style={styles.viewWeekButtonText} accessible={false}>Update Profile →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Cards */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#FFEBEE' }]}
            onPress={() => navigation.navigate('SymptomChecker')}
            accessibilityRole="button"
            accessibilityLabel="Symptom Checker"
            accessibilityHint="Check if your symptoms need medical attention"
          >
            <Text style={styles.actionEmoji} accessible={false}>🚨</Text>
            <Text style={styles.actionTitle} accessible={false}>Symptom Checker</Text>
            <Text style={styles.actionDescription} accessible={false}>Check if symptoms need attention</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#E8F5E9' }]}
            onPress={() => navigation.navigate('VoiceSymptomChecker')}
            accessibilityRole="button"
            accessibilityLabel="Voice Symptom Checker"
            accessibilityHint="Speak your symptoms aloud to check for danger signs"
          >
            <Text style={styles.actionEmoji} accessible={false}>🎤</Text>
            <Text style={styles.actionTitle} accessible={false}>Voice Checker</Text>
            <Text style={styles.actionDescription} accessible={false}>Speak your symptoms</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#E3F2FD' }]}
            onPress={() => navigation.navigate('WeeklyGuide')}
            accessibilityRole="button"
            accessibilityLabel="Weekly Pregnancy Guide"
            accessibilityHint="Read this week&apos;s guide about your baby&apos;s development"
          >
            <Text style={styles.actionEmoji} accessible={false}>📖</Text>
            <Text style={styles.actionTitle} accessible={false}>Weekly Guide</Text>
            <Text style={styles.actionDescription} accessible={false}>Track baby&apos;s growth</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#FFF3E0' }]}
            onPress={() => navigation.navigate('EmergencyContacts')}
            accessibilityRole="button"
            accessibilityLabel="Emergency Contacts"
            accessibilityHint="Add or manage your emergency contacts for automatic alerts"
          >
            <Text style={styles.actionEmoji} accessible={false}>📞</Text>
            <Text style={styles.actionTitle} accessible={false}>Emergency Contacts</Text>
            <Text style={styles.actionDescription} accessible={false}>Manage your safety network</Text>
          </TouchableOpacity>
        </View>

        {/* Emergency strip */}
        <TouchableOpacity
          style={styles.emergencyStrip}
          onPress={() => navigation.navigate('SymptomChecker')}
          accessibilityRole="button"
          accessibilityLabel="Emergency symptom check"
          accessibilityHint="If you are experiencing a medical emergency, tap to check your symptoms now. For life-threatening emergencies call 999."
        >
          <Text style={styles.emergencyStripText} accessible={false}>
            🚨 Emergency? Tap here to check symptoms now
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F8' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  greetingCard: {
    backgroundColor: '#FF6B9D', padding: 20, borderRadius: 16, marginBottom: 12,
  },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  progressCard: {
    backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 12 },
  weekDisplay: { alignItems: 'center', paddingVertical: 16 },
  weekNumber: { fontSize: 72, fontWeight: 'bold', color: '#FF6B9D', lineHeight: 80 },
  weekLabel: { fontSize: 18, color: '#888' },
  weekDays: { fontSize: 14, color: '#aaa' },
  dueDateContainer: {
    alignItems: 'center', paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 8,
  },
  dueDateLabel: { fontSize: 12, color: '#aaa' },
  dueDate: { fontSize: 18, fontWeight: '600', color: '#222' },
  daysLeft: { fontSize: 14, color: '#FF6B9D', marginTop: 2 },
  viewWeekButton: {
    backgroundColor: '#FF6B9D', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 12,
  },
  viewWeekButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  actionsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionCard: {
    width: '48%', padding: 16, borderRadius: 14, marginBottom: 12, minHeight: 100,
  },
  actionEmoji: { fontSize: 30, marginBottom: 8 },
  actionTitle: { fontSize: 14, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  actionDescription: { fontSize: 12, color: '#666' },
  emergencyStrip: {
    backgroundColor: '#D32F2F', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 4,
  },
  emergencyStripText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
