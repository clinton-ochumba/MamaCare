/**
 * App_Enhanced.js — PRODUCTION FIXED
 * ────────────────────────────────────
 * BUG-001 FIX: DocumentViewer added to Stack.Navigator
 * BUG-011 FIX: Wrapped with SessionManager for 30-min inactivity lock
 * BUG-012 FIX: SettingsScreen added to navigator
 *
 * Path: App.js (root)
 */

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { secureStorage } from './src/utils/secureStorage';
import SessionManager from './src/components/SessionManager';

// ── Screens ──────────────────────────────────────────────────────────────────
import OnboardingScreen       from './src/screens/OnboardingScreenEnhanced';
import ConsentScreen          from './src/screens/ConsentScreen';
import HomeScreen             from './src/screens/HomeScreen_Enhanced';
import WeeklyGuideScreen      from './src/screens/WeeklyGuideScreen';
import SymptomCheckerScreen   from './src/screens/SymptomCheckerScreen';
import VoiceSymptomCheckerScreen from './src/screens/VoiceSymptomCheckerScreen';
import ProfileScreen          from './src/screens/ProfileScreen';
import EmergencyContactsScreen from './src/screens/EmergencyContactsScreen';
import DocumentViewer         from './src/screens/DocumentViewer';   // BUG-001 FIX
import SettingsScreen         from './src/screens/SettingsScreen';   // BUG-012 FIX

const Stack = createStackNavigator();

// Shared header theme
const SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: '#FF6B9D' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: 'bold' },
};

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null); // null = loading

  useEffect(() => {
    determineInitialRoute();
  }, []);

  const determineInitialRoute = async () => {
    try {
      const launched = await secureStorage.getItem('alreadyLaunched');
      const consents = await secureStorage.getItem('user_consents');

      if (!launched) {
        // First ever launch
        await secureStorage.setItem('alreadyLaunched', 'true');
        setInitialRoute('Onboarding');
      } else if (!consents) {
        // Launched before but consent not completed
        setInitialRoute('Consent');
      } else {
        setInitialRoute('Home');
      }
    } catch (_) {
      setInitialRoute('Onboarding');
    }
  };

  if (initialRoute === null) {
    // Loading — SessionManager will show the splash
    return null;
  }

  return (
    // BUG-011 FIX: SessionManager wraps entire app
    <SessionManager>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={SCREEN_OPTIONS}
        >
          {/* Onboarding flow */}
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Consent"
            component={ConsentScreen}
            options={{ title: 'Privacy & Consent', headerLeft: () => null }}
          />

          {/* BUG-001 FIX: DocumentViewer now registered in navigator */}
          <Stack.Screen
            name="DocumentViewer"
            component={DocumentViewer}
            options={({ route }) => ({
              title: route.params?.docType === 'privacy'
                ? 'Privacy Policy'
                : route.params?.docType === 'disclaimer'
                ? 'Medical Disclaimer'
                : 'Terms of Service',
            })}
          />

          {/* Main app screens */}
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{
              title: 'MamaCare 🤰',
              headerLeft: () => null, // No back button on home
            }}
          />
          <Stack.Screen
            name="WeeklyGuide"
            component={WeeklyGuideScreen}
            options={{ title: 'Weekly Guide' }}
          />
          <Stack.Screen
            name="SymptomChecker"
            component={SymptomCheckerScreen}
            options={{ title: 'Symptom Checker' }}
          />
          <Stack.Screen
            name="VoiceSymptomChecker"
            component={VoiceSymptomCheckerScreen}
            options={{ title: 'Voice Checker 🎤' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: 'My Profile' }}
          />
          <Stack.Screen
            name="EmergencyContacts"
            component={EmergencyContactsScreen}
            options={{ title: 'Emergency Contacts' }}
          />

          {/* BUG-012 FIX: Settings screen with delete/export */}
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings & Privacy' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionManager>
  );
}
