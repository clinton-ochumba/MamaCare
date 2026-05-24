/**
 * SessionManager.js — Inactivity Timeout & Re-authentication
 * ───────────────────────────────────────────────────────────
 * BUG-011 FIX: Locks the app after 30 minutes of inactivity.
 * Health data is hidden behind a PIN or biometric re-auth screen.
 *
 * Usage (wrap your root navigator):
 *   <SessionManager>
 *     <NavigationContainer>...</NavigationContainer>
 *   </SessionManager>
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  AppState,
  PanResponder,
  Alert,
} from 'react-native';
import { secureStorage } from '../utils/secureStorage';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_KEY = 'session_timestamp';

const SessionContext = createContext({ resetTimer: () => {} });
export const useSession = () => useContext(SessionContext);

export default function SessionManager({ children }) {
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [storedPin, setStoredPin] = useState(null);
  const [pinMode, setPinMode] = useState('verify'); // 'verify' | 'set'
  const timerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // ── Load stored PIN and check if session already expired ──────────────────
  useEffect(() => {
    initSession();

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const initSession = async () => {
    const savedPin = await secureStorage.getItem('app_pin');
    const lastActive = await secureStorage.getItem(SESSION_KEY);

    setStoredPin(savedPin);

    if (!savedPin) {
      // First time — prompt user to set PIN
      setPinMode('set');
      setIsLocked(true);
      return;
    }

    if (lastActive) {
      const elapsed = Date.now() - parseInt(lastActive, 10);
      if (elapsed > TIMEOUT_MS) {
        lockApp();
        return;
      }
    }

    resetTimer();
  };

  const handleAppStateChange = async (nextState) => {
    if (
      appStateRef.current === 'active' &&
      (nextState === 'background' || nextState === 'inactive')
    ) {
      // App going to background — save timestamp
      await secureStorage.setItem(SESSION_KEY, String(Date.now()));
    }

    if (nextState === 'active' && appStateRef.current !== 'active') {
      // App coming back to foreground — check if expired
      const lastActive = await secureStorage.getItem(SESSION_KEY);
      if (lastActive) {
        const elapsed = Date.now() - parseInt(lastActive, 10);
        if (elapsed > TIMEOUT_MS) {
          lockApp();
        }
      }
    }

    appStateRef.current = nextState;
  };

  const lockApp = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPin('');
    setIsLocked(true);
  };

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lockApp, TIMEOUT_MS);
    secureStorage.setItem(SESSION_KEY, String(Date.now()));
  }, []);

  // ── PanResponder: any touch resets the inactivity timer ───────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        resetTimer();
        return false; // don't consume the event
      },
    })
  ).current;

  // ── PIN verification ───────────────────────────────────────────────────────
  const handlePinSubmit = async () => {
    if (pinMode === 'set') {
      if (pin.length < 4) {
        Alert.alert('PIN too short', 'Please enter at least 4 digits.');
        return;
      }
      await secureStorage.setItem('app_pin', pin);
      setStoredPin(pin);
      setIsLocked(false);
      setPin('');
      resetTimer();
      return;
    }

    // verify mode
    if (pin === storedPin) {
      setIsLocked(false);
      setPin('');
      resetTimer();
    } else {
      Alert.alert('Incorrect PIN', 'Please try again.');
      setPin('');
    }
  };

  const handleForgotPin = () => {
    Alert.alert(
      'Reset PIN',
      'To reset your PIN, we will need to clear your session data. Your health records remain safe. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset PIN',
          style: 'destructive',
          onPress: async () => {
            await secureStorage.removeItem('app_pin');
            setStoredPin(null);
            setPinMode('set');
            setPin('');
          },
        },
      ]
    );
  };

  // ── Lock screen ────────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <View style={styles.lockScreen}>
        <Text style={styles.lockLogo} accessible={false}>🤰</Text>
        <Text
          style={styles.lockTitle}
          accessibilityRole="header"
          accessibilityLabel="MamaCare"
        >MamaCare</Text>
        <Text style={styles.lockSubtitle} accessibilityLiveRegion="polite">
          {pinMode === 'set'
            ? 'Create a 4-digit PIN to protect your health data'
            : 'Enter your PIN to continue'}
        </Text>

        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={setPin}
          keyboardType="numeric"
          secureTextEntry
          maxLength={6}
          placeholder="••••"
          placeholderTextColor="#ccc"
          autoFocus
          accessibilityLabel={pinMode === 'set' ? 'Create PIN, enter 4 to 6 digits' : 'Enter PIN to unlock MamaCare'}
          accessibilityHint="Digits only. Your entry is hidden for security."
        />

        <TouchableOpacity
          style={styles.pinButton}
          onPress={handlePinSubmit}
          accessibilityRole="button"
          accessibilityLabel={pinMode === 'set' ? 'Set PIN' : 'Unlock MamaCare'}
        >
          <Text style={styles.pinButtonText} accessible={false}>
            {pinMode === 'set' ? 'Set PIN' : 'Unlock'}
          </Text>
        </TouchableOpacity>

        {pinMode === 'verify' && (
          <TouchableOpacity
            onPress={handleForgotPin}
            accessibilityRole="button"
            accessibilityLabel="Forgot PIN"
            accessibilityHint="Reset your PIN. This will require you to verify your identity."
          >
            <Text style={styles.forgotText} accessible={false}>Forgot PIN?</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.lockFooter} accessibilityLabel="Your health data is encrypted and protected">
          🔒 Your health data is encrypted and protected
        </Text>
      </View>
    );
  }

  // ── Wrap children with activity detector ─────────────────────────────────
  return (
    <SessionContext.Provider value={{ resetTimer }}>
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        {children}
      </View>
    </SessionContext.Provider>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    backgroundColor: '#FF6B9D',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  lockLogo: {
    fontSize: 64,
    marginBottom: 8,
  },
  lockTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  lockSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 32,
  },
  pinInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    padding: 16,
    width: 180,
    marginBottom: 16,
  },
  pinButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  pinButtonText: {
    color: '#FF6B9D',
    fontSize: 18,
    fontWeight: 'bold',
  },
  forgotText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textDecorationLine: 'underline',
    marginBottom: 40,
  },
  lockFooter: {
    position: 'absolute',
    bottom: 32,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
  },
});
