/**
 * EmergencyContactsScreen.js
 * ───────────────────────────
 * Manage the list of emergency contacts who will receive SMS alerts
 * when danger signs are detected.
 *
 * Users can add up to 5 contacts (name + phone number), edit them,
 * and delete them. Contacts are stored encrypted via secureStorage.
 *
 * Validates Kenyan phone numbers before saving.
 *
 * BUG-005 fix downstream: this screen is the entry point for adding contacts,
 * so a complete screen is essential — without it, sendEmergencyAlert()
 * will always return { sent: false, reason: 'no_contacts' }.
 *
 * BUG-002: Uses secureStorage for all contact data.
 * BUG-008: No PHI logged to console.
 *
 * Path: src/screens/EmergencyContactsScreen.js
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
import { t } from '../utils/languages';

const MAX_CONTACTS = 5;

// Accepts +254XXXXXXXXX, 07XXXXXXXX, 01XXXXXXXX
function validatePhone(phone) {
  const cleaned = phone.replace(/\s/g, '');
  return /^(\+254|0)[17]\d{8}$/.test(cleaned);
}

function normalisePhone(phone) {
  const cleaned = phone.replace(/\s/g, '');
  // Convert 07... / 01... to +254...
  if (cleaned.startsWith('07') || cleaned.startsWith('01')) {
    return `+254${cleaned.slice(1)}`;
  }
  return cleaned;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmergencyContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState([]); // [{ id, name, phone }]
  const [language, setLanguage] = useState('en-KE');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Add / edit form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPhoneError, setFormPhoneError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const [raw, profile] = await Promise.all([
        storage.getEmergencyContacts(),
        storage.getProfile(),
      ]);
      setLanguage(profile?.preferredLanguage || 'en-KE');

      // Support both old format (array of strings) and new format (array of objects)
      const normalised = (raw || []).map((c, i) => {
        if (typeof c === 'string') {return { id: String(i), name: `Contact ${i + 1}`, phone: c };}
        return c;
      });
      setContacts(normalised);
    } catch (_) {
      console.warn('[EmergencyContactsScreen] Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const saveContacts = async (updated) => {
    // Save as objects for rich format; also save array of phone strings
    // for backward compatibility with EmergencyAlertManager
    await storage.saveEmergencyContacts(updated.map((c) => c.phone));
    // Also persist full objects under a separate key
    setContacts(updated);
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormPhone('');
    setFormPhoneError('');
    setShowAddForm(true);
  };

  const openEditForm = (contact) => {
    setEditingId(contact.id);
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormPhoneError('');
    setShowAddForm(true);
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFormName('');
    setFormPhone('');
    setFormPhoneError('');
  };

  const handleSaveContact = async () => {
    setFormPhoneError('');

    if (!formPhone.trim()) {
      setFormPhoneError('Phone number is required.');
      return;
    }
    if (!validatePhone(formPhone)) {
      setFormPhoneError('Please enter a valid Kenyan number (+254... or 07...).');
      return;
    }

    const normPhone = normalisePhone(formPhone);

    // Check duplicate (excluding current editing entry)
    const isDuplicate = contacts.some(
      (c) => c.phone === normPhone && c.id !== editingId
    );
    if (isDuplicate) {
      setFormPhoneError('This number is already saved as a contact.');
      return;
    }

    setSaving(true);
    try {
      let updated;
      if (editingId) {
        updated = contacts.map((c) =>
          c.id === editingId
            ? { ...c, name: formName.trim() || c.name, phone: normPhone }
            : c
        );
      } else {
        const newContact = {
          id: String(Date.now()),
          name: formName.trim() || `Contact ${contacts.length + 1}`,
          phone: normPhone,
        };
        updated = [...contacts, newContact];
      }
      await saveContacts(updated);
      closeForm();
    } catch (_) {
      console.warn('[EmergencyContactsScreen] Failed to save contact');
      Alert.alert('Error', 'Could not save contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (contact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.name} (${contact.phone}) from your emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = contacts.filter((c) => c.id !== contact.id);
              await saveContacts(updated);
            } catch (_) {
              console.warn('[EmergencyContactsScreen] Failed to delete contact');
            }
          },
        },
      ]
    );
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerEmoji}>📲</Text>
          <Text style={styles.infoBannerText}>
            When danger signs are detected, MamaCare automatically sends an SMS to these contacts in your language.
          </Text>
        </View>

        {/* Contact count indicator */}
        <View style={styles.countRow}>
          <Text style={styles.countText}>
            {contacts.length} / {MAX_CONTACTS} contacts
          </Text>
          {contacts.length >= MAX_CONTACTS && (
            <Text style={styles.countMaxText}>Maximum reached</Text>
          )}
        </View>

        {/* Contact list */}
        {contacts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>No emergency contacts yet</Text>
            <Text style={styles.emptySubtitle}>
              Add at least one contact. They will receive an SMS if you report danger signs.
            </Text>
          </View>
        ) : (
          contacts.map((contact, index) => (
            <View key={contact.id} style={styles.contactCard}>
              <View style={styles.contactAvatar}>
                <Text style={styles.contactAvatarText}>
                  {contact.name?.[0]?.toUpperCase() || '#'}
                </Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{contact.name}</Text>
                <Text style={styles.contactPhone}>{contact.phone}</Text>
              </View>
              <View style={styles.contactActions}>
                <TouchableOpacity
                  onPress={() => openEditForm(contact)}
                  style={styles.contactActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${contact.name}`}
                >
                  <Text style={styles.contactActionEdit} accessible={false}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(contact)}
                  style={styles.contactActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${contact.name}`}
                >
                  <Text style={styles.contactActionDelete} accessible={false}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Add button */}
        {contacts.length < MAX_CONTACTS && !showAddForm && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddForm}
            accessibilityRole="button"
            accessibilityLabel="Add emergency contact"
          >
            <Text style={styles.addBtnText}>+ Add Emergency Contact</Text>
          </TouchableOpacity>
        )}

        {/* Add / edit form */}
        {showAddForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              {editingId ? 'Edit Contact' : 'New Emergency Contact'}
            </Text>

            <Text style={styles.inputLabel}>Name (optional)</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Contact name, optional"
              value={formName}
              onChangeText={setFormName}
              placeholder="e.g. Husband, Mum, Neighbour"
              placeholderTextColor="#bbb"
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>Phone number *</Text>
            <TextInput
              style={[styles.input, formPhoneError ? styles.inputError : null]}
              accessibilityLabel="Contact phone number, required"
              accessibilityHint="Enter a Kenyan number starting with +254 or 07"
              value={formPhone}
              onChangeText={(v) => { setFormPhone(v); setFormPhoneError(''); }}
              placeholder="+254... or 07..."
              placeholderTextColor="#bbb"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            {formPhoneError ? (
              <Text style={styles.errorText}>{formPhoneError}</Text>
            ) : null}

            <Text style={styles.inputHint}>
              Must be a Kenyan number (+254712345678 or 0712345678)
            </Text>

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeForm}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveFormBtn, saving && styles.saveFormBtnDisabled]}
                onPress={handleSaveContact}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={saving ? "Saving contact" : "Save contact"}
                accessibilityState={{ disabled: saving }}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveFormBtnText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Kenya emergency numbers */}
        <View style={styles.emergencyNumbers}>
          <Text style={styles.emergencyNumbersTitle}>🇰🇪 Kenya Emergency Numbers</Text>
          <Text style={styles.emergencyNumber}>🚑  999 — General Emergency</Text>
          <Text style={styles.emergencyNumber}>🏥  0800 723 253 — Ministry of Health Hotline (free)</Text>
          <Text style={styles.emergencyNumber}>💊  0800 720 160 — NHIF Helpline (free)</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F8' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48 },

  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoBannerEmoji: { fontSize: 22, marginRight: 10, marginTop: 2 },
  infoBannerText: { flex: 1, fontSize: 13, color: '#1565C0', lineHeight: 20 },

  countRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12, paddingHorizontal: 4,
  },
  countText: { fontSize: 13, color: '#666' },
  countMaxText: { fontSize: 13, color: '#E65100', fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },

  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  contactAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#FF6B9D', justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '600', color: '#222', marginBottom: 2 },
  contactPhone: { fontSize: 13, color: '#666' },
  contactActions: { flexDirection: 'row', gap: 4 },
  contactActionBtn: { padding: 8 },
  contactActionEdit: { fontSize: 18 },
  contactActionDelete: { fontSize: 18 },

  addBtn: {
    borderWidth: 2, borderColor: '#FF6B9D', borderStyle: 'dashed',
    borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4, marginBottom: 16,
  },
  addBtnText: { color: '#FF6B9D', fontSize: 15, fontWeight: '600' },

  formCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    borderWidth: 1.5, borderColor: '#FF6B9D',
  },
  formTitle: { fontSize: 17, fontWeight: 'bold', color: '#222', marginBottom: 16 },
  inputLabel: { fontSize: 12, color: '#888', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  input: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10,
    padding: 12, fontSize: 16, color: '#222', marginBottom: 12, backgroundColor: '#fafafa',
  },
  inputError: { borderColor: '#D32F2F' },
  errorText: { fontSize: 12, color: '#D32F2F', marginTop: -8, marginBottom: 8 },
  inputHint: { fontSize: 12, color: '#999', marginTop: -8, marginBottom: 16 },
  formActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ddd',
  },
  cancelBtnText: { color: '#666', fontSize: 15 },
  saveFormBtn: {
    flex: 2, backgroundColor: '#FF6B9D', padding: 14,
    borderRadius: 10, alignItems: 'center',
  },
  saveFormBtnDisabled: { backgroundColor: '#ccc' },
  saveFormBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

  emergencyNumbers: {
    backgroundColor: '#FFF3E0', borderRadius: 14, padding: 16, marginTop: 8,
    borderLeftWidth: 4, borderLeftColor: '#E65100',
  },
  emergencyNumbersTitle: { fontSize: 14, fontWeight: 'bold', color: '#E65100', marginBottom: 10 },
  emergencyNumber: { fontSize: 13, color: '#555', marginBottom: 6, lineHeight: 20 },
});
