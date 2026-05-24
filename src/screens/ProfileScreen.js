/**
 * ProfileScreen.js
 * ─────────────────
 * Displays and allows editing of the user's pregnancy profile:
 * name, age, phone number, LMP date, and preferred language.
 *
 * Recalculates gestational age live when LMP date is updated.
 * Uses the same validateLmpDate() logic as OnboardingScreenEnhanced.
 *
 * BUG-002: Uses secureStorage for all PHI.
 * BUG-004: Validates LMP before saving.
 * BUG-008: No PHI logged to console.
 *
 * Path: src/screens/ProfileScreen.js
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { storage } from '../utils/secureStorage';
import { calculateGestationalAge, calculateDueDate, formatDate } from '../utils/dateCalculations';
import { SUPPORTED_LANGUAGES, t } from '../utils/languages';

// ─── LMP date validation (mirrors OnboardingScreenEnhanced) ─────────────────
function validateLmpDate(dateStr) {
  if (!dateStr || dateStr.trim().length === 0) {
    return { valid: false, message: 'Please enter your last menstrual period date.' };
  }
  let day, month, year;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return { valid: false, message: 'Use format DD/MM/YYYY.' };
    [day, month, year] = parts.map(Number);
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return { valid: false, message: 'Use format DD/MM/YYYY.' };
    if (parts[0].length === 4) { [year, month, day] = parts.map(Number); }
    else { [day, month, year] = parts.map(Number); }
  } else {
    return { valid: false, message: 'Please enter date as DD/MM/YYYY.' };
  }
  if (isNaN(day) || isNaN(month) || isNaN(year)) return { valid: false, message: 'Date contains non-numeric characters.' };
  if (month < 1 || month > 12) return { valid: false, message: `Month ${month} is not valid.` };
  if (day < 1 || day > 31) return { valid: false, message: `Day ${day} is not valid.` };
  const lmpDate = new Date(year, month - 1, day);
  const today = new Date(); today.setHours(23, 59, 59, 0);
  if (lmpDate > today) return { valid: false, message: 'LMP date cannot be in the future.' };
  const maxPast = new Date(); maxPast.setDate(maxPast.getDate() - 44 * 7);
  if (lmpDate < maxPast) return { valid: false, message: 'That date is more than 44 weeks ago.' };
  if (lmpDate.getMonth() !== month - 1) return { valid: false, message: `Day ${day} is not valid for month ${month}.` };
  return { valid: true, date: lmpDate };
}

function validatePhone(phone) {
  const cleaned = phone.replace(/\s/g, '');
  return /^(\+254|0)[17]\d{8}$/.test(cleaned);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState('en-KE');

  // Edit state
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [lmpDate, setLmpDate] = useState('');
  const [lmpError, setLmpError] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const p = await storage.getProfile();
      if (p) {
        setProfile(p);
        setLanguage(p.preferredLanguage || 'en-KE');
        setName(p.name || '');
        setAge(p.age ? String(p.age) : '');
        setPhone(p.phoneNumber || '');
        setLmpDate(p.lmpDate || '');
      }
    } catch (_) {
      console.warn('[ProfileScreen] Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) {
      Alert.alert('Name Required', 'Please enter your name (at least 2 characters).');
      return;
    }
    if (phone && !validatePhone(phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid Kenyan phone number (+254... or 07...).');
      return;
    }
    setLmpError('');
    if (lmpDate) {
      const lmpCheck = validateLmpDate(lmpDate);
      if (!lmpCheck.valid) { setLmpError(lmpCheck.message); return; }
    }

    setSaving(true);
    try {
      await storage.updateProfile({
        name: name.trim(),
        age: age ? parseInt(age, 10) : undefined,
        phoneNumber: phone.trim(),
        lmpDate: lmpDate.trim(),
        preferredLanguage: language,
        updatedAt: new Date().toISOString(),
      });

      const updated = await storage.getProfile();
      setProfile(updated);
      setEditing(false);
    } catch (_) {
      console.warn('[ProfileScreen] Failed to save profile');
      Alert.alert('Error', 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLanguageChange = (code) => {
    setLanguage(code);
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#FF6B9D" /></View>;
  }

  const gestAge = profile?.lmpDate ? calculateGestationalAge(profile.lmpDate) : null;
  const dueDate = profile?.lmpDate ? calculateDueDate(profile.lmpDate) : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Pregnancy summary card */}
        {gestAge && gestAge.weeks >= 0 && gestAge.weeks <= 45 && (
          <View style={styles.pregnancyCard}>
            <Text style={styles.pregnancyEmoji}>🤰</Text>
            <Text style={styles.pregnancyWeeks}>{gestAge.weeks} weeks {gestAge.days} days</Text>
            {dueDate && (
              <Text style={styles.pregnancyDue}>Due: {formatDate(dueDate)}</Text>
            )}
          </View>
        )}

        {/* Profile fields */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Personal Information</Text>
            <TouchableOpacity onPress={() => setEditing(!editing)} style={styles.editBtn}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Cancel editing' : 'Edit profile'}
            >
              <Text style={styles.editBtnText}>{editing ? 'Cancel' : '✏️ Edit'}</Text>
            </TouchableOpacity>
          </View>

          <ProfileField
            label="Name"
            value={name}
            editing={editing}
            onChangeText={setName}
            placeholder="Your full name"
            autoCapitalize="words"
          />
          <ProfileField
            label="Age"
            value={age}
            editing={editing}
            onChangeText={setAge}
            placeholder="Your age"
            keyboardType="number-pad"
            maxLength={3}
          />
          <ProfileField
            label="Phone number"
            value={phone}
            editing={editing}
            onChangeText={setPhone}
            placeholder="+254... or 07..."
            keyboardType="phone-pad"
          />
          <ProfileField
            label="Last menstrual period (LMP)"
            value={lmpDate}
            editing={editing}
            onChangeText={(v) => { setLmpDate(v); setLmpError(''); }}
            placeholder="DD/MM/YYYY"
            keyboardType="numbers-and-punctuation"
            error={lmpError}
          />
        </View>

        {/* Language preference */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preferred Language</Text>
          <View style={styles.languageGrid}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langChip,
                  language === lang.code && styles.langChipSelected,
                  !editing && styles.langChipDisabled,
                ]}
                onPress={() => editing && handleLanguageChange(lang.code)}
                disabled={!editing}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[
                  styles.langName,
                  language === lang.code && styles.langNameSelected,
                ]}>{lang.nativeName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save button */}
        {editing && (
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save Changes</Text>
            }
          </TouchableOpacity>
        )}

        {/* Navigation shortcuts */}
        <View style={styles.linksCard}>
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('EmergencyContacts')}>
            <Text style={styles.linkEmoji}>📞</Text>
            <Text style={styles.linkText}>Emergency Contacts</Text>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.linkEmoji}>⚙️</Text>
            <Text style={styles.linkText}>Settings & Privacy</Text>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Reusable field component ─────────────────────────────────────────────────
function ProfileField({ label, value, editing, onChangeText, placeholder, error, ...inputProps }) {
  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>
      {editing ? (
        <>
          <TextInput
            style={[fieldStyles.input, error && fieldStyles.inputError]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#bbb"
            {...inputProps}
          />
          {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
        </>
      ) : (
        <Text style={fieldStyles.value}>{value || '—'}</Text>
      )}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { fontSize: 12, color: '#888', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, color: '#222' },
  input: { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 16, color: '#222', backgroundColor: '#fafafa' },
  inputError: { borderColor: '#D32F2F' },
  errorText: { fontSize: 12, color: '#D32F2F', marginTop: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F8' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48 },

  pregnancyCard: {
    backgroundColor: '#FF6B9D', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 16,
  },
  pregnancyEmoji: { fontSize: 40, marginBottom: 8 },
  pregnancyWeeks: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  pregnancyDue: { fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 4 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  editBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#FFF0F5', borderRadius: 20 },
  editBtnText: { color: '#FF6B9D', fontWeight: '600', fontSize: 14 },

  languageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  langChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fafafa',
  },
  langChipSelected: { borderColor: '#FF6B9D', backgroundColor: '#FFF0F5' },
  langChipDisabled: { opacity: 0.7 },
  langFlag: { fontSize: 16, marginRight: 6 },
  langName: { fontSize: 13, color: '#555' },
  langNameSelected: { color: '#FF6B9D', fontWeight: '600' },

  saveBtn: { backgroundColor: '#FF6B9D', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  saveBtnDisabled: { backgroundColor: '#ccc' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  linksCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  linkEmoji: { fontSize: 22, marginRight: 12, width: 28 },
  linkText: { flex: 1, fontSize: 15, color: '#222' },
  linkArrow: { fontSize: 18, color: '#aaa' },
});
