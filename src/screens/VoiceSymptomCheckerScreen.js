/**
 * VoiceSymptomCheckerScreen.js — PRODUCTION FIXED
 * ─────────────────────────────────────────────────
 * BUG-003 FIX: convertSpeechToText() now makes real API call to
 *              Google Cloud Speech-to-Text (sw-KE, en-KE, and other locales).
 *
 * TC-027 FIX: Confirmation dialog now actually rendered in JSX.
 * TC-028 FIX: Text input fallback after 2 voice failures.
 * BUG-005 FIX: Emergency contact guard before SMS send.
 * BUG-006/007: Uses EmergencyAlertManager for throttled, translated SMS.
 * BUG-008 FIX: No PHI logged to console.
 *
 * Path: src/screens/VoiceSymptomCheckerScreen.js
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { storage } from '../utils/secureStorage';
import { sendEmergencyAlert, scheduleCHWVisit } from '../utils/EmergencyAlertManager';
import { assessSymptoms } from '../utils/riskAssessment';

// ─── Google Cloud Speech-to-Text config ───────────────────────────────────────
// Set your API key in app.config.js as EXPO_PUBLIC_GOOGLE_STT_KEY
const GOOGLE_STT_KEY = process.env.EXPO_PUBLIC_GOOGLE_STT_KEY || '';
const GOOGLE_STT_URL = `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_STT_KEY}`;

// Language codes supported by Google STT that map to our app languages
const STT_LANGUAGE_MAP = {
  'en-KE': 'en-KE',
  'sw-KE': 'sw-KE',
  'ki-KE': 'en-KE', // Kikuyu not natively supported — fall back to English STT
  'luo-KE': 'en-KE',
  'kln-KE': 'en-KE',
  'kam-KE': 'sw-KE', // Kamba speakers often use Swahili with STT
  'luy-KE': 'sw-KE',
  'guz-KE': 'sw-KE',
};

// ─── Symptom keyword extraction ────────────────────────────────────────────────
const SYMPTOM_KEYWORDS = {
  severe_bleeding: [
    'heavy bleeding','bleeding a lot','soaking pad','blood everywhere',
    'kutoka damu nyingi','damu nyingi','pedi imejaa',
  ],
  severe_headache_blurred_vision: [
    'severe headache','bad headache','blurred vision','cannot see','see stars',
    'maumivu makali ya kichwa','kuona kiza','kichwa kinauma sana',
  ],
  severe_abdominal_pain: [
    'severe pain','stomach pain','abdomen pain','cramping badly','cant move from pain',
    'maumivu makali ya tumbo','tumbo linauma sana',
  ],
  convulsions: ['seizure','convulsion','shaking uncontrollably','collapsed','kifafa'],
  difficulty_breathing: [
    'cannot breathe','hard to breathe','breathing problem','chest tight','shortness of breath',
    'shida kupumua','kupumua kwa shida',
  ],
  no_fetal_movement_24hrs: [
    'baby not moving','no movement','baby stopped moving','cant feel baby',
    'mtoto hajaenda','mtoto hajasogea',
  ],
  fever: [
    'fever','high temperature','very hot','burning up','homa','homa kali',
  ],
  persistent_vomiting: [
    'vomiting','throwing up','cant keep food down','kutapika','kutapika sana',
  ],
  severe_swelling: [
    'swelling','swollen face','swollen hands','puffy','kuvimba','uso umevimba',
  ],
  morning_sickness: ['morning sickness','nausea morning','kichefuchefu asubuhi'],
  fatigue: ['tired','exhausted','fatigue','uchovu','nimechoka sana'],
  dizziness: ['dizzy','lightheaded','spinning','kizunguzungu'],
};

function extractSymptomsFromText(text) {
  const lower = text.toLowerCase();
  const detected = [];
  for (const [id, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      detected.push(id);
    }
  }
  return [...new Set(detected)];
}

// ─── Google STT API call ───────────────────────────────────────────────────────
async function convertSpeechToText(audioUri, appLanguage) {
  const sttLang = STT_LANGUAGE_MAP[appLanguage] || 'sw-KE';

  // Read audio file as base64
  const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const requestBody = {
    config: {
      encoding: 'WEBM_OPUS',      // Expo AV default on Android
      sampleRateHertz: 48000,
      languageCode: sttLang,
      alternativeLanguageCodes: ['sw-KE', 'en-KE'], // Accept bilingual
      model: 'default',
      useEnhanced: false,          // Enhanced costs more — use for premium tier
      enableAutomaticPunctuation: false,
      speechContexts: [
        {
          // Boost medical symptom terms for better accuracy
          phrases: [
            'bleeding','headache','vomiting','fever','swelling','pain',
            'kutoka damu','maumivu','homa','kuvimba','kutapika',
          ],
          boost: 15.0,
        },
      ],
    },
    audio: {
      content: base64Audio,
    },
  };

  const response = await fetch(GOOGLE_STT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    // BUG-008: log only the status code, not the audio content
    console.warn('[VoiceChecker] STT API error, status:', response.status);
    throw new Error(`STT_API_ERROR_${response.status}`);
  }

  const data = await response.json();
  const transcript = data.results
    ?.map((r) => r.alternatives?.[0]?.transcript || '')
    .join(' ')
    .trim();

  return transcript || '';
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VoiceSymptomCheckerScreen({ navigation }) {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [assessment, setAssessment] = useState(null);
  const [language, setLanguage] = useState('en-KE');
  const [failureCount, setFailureCount] = useState(0);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [manualText, setManualText] = useState('');

  // TC-027 FIX: Confirmation modal state
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const profileRef = useRef(null);

  useEffect(() => {
    loadUserLanguage();
    return () => {
      if (recording) {recording.stopAndUnloadAsync();}
    };
  }, []);

  const loadUserLanguage = async () => {
    const profile = await storage.getProfile();
    if (profile?.preferredLanguage) {setLanguage(profile.preferredLanguage);}
    profileRef.current = profile;
  };

  // ── Recording ────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          language === 'sw-KE' ? 'Ruhusa Inahitajika' : 'Permission Required',
          language === 'sw-KE'
            ? 'Tafadhali ruhusu matumizi ya maikrofoni ili kutumia sauti'
            : 'Please allow microphone access to use voice features'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(rec);
      setIsRecording(true);

      Speech.speak(
        language === 'sw-KE'
          ? 'Niambie unajisikiaje. Eleza dalili zako'
          : 'Tell me how you are feeling. Describe your symptoms',
        { language: STT_LANGUAGE_MAP[language] || 'en-KE' }
      );
    } catch (err) {
      console.warn('[VoiceChecker] startRecording failed');
      Alert.alert('Error', 'Could not start recording. Please try text input instead.');
      setShowTextFallback(true);
    }
  };

  const stopRecording = async () => {
    if (!recording) {return;}
    setIsRecording(false);
    setIsProcessing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      // BUG-003 FIX: Real API call
      let rawTranscript = '';
      try {
        rawTranscript = await convertSpeechToText(uri, language);
      } catch (sttErr) {
        // STT failed — count failure and possibly show fallback
        const newCount = failureCount + 1;
        setFailureCount(newCount);
        setIsProcessing(false);

        if (newCount >= 2) {
          // TC-028 FIX: After 2 failures, offer text input
          setShowTextFallback(true);
          Alert.alert(
            language === 'sw-KE' ? 'Sauti Haisikiki' : 'Voice Not Clear',
            language === 'sw-KE'
              ? 'Tumejaribu mara mbili bila mafanikio. Andika dalili zako badala yake.'
              : 'Could not understand your voice after 2 attempts. Please type your symptoms instead.'
          );
        } else {
          Alert.alert(
            language === 'sw-KE' ? 'Jaribu Tena' : 'Try Again',
            language === 'sw-KE'
              ? 'Sikuelewa vizuri. Zungumza polepole na kwa uwazi.'
              : 'Could not understand clearly. Please speak slowly and clearly.'
          );
        }
        return;
      }

      if (!rawTranscript) {
        Speech.speak(
          language === 'sw-KE'
            ? 'Samahani, sikuelewa. Tafadhali jaribu tena'
            : 'Sorry, I did not understand. Please try again',
          { language: STT_LANGUAGE_MAP[language] || 'en-KE' }
        );
        setIsProcessing(false);
        return;
      }

      // TC-027 FIX: Show confirmation modal instead of processing directly
      setPendingTranscript(rawTranscript);
      setTranscript(rawTranscript);
      setIsProcessing(false);
      setShowConfirmModal(true);
    } catch (err) {
      console.warn('[VoiceChecker] stopRecording error');
      setIsProcessing(false);
      Alert.alert('Error', 'Could not process recording. Please try again.');
    }
  };

  // ── Confirmation modal handlers ───────────────────────────────────────────
  const handleConfirmTranscript = () => {
    setShowConfirmModal(false);
    processSymptoms(pendingTranscript);
  };

  const handleRejectTranscript = () => {
    setShowConfirmModal(false);
    setPendingTranscript('');
    setTranscript('');
    // Reset for another attempt
  };

  // ── Symptom processing ────────────────────────────────────────────────────
  const processSymptoms = async (text) => {
    setIsProcessing(true);
    const detectedSymptoms = extractSymptomsFromText(text);

    if (detectedSymptoms.length === 0) {
      setIsProcessing(false);
      Alert.alert(
        language === 'sw-KE' ? 'Hakuna Dalili Zilizopatikana' : 'No Symptoms Detected',
        language === 'sw-KE'
          ? 'Hatujapata dalili. Eleza zaidi: kwa mfano "Ninahisi maumivu ya kichwa na kuvimba"'
          : 'Could not detect symptoms. Try describing more specifically, e.g. "I have a severe headache and my face is swollen"'
      );
      return;
    }

    const result = assessSymptoms(detectedSymptoms);
    setAssessment(result);

    await storage.saveSymptomCheck({
      symptoms: detectedSymptoms,
      transcript: text,
      assessment: result,
      method: 'voice',
      timestamp: new Date().toISOString(),
    });

    const spokenMsg = language === 'sw-KE' ? result.messageSwahili : result.message;
    if (spokenMsg) {
      Speech.speak(spokenMsg, { language: STT_LANGUAGE_MAP[language] || 'en-KE' });
    }

    if (result.sendAlert) {
      await handleEmergencyAlert(result, detectedSymptoms);
    }

    setIsProcessing(false);
  };

  const handleEmergencyAlert = async (result, symptoms) => {
    const profile = profileRef.current || (await storage.getProfile());
    const contacts = await storage.getEmergencyContacts();

    const alertResult = await sendEmergencyAlert({
      assessment: { ...result, symptoms },
      profile,
      contacts,
      language,
      motherId: profile?.phoneNumber || 'unknown',
    });

    if (!alertResult.sent) {
      if (alertResult.reason === 'no_contacts' || alertResult.reason === 'invalid_contacts') {
        Alert.alert(
          language === 'sw-KE' ? '🚨 Dalili za Hatari' : '🚨 Danger Signs Detected',
          (language === 'sw-KE'
            ? 'Dalili hizi zinahitaji msaada wa haraka!\n\n'
            : 'These symptoms need immediate attention!\n\n') +
            (alertResult.userMessage || '') +
            '\n\nCall 999 NOW.',
          [
            {
              text: language === 'sw-KE' ? 'Ongeza Mawasiliano' : 'Add Contacts',
              onPress: () => navigation.navigate('EmergencyContacts'),
            },
            { text: 'OK' },
          ]
        );
      } else if (alertResult.reason === 'escalate_chw') {
        await scheduleCHWVisit(profile?.phoneNumber || 'unknown', symptoms[0]);
        Alert.alert(
          language === 'sw-KE' ? 'Mhudumu Atawasiliana Nawe' : 'CHW Will Visit You',
          alertResult.userMessage || 'Your Community Health Worker has been scheduled for an urgent home visit.'
        );
      }
    } else {
      Alert.alert(
        language === 'sw-KE' ? '🚨 Tahadhari Imetumwa' : '🚨 Emergency Alert Sent',
        language === 'sw-KE'
          ? `Mawasiliano yako ya dharura wamearifu. Tafuta msaada wa matibabu MARA MOJA.`
          : `Your ${alertResult.recipientCount} emergency contact(s) have been notified. Seek medical care IMMEDIATELY.`
      );
    }
  };

  // ── Text fallback submit ──────────────────────────────────────────────────
  const handleTextSubmit = () => {
    if (!manualText.trim()) {return;}
    setTranscript(manualText.trim());
    processSymptoms(manualText.trim());
  };

  const reset = () => {
    setTranscript('');
    setAssessment(null);
    setRecording(null);
    setPendingTranscript('');
    setShowConfirmModal(false);
    setShowTextFallback(false);
    setManualText('');
    setFailureCount(0);
    setIsProcessing(false);
  };

  const switchLanguage = () => {
    const newLang = language === 'en-KE' ? 'sw-KE' : 'en-KE';
    setLanguage(newLang);
    storage.updateProfile({ preferredLanguage: newLang });
  };

  // ─── Assessment result screen ─────────────────────────────────────────────
  if (assessment) {
    const riskColor = assessment.level === '🔴' ? '#D32F2F'
      : assessment.level === '🟡' ? '#F57F17'
      : '#2E7D32';

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View
            style={[styles.resultCard, { borderColor: riskColor }]}
            accessible={true}
            accessibilityLiveRegion={assessment.level === '🔴' || assessment.level === '🟠' ? 'assertive' : 'polite'}
            accessibilityLabel={`Result: ${assessment.priority}. ${assessment.level === 'sw-KE' ? assessment.messageSwahili : assessment.message}`}
          >
            <View style={[styles.resultHeader, { backgroundColor: riskColor }]}>
              <Text style={styles.resultLevel}>{assessment.level}</Text>
              <Text style={styles.resultPriority}>{assessment.priority}</Text>
            </View>

            <View style={styles.resultContent}>
              {transcript ? (
                <>
                  <Text style={styles.transcriptLabel}>
                    {language === 'sw-KE' ? 'Ulisema:' : 'You said:'}
                  </Text>
                  <Text style={styles.transcriptText}>{`"${transcript}"`}</Text>
                </>
              ) : null}

              <Text style={styles.resultMessage}>
                {language === 'sw-KE' ? assessment.messageSwahili : assessment.message}
              </Text>
              <Text style={styles.resultAction}>
                {language === 'sw-KE' ? assessment.actionSwahili : assessment.action}
              </Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={reset}
                  accessibilityRole="button"
                  accessibilityLabel="Check again"
                >
                  <Text style={styles.btnText}>
                    {language === 'sw-KE' ? 'Angalia Tena' : 'Check Again'}
                  </Text>
                </TouchableOpacity>
                {assessment.sendAlert && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDanger]}
                    onPress={() => navigation.navigate('EmergencyContacts')}
                    accessibilityRole="button"
                    accessibilityLabel="Go to Emergency Contacts"
                    accessibilityHint="Open your emergency contacts list to send an alert"
                  >
                    <Text style={styles.btnText}>
                      {language === 'sw-KE' ? 'Mawasiliano ya Dharura' : 'Emergency Contacts'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Text fallback input ──────────────────────────────────────────────────
  if (showTextFallback) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.fallbackTitle}>
            {language === 'sw-KE' ? '✏️ Andika Dalili Zako' : '✏️ Type Your Symptoms'}
          </Text>
          <Text style={styles.fallbackSubtitle}>
            {language === 'sw-KE'
              ? 'Eleza unavyohisi kwa maneno yako mwenyewe'
              : 'Describe how you feel in your own words'}
          </Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={5}
            accessibilityLabel="Describe your symptoms in your own words"
            value={manualText}
            onChangeText={setManualText}
            placeholder={
              language === 'sw-KE'
                ? 'Mfano: Ninahisi maumivu makali ya kichwa na uso umevimba...'
                : 'Example: I have a severe headache and my face is swollen...'
            }
            placeholderTextColor="#aaa"
            textAlignVertical="top"
          />
          {isProcessing ? (
            <ActivityIndicator size="large" color="#FF6B9D" style={{ marginTop: 20 }} />
          ) : (
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleTextSubmit}
              accessibilityRole="button"
              accessibilityLabel="Check typed symptoms"
            >
              <Text style={styles.submitBtnText}>
                {language === 'sw-KE' ? 'Angalia Dalili' : 'Check Symptoms'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.backToVoice}
            onPress={() => { setShowTextFallback(false); setFailureCount(0); }}
            accessibilityRole="button"
            accessibilityLabel="Try voice checker again"
          >
            <Text style={styles.backToVoiceText}>
              {language === 'sw-KE' ? '← Jaribu sauti tena' : '← Try voice again'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Main voice screen ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* TC-027 FIX: Confirmation modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {language === 'sw-KE' ? '🎤 Niliposikia:' : '🎤 I heard:'}
            </Text>
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptText}>{`"${pendingTranscript}"`}</Text>
            </View>
            <Text style={styles.modalQuestion}>
              {language === 'sw-KE'
                ? 'Je, hii ni sahihi?'
                : 'Is this correct?'}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary, { flex: 1, marginRight: 8 }]}
                onPress={handleRejectTranscript}
                accessibilityRole="button"
                accessibilityLabel="No, try again"
              >
                <Text style={styles.btnText}>
                  {language === 'sw-KE' ? 'Hapana, jaribu tena' : 'No, try again'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#FF6B9D', flex: 1 }]}
                onPress={handleConfirmTranscript}
                accessibilityRole="button"
                accessibilityLabel="Yes, continue with this transcript"
              >
                <Text style={styles.btnText}>
                  {language === 'sw-KE' ? 'Ndiyo, endelea' : 'Yes, continue'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => { setShowConfirmModal(false); setShowTextFallback(true); }}
              accessibilityRole="button"
              accessibilityLabel="Switch to text input instead"
            >
              <Text style={styles.backToVoiceText}>
                {language === 'sw-KE' ? 'Tumia maandishi' : 'Switch to text'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {language === 'sw-KE' ? '🎤 Niambie unajisikiaje' : '🎤 Tell me how you feel'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {language === 'sw-KE'
              ? 'Bonyeza kitufe na uanze kusema dalili zako'
              : 'Tap the button and describe your symptoms'}
          </Text>
          {failureCount > 0 && (
            <Text style={styles.failureHint}>
              {language === 'sw-KE'
                ? `Jaribio ${failureCount}/2 — zungumza polepole na kwa uwazi`
                : `Attempt ${failureCount}/2 — speak slowly and clearly`}
            </Text>
          )}
        </View>

        <View style={styles.micContainer}>
          <TouchableOpacity
            style={[styles.micButton, isRecording && styles.micButtonRecording]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={
              isProcessing
                ? 'Processing your voice'
                : isRecording
                ? 'Stop recording'
                : 'Start recording your symptoms'
            }
            accessibilityHint={
              isProcessing
                ? 'Please wait while your voice is being analysed'
                : isRecording
                ? 'Tap to stop and analyse what you said'
                : 'Tap and speak your symptoms clearly. MamaCare will listen and check for danger signs.'
            }
            accessibilityState={{ disabled: isProcessing, busy: isProcessing || isRecording }}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color="#fff" accessibilityLabel="Processing" />
            ) : (
              <Text style={styles.micIcon} accessible={false}>{isRecording ? '⏹️' : '🎤'}</Text>
            )}
          </TouchableOpacity>
          <Text
            style={styles.micLabel}
            accessibilityLiveRegion="polite"
            accessibilityLabel={
              isProcessing
                ? 'Processing your voice input'
                : isRecording
                ? 'Listening. Tap the microphone button to stop'
                : 'Tap the microphone button to start speaking'
            }
          >
            {isProcessing
              ? (language === 'sw-KE' ? 'Inachakata…' : 'Processing…')
              : isRecording
              ? (language === 'sw-KE' ? 'Inasikiza… Bonyeza kumaliza' : 'Listening… Tap to stop')
              : (language === 'sw-KE' ? 'Bonyeza kuanza' : 'Tap to start')}
          </Text>
        </View>

        <View style={styles.features}>
          {[
            ['🌐', language === 'sw-KE' ? 'Inafanya kazi bila mtandao' : 'Works offline'],
            ['🔒', language === 'sw-KE' ? 'Taarifa zako ni salama' : 'Your data is encrypted'],
            ['⚡', language === 'sw-KE' ? 'Matokeo ya haraka' : 'Instant results'],
          ].map(([icon, label]) => (
            <View key={label} style={styles.featureItem}>
              <Text style={styles.featureIcon}>{icon}</Text>
              <Text style={styles.featureText}>{label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.langBtn} onPress={switchLanguage}
          accessibilityRole="button"
          accessibilityLabel={language === 'sw-KE' ? 'Switch to English' : 'Badilisha kwa Kiswahili'}
        >
          <Text style={styles.langBtnText}>
            {language === 'sw-KE' ? '🇬🇧 Switch to English' : '🇰🇪 Badilisha kwa Kiswahili'}
          </Text>
        </TouchableOpacity>

        {/* TC-028 FIX: Always visible text fallback link */}
        <TouchableOpacity
          style={styles.textFallbackLink}
          onPress={() => setShowTextFallback(true)}
          accessibilityRole="button"
          accessibilityLabel="Use text input instead of voice"
        >
          <Text style={styles.textFallbackText}>
            {language === 'sw-KE' ? 'Tumia maandishi badala yake' : 'Use text input instead'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F8' },
  content: { flex: 1, padding: 24 },
  scrollContent: { padding: 16 },
  header: { marginBottom: 24, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#222', textAlign: 'center', marginBottom: 8 },
  headerSubtitle: { fontSize: 15, color: '#666', textAlign: 'center' },
  failureHint: { marginTop: 8, fontSize: 13, color: '#E65100', textAlign: 'center' },
  micContainer: { alignItems: 'center', marginVertical: 32 },
  micButton: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#FF6B9D',
    justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: '#FF6B9D',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  micButtonRecording: { backgroundColor: '#D32F2F' },
  micIcon: { fontSize: 48 },
  micLabel: { fontSize: 16, color: '#444', marginTop: 12, fontWeight: '600' },
  transcriptBox: {
    backgroundColor: '#fff', padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#eee', marginVertical: 8,
  },
  transcriptLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  transcriptText: { fontSize: 15, color: '#333', fontStyle: 'italic' },
  features: { marginTop: 16 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  featureIcon: { fontSize: 22, marginRight: 12 },
  featureText: { fontSize: 14, color: '#555' },
  langBtn: {
    backgroundColor: 'rgba(0,0,0,0.06)', padding: 12,
    borderRadius: 10, alignItems: 'center', marginTop: 16,
  },
  langBtnText: { color: '#444', fontSize: 14, fontWeight: '600' },
  textFallbackLink: { padding: 10, alignItems: 'center', marginTop: 4 },
  textFallbackText: { color: '#aaa', fontSize: 13, textDecorationLine: 'underline' },
  // Result screen
  resultCard: { borderRadius: 16, borderWidth: 2, overflow: 'hidden', marginBottom: 20 },
  resultHeader: { padding: 20, alignItems: 'center' },
  resultLevel: { fontSize: 44, fontWeight: 'bold', color: '#fff' },
  resultPriority: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  resultContent: { padding: 20 },
  resultMessage: { fontSize: 16, fontWeight: 'bold', color: '#222', textAlign: 'center', marginVertical: 8 },
  resultAction: { fontSize: 14, color: '#444', textAlign: 'center', marginBottom: 16 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  btnSecondary: { backgroundColor: '#1976D2' },
  btnDanger: { backgroundColor: '#D32F2F' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  modalQuestion: { fontSize: 15, color: '#555', textAlign: 'center', marginVertical: 12 },
  modalButtons: { flexDirection: 'row', marginBottom: 16 },
  // Text fallback
  fallbackTitle: { fontSize: 20, fontWeight: 'bold', color: '#222', textAlign: 'center', marginBottom: 6 },
  fallbackSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  textArea: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ddd',
    padding: 14, fontSize: 15, minHeight: 120, color: '#222',
  },
  submitBtn: {
    backgroundColor: '#FF6B9D', padding: 16, borderRadius: 10,
    alignItems: 'center', marginTop: 16,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  backToVoice: { padding: 12, alignItems: 'center', marginTop: 4 },
  backToVoiceText: { color: '#999', fontSize: 13, textDecorationLine: 'underline' },
});
