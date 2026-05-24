/**
 * DocumentViewer.js — In-App Legal Document Viewer
 * ──────────────────────────────────────────────────
 * BUG-001 FIX: This screen was missing from the navigation stack entirely,
 * causing a crash whenever any user tried to read the Terms of Service,
 * Privacy Policy, or Medical Disclaimer during consent flow.
 *
 * Renders legal documents in a WebView with a clear "Mark as Read" CTA.
 * Falls back to a static text render if WebView fails or no internet.
 *
 * Path: src/screens/DocumentViewer.js
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';

// Static fallback content for offline use
const OFFLINE_CONTENT = {
  terms: {
    title: 'Terms of Service',
    summary: `MAMACARE TERMS OF SERVICE — Summary

1. SERVICE DESCRIPTION
MamaCare provides maternal health information and symptom checking tools. It is NOT a medical service and does not replace professional healthcare.

2. NOT MEDICAL ADVICE
All information is for educational purposes only. Always consult a qualified healthcare provider for medical decisions. In emergencies, call 999 immediately.

3. USER RESPONSIBILITIES  
You agree to: provide accurate information, use the service lawfully, not share your account, and seek professional care when symptoms are serious.

4. LIMITATION OF LIABILITY
To the maximum extent permitted by Kenyan law, MamaCare's liability is limited to the amount you paid (KSh 0 for free tier). We are not liable for medical outcomes.

5. DATA & PRIVACY
Your data is handled per our Privacy Policy, which complies with Kenya's Data Protection Act 2019.

6. TERMINATION
You may delete your account anytime via Settings > Privacy > Delete Account.

7. GOVERNING LAW
These terms are governed by the laws of Kenya. Disputes are resolved via arbitration in Nairobi.

Full legal text available at: mamacare.app/terms
Last updated: February 2026 — Version 1.0`,
  },
  privacy: {
    title: 'Privacy Policy',
    summary: `MAMACARE PRIVACY POLICY — Summary

WHAT WE COLLECT
• Name, age, phone number
• Last menstrual period date
• Symptom reports and health check history
• Emergency contact numbers
• Device information and app usage

WHY WE COLLECT IT
• To provide pregnancy tracking and symptom assessment
• To send emergency alerts to your contacts
• To connect you with your Community Health Worker
• To improve the app (anonymized, with your consent)

WHO SEES YOUR DATA
• YOU: Always full access
• YOUR CHW: Pregnancy progress and alerts only
• EMERGENCY CONTACTS: Alerts when danger signs detected
• RESEARCHERS: Anonymized data only, with your consent
• NOBODY ELSE: We do not sell your data

HOW LONG WE KEEP IT
Your data is kept during your pregnancy + 2 years, then deleted. You can request deletion anytime.

YOUR RIGHTS (Kenya DPA 2019)
✓ Access your data (Settings > Export My Data)
✓ Correct inaccurate data (Edit Profile)
✓ Delete your account (Settings > Delete Account)
✓ Withdraw consent (Settings > Privacy)
✓ File a complaint: complaints@odpc.go.ke

SECURITY
All health data is encrypted at rest and in transit using AES-256.

Data Protection Officer: privacy@mamacare.app
Full policy at: mamacare.app/privacy
Last updated: February 2026 — Version 1.0`,
  },
  disclaimer: {
    title: 'Medical Disclaimer',
    summary: `MEDICAL DISCLAIMER — Please Read Carefully

⚠️ MAMACARE IS NOT A MEDICAL SERVICE

MamaCare provides health INFORMATION based on WHO guidelines. It does NOT:
• Diagnose medical conditions
• Prescribe treatment
• Replace a doctor, midwife, or nurse
• Guarantee the accuracy of assessments

ALWAYS SEEK PROFESSIONAL CARE FOR:
• Any concern about your pregnancy
• Symptoms flagged as URGENT or EMERGENCY
• Questions about medication
• Childbirth preparation

IN AN EMERGENCY — CALL 999 IMMEDIATELY
Do not wait for app results in a life-threatening situation.

SYMPTOM CHECKER LIMITATIONS
The symptom checker uses general WHO guidelines. It cannot account for your full medical history. Results are approximate guidance only.

ALGORITHM ACCURACY
Our symptom checker may occasionally:
• Underestimate severity (false negatives)
• Overestimate severity (false positives)
• Miss symptoms you did not report

Always use your own judgment and seek professional advice.

MEDICAL ADVISORY
MamaCare's health content is reviewed by licensed OB/GYNs and midwives but is not a substitute for personal clinical assessment.

Full disclaimer at: mamacare.app/disclaimer
Last updated: February 2026 — Version 1.0`,
  },
};

const DOC_URLS = {
  terms: 'https://www.mamacare.app/terms',
  privacy: 'https://www.mamacare.app/privacy',
  disclaimer: 'https://www.mamacare.app/disclaimer',
};

export default function DocumentViewer({ navigation, route }) {
  const { docType, onMarkRead } = route.params || {};
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const webViewRef = useRef(null);

  const doc = OFFLINE_CONTENT[docType] || OFFLINE_CONTENT.terms;
  const url = DOC_URLS[docType] || DOC_URLS.terms;

  const handleMarkRead = () => {
    // Call back to ConsentScreen to mark this doc as read
    if (onMarkRead) onMarkRead(docType);
    navigation.goBack();
  };

  const handleScroll = ({ nativeEvent }) => {
    if (!hasScrolledToBottom) {
      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
      const isNearBottom =
        contentOffset.y + layoutMeasurement.height >= contentSize.height - 50;
      if (isNearBottom) setHasScrolledToBottom(true);
    }
  };

  // If WebView failed or no internet, show offline fallback
  if (loadFailed) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.docHeader}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Close document and go back"
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>✕ Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineText}>
            📄 Showing offline version — connect to internet for full document
          </Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={200}
        >
          <Text style={styles.docTitle}>{doc.title}</Text>
          <Text style={styles.docBody}>{doc.summary}</Text>
          <View style={styles.spacer} />
        </ScrollView>

        <View style={styles.footer}>
          {!hasScrolledToBottom && (
            <Text style={styles.scrollHint}>↓ Scroll down to read the full document</Text>
          )}
          <TouchableOpacity
            style={[styles.markReadBtn, !hasScrolledToBottom && styles.markReadBtnDisabled]}
            onPress={hasScrolledToBottom ? handleMarkRead : null}
            disabled={!hasScrolledToBottom}
          >
            <Text style={styles.markReadText}>
              {hasScrolledToBottom ? '✓ I Have Read This Document' : 'Please scroll to read'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.docHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close document and go back"
          style={styles.closeBtn}
        >
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setLoadFailed(true);
        }}
        onHttpError={() => {
          setIsLoading(false);
          setLoadFailed(true);
        }}
        // Inject JS to detect when user has scrolled to bottom of web page
        injectedJavaScript={`
          window.addEventListener('scroll', function() {
            var scrolled = window.scrollY + window.innerHeight;
            var total = document.documentElement.scrollHeight;
            if (scrolled >= total - 100) {
              window.ReactNativeWebView.postMessage('REACHED_BOTTOM');
            }
          });
          true;
        `}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'REACHED_BOTTOM') {
            setHasScrolledToBottom(true);
          }
        }}
        style={styles.webView}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF6B9D" />
          <Text style={styles.loadingText}>Loading document…</Text>
        </View>
      )}

      <View style={styles.footer}>
        {!hasScrolledToBottom && !isLoading && (
          <Text style={styles.scrollHint}>↓ Scroll to the bottom to confirm you've read this</Text>
        )}
        <TouchableOpacity
          style={[styles.markReadBtn, !hasScrolledToBottom && styles.markReadBtnDisabled]}
          onPress={hasScrolledToBottom ? handleMarkRead : null}
          disabled={!hasScrolledToBottom}
        >
          <Text style={styles.markReadText}>
            {hasScrolledToBottom ? '✓ I Have Read This Document' : 'Please scroll to read'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  docHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  closeBtn: { padding: 8 },
  closeBtnText: { fontSize: 15, color: '#FF6B9D', fontWeight: '600' },
  webView: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  offlineNotice: {
    backgroundColor: '#FFF8E1',
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#FFE082',
  },
  offlineText: {
    color: '#F57F17',
    fontSize: 12,
    textAlign: 'center',
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  docTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 16,
    textAlign: 'center',
  },
  docBody: {
    fontSize: 13.5,
    lineHeight: 22,
    color: '#333',
    fontFamily: 'monospace',
  },
  spacer: { height: 40 },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  scrollHint: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
  },
  markReadBtn: {
    backgroundColor: '#FF6B9D',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  markReadBtnDisabled: {
    backgroundColor: '#ccc',
  },
  markReadText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
