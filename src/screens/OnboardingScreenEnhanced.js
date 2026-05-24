/**
 * OnboardingScreenEnhanced.js — PRODUCTION FIXED
 * ────────────────────────────────────────────────
 * BUG-004 FIX: LMP date validation — rejects future dates and dates
 *              more than 42 weeks in the past (biologically impossible range).
 * BUG-002 FIX: Uses secureStorage instead of AsyncStorage.
 * BUG-008 FIX: No PHI logged to console.
 *
 * Path: src/screens/OnboardingScreenEnhanced.js
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import { storage } from '../utils/secureStorage';
import { SUPPORTED_LANGUAGES, t } from '../utils/languages';

// ─── LMP Date validation ───────────────────────────────────────────────────────
/**
 * Validates a DD/MM/YYYY date string as a plausible LMP date.
 * Returns { valid: true } or { valid: false, message: '...' }
 */
function validateLmpDate(dateStr) {
  if (!dateStr || dateStr.trim().length === 0) {
    return { valid: false, message: 'Please enter your last menstrual period date.' };
  }

  // Accept DD/MM/YYYY or YYYY-MM-DD
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
    // Could be YYYY-MM-DD
    if (parts[0].length === 4) {
      [year, month, day] = parts.map(Number);
    } else {
      [day, month, year] = parts.map(Number);
    }
  } else {
    return { valid: false, message: 'Please enter date as DD/MM/YYYY (e.g. 15/08/2025).' };
  }

  // Basic numeric sanity
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

  // BUG-004 FIX: Reject future dates
  const today = new Date();
  today.setHours(23, 59, 59, 0);
  if (lmpDate > today) {
    return {
      valid: false,
      message: 'Your last menstrual period date cannot be in the future.',
    };
  }

  // BUG-004 FIX: Reject dates more than 42 weeks ago (already delivered range + buffer)
  const MAX_WEEKS_AGO = 44;
  const maxPastDate = new Date();
  maxPastDate.setDate(maxPastDate.getDate() - MAX_WEEKS_AGO * 7);
  if (lmpDate < maxPastDate) {
    return {
      valid: false,
      message: `That date is more than ${MAX_WEEKS_AGO} weeks ago. Please check the date and try again.`,
    };
  }

  // Reject clearly invalid calendar dates (e.g. Feb 30)
  if (lmpDate.getMonth() !== month - 1) {
    return { valid: false, message: `Day ${day} is not valid for month ${month}.` };
  }

  return { valid: true, date: lmpDate };
}

// ─── Phone number validation ───────────────────────────────────────────────────
function validatePhone(phone) {
  const cleaned = phone.replace(/\s/g, '');
  // Accept +254XXXXXXXXX or 07XXXXXXXX or 01XXXXXXXX
  const kenyanPhone = /^(\+254|0)[17]\d{8}$/.test(cleaned);
  return kenyanPhone;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [language, setLanguage] = useState('en-KE');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lmpDate, setLmpDate] = useState('');
  const [lmpError, setLmpError] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');

  const sw = language === 'sw-KE';

  const handleLanguageSelect = (langCode) => {
    setLanguage(langCode);
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (!name.trim()) {
      Alert.alert(
        sw ? 'Jina linahitajika' : 'Name Required',
        sw ? 'Tafadhali ingiza jina lako.' : 'Please enter your name.'
      );
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert(
        sw ? 'Jina fupi mno' : 'Name Too Short',
        sw ? 'Jina lazima liwe na herufi 2+.' : 'Name must be at least 2 characters.'
      );
      return;
    }
    setStep(3);
  };

  const handleNextStep3 = () => {
    setLmpError('');
    const result = validateLmpDate(lmpDate);
    if (!result.valid) {
      setLmpError(result.message);
      return;
    }
    setStep(4);
  };

  const handleFinish = async () => {
    if (!emergencyContact.trim()) {
      Alert.alert(
        sw ? 'Hakuna Mawasiliano ya Dharura' : 'No Emergency Contact',
        sw
          ? 'Inashauriwa kuongeza angalau mtu mmoja. Je, unataka kuendelea bila mawasiliano ya dharura?'
          : 'We strongly recommend at least one emergency contact. Continue without one?',
        [
          { text: sw ? 'Rudi' : 'Go Back', style: 'cancel' },
          { text: sw ? 'Endelea' : 'Continue Anyway', onPress: () => saveAndNavigate() },
        ]
      );
      return;
    }

    if (emergencyContact && !validatePhone(emergencyContact)) {
      Alert.alert(
        sw ? 'Nambari si sahihi' : 'Invalid Phone Number',
        sw
          ? 'Tafadhali ingiza nambari sahihi ya Kenya (+254 au 07/01...)'
          : 'Please enter a valid Kenyan phone number (+254 or 07/01...)'
      );
      return;
    }

    await saveAndNavigate();
  };

  const saveAndNavigate = async () => {
    try {
      await storage.saveProfile({
        name: name.trim(),
        age: parseInt(age) || null,
        phoneNumber: phoneNumber.trim(),
        lmpDate: lmpDate.trim(),
        preferredLanguage: language,
        onboardingCompleted: true,
        createdAt: new Date().toISOString(),
      });

      if (emergencyContact.trim()) {
        await storage.saveEmergencyContacts([emergencyContact.trim()]);
      }

      // Navigate to consent screen (consent must come after profile, before home)
      navigation.replace('Consent');
    } catch (_) {
      // BUG-008: no raw data in error log
      console.warn('[Onboarding] Failed to save profile');
      Alert.alert('Error', 'Could not complete setup. Please try again.');
    }
  };

  // ─── Step 1: Language ──────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.logo} accessible={false}>🤰</Text>
            <Text style={styles.title}>Welcome to MamaCare</Text>
            <Text style={styles.subtitle}>Your AI-powered pregnancy companion</Text>
          </View>

          <View style={styles.languageSection}>
            <Text style={styles.sectionTitle}>Choose Your Language / Chagua Lugha</Text>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={styles.languageButton}
                onPress={() => handleLanguageSelect(lang.code)}
                accessibilityRole="radio"
                accessibilityLabel={`${lang.nativeName} — ${lang.name}`}
                accessibilityHint="Select as your preferred language"
                accessibilityState={{ selected: language === lang.code }}
              >
                <Text style={styles.languageFlag} accessible={false}>{lang.flag}</Text>
                <View style={styles.languageInfo}>
                  <Text style={styles.languageName}>{lang.nativeName}</Text>
                  <Text style={styles.languageSubtext}>{lang.name}</Text>
                </View>
                <Text style={styles.languageArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.features}>
            <Text style={styles.featuresTitle}>What you'll get:</Text>
            {[
              ['🚨', 'AI Symptom Checker', 'Know when to seek help'],
              ['🎤', 'Voice Features', 'Speak your symptoms'],
              ['📖', 'Weekly Guides', "Track baby's growth"],
              ['📞', 'Emergency Alerts', 'Automatic family notifications'],
              ['🌐', 'Works Offline', 'No internet needed'],
            ].map(([icon, name, desc]) => (
              <View key={name} style={styles.feature}>
                <Text style={styles.featureIcon}>{icon}</Text>
                <View>
                  <Text style={styles.featureName}>{name}</Text>
                  <Text style={styles.featureDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Step 2: Personal Info ─────────────────────────────────────────────────
  if (step === 2) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.stepIndicator}>{sw ? 'Hatua 1 ya 3' : 'Step 1 of 3'}</Text>
            <Text style={styles.title}>{sw ? 'Kuhusu Wewe' : 'About You'}</Text>
            <Text style={styles.subtitle}>{sw ? 'Tuambie jina lako' : 'Tell us about yourself'}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>{sw ? 'Jina lako *' : 'Your Name *'}</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Your full name"
              placeholder={sw ? 'Jina lako' : 'Your full name'}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>{sw ? 'Umri (hiari)' : 'Age (optional)'}</Text>
            <TextInput
              style={styles.input}
              placeholder="25"
            accessibilityLabel="Your age in years"
            accessibilityHint="Enter a number between 15 and 60"
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
              maxLength={2}
            />

            <Text style={styles.label}>{sw ? 'Nambari ya Simu (hiari)' : 'Phone Number (optional)'}</Text>
            <TextInput
              style={styles.input}
              placeholder="+254 700 000 000"
            accessibilityLabel="Your phone number"
            accessibilityHint="Include country code, for example plus 254 followed by 9 digits"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleNextStep2}
          accessibilityRole="button"
          accessibilityLabel="Continue to next step"
          >
            <Text style={styles.buttonText}>{sw ? 'Endelea' : 'Next'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Step 3: LMP Date ─────────────────────────────────────────────────────
  if (step === 3) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.stepIndicator}>{sw ? 'Hatua 2 ya 3' : 'Step 2 of 3'}</Text>
            <Text style={styles.title}>{sw ? 'Ujauzito Wako' : 'Your Pregnancy'}</Text>
            <Text style={styles.subtitle}>
              {sw ? 'Tuambie kuhusu ujauzito wako' : 'Tell us about your pregnancy'}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>
              {sw ? 'Siku ya kwanza ya hedhi yako ya mwisho *' : 'First day of your last period *'}
            </Text>
            <Text style={styles.helperText}>
              {sw
                ? 'Ingiza kwa muundo DD/MM/YYYY — lazima iwe siku ya zamani'
                : 'Enter as DD/MM/YYYY — must be a past date'}
            </Text>
            <TextInput
              style={[styles.input, lmpError ? styles.inputError : null]}
              placeholder="DD/MM/YYYY"
            accessibilityLabel="Last menstrual period date"
            accessibilityHint="Enter date in format day month year, for example 15 slash 08 slash 2025"
              value={lmpDate}
              onChangeText={(t) => { setLmpDate(t); setLmpError(''); }}
              keyboardType="numeric"
              maxLength={10}
            />
            {lmpError ? (
              <Text style={styles.errorText}>⚠️ {lmpError}</Text>
            ) : null}

            <View style={styles.infoBox}>
              <Text style={styles.infoIcon} accessible={false}>💡</Text>
              <Text style={styles.infoText}>
                {sw
                  ? 'Hii itatusaidia kukokotoa wiki za ujauzito na tarehe ya kuzaa'
                  : 'This helps us calculate your pregnancy weeks and due date'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleNextStep3}
          accessibilityRole="button"
          accessibilityLabel="Continue to next step"
          >
            <Text style={styles.buttonText}>{sw ? 'Endelea' : 'Next'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Step 4: Emergency Contact ─────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.stepIndicator}>{sw ? 'Hatua 3 ya 3' : 'Step 3 of 3'}</Text>
          <Text style={styles.title}>{sw ? 'Usalama Wako' : 'Your Safety'}</Text>
          <Text style={styles.subtitle}>
            {sw ? 'Ongeza angalau mtu mmoja wa dharura' : 'Add at least one emergency contact'}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>
            {sw ? 'Nambari ya Dharura' : 'Emergency Contact Number'}
          </Text>
          <Text style={styles.helperText}>
            {sw
              ? 'Mume, familia, au rafiki — wataarifiwa wakati wa dharura'
              : "Husband, family, or friend — they'll be alerted in emergencies"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder="+254 700 000 000"
            accessibilityLabel="Emergency contact phone number"
            accessibilityHint="Include country code, for example plus 254 followed by 9 digits"
            value={emergencyContact}
            onChangeText={setEmergencyContact}
            keyboardType="phone-pad"
          />

          <View style={[styles.infoBox, { backgroundColor: '#FFEBEE' }]}>
            <Text style={styles.infoIcon} accessible={false}>🚨</Text>
            <Text style={styles.infoText}>
              {sw
                ? 'Ikiwa app itagundua dalili za hatari, itatuma SMS kwa mtu huyu mara moja'
                : "If danger signs are detected, we'll immediately SMS this person"}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleFinish}
          accessibilityRole="button"
          accessibilityLabel="Finish setup">
          <Text style={styles.buttonText}>{sw ? 'Maliza Usanidi' : 'Finish Setup'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleFinish}
          accessibilityRole="button"
          accessibilityLabel="Skip this step and finish">
          <Text style={styles.skipText}>{sw ? 'Ruka kwa sasa' : 'Skip for now'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const C = {
  primary: '#FF6B9D',
  text: '#222',
  textLight: '#777',
  bg: '#FFF5F8',
  white: '#fff',
  border: '#eee',
  error: '#D32F2F',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 24, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 28 },
  logo: { fontSize: 72, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: 'bold', color: C.text, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, color: C.textLight, textAlign: 'center' },
  stepIndicator: { fontSize: 13, color: C.primary, fontWeight: '700', marginBottom: 6 },
  languageSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: C.text, marginBottom: 12, textAlign: 'center' },
  languageButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.white, padding: 14, borderRadius: 12, marginBottom: 8,
  },
  languageFlag: { fontSize: 28, marginRight: 14 },
  languageInfo: { flex: 1 },
  languageName: { fontSize: 16, fontWeight: '600', color: C.text },
  languageSubtext: { fontSize: 12, color: C.textLight },
  languageArrow: { fontSize: 22, color: C.primary },
  features: { marginTop: 16 },
  featuresTitle: { fontSize: 16, fontWeight: 'bold', color: C.text, marginBottom: 12 },
  feature: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, padding: 14, borderRadius: 12, marginBottom: 8 },
  featureIcon: { fontSize: 28, marginRight: 14 },
  featureName: { fontSize: 15, fontWeight: '600', color: C.text },
  featureDesc: { fontSize: 12, color: C.textLight },
  form: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: C.text, marginTop: 14, marginBottom: 4 },
  helperText: { fontSize: 12, color: C.textLight, marginBottom: 6 },
  input: {
    backgroundColor: C.white, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, fontSize: 15, color: C.text,
  },
  inputError: { borderColor: C.error },
  errorText: { color: C.error, fontSize: 12, marginTop: 4 },
  infoBox: {
    flexDirection: 'row', backgroundColor: '#FFF3E0',
    padding: 12, borderRadius: 10, marginTop: 14,
  },
  infoIcon: { fontSize: 22, marginRight: 10 },
  infoText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
  button: { backgroundColor: C.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: C.white, fontSize: 17, fontWeight: 'bold' },
  skipButton: { padding: 14, alignItems: 'center', marginTop: 6 },
  skipText: { color: C.textLight, fontSize: 13, textDecorationLine: 'underline' },
});
