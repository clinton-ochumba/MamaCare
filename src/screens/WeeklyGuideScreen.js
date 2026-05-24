/**
 * WeeklyGuideScreen.js
 * ─────────────────────
 * Week-by-week pregnancy guide showing baby development, body changes,
 * nutrition tips, and warning signs to watch for — each week.
 *
 * Receives optional { week: number } route param from HomeScreen.
 * Falls back to calculating gestational age from stored LMP.
 *
 * Content sourced from WHO antenatal care guidelines and UNFPA
 * Kenya maternal health resources.
 *
 * Path: src/screens/WeeklyGuideScreen.js
 */

import React, { useState, useEffect } from 'react';
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
import { calculateGestationalAge } from '../utils/dateCalculations';
import { t } from '../utils/languages';

// ─── Weekly content data ───────────────────────────────────────────────────────
// Covers weeks 4–42. Keys are week numbers.
const WEEKLY_CONTENT = {
  4:  { babySize: 'Poppy seed', babyMm: 1,  emoji: '🌱',
        baby:    'The embryo has just implanted in your uterus. The neural tube — which becomes the brain and spine — is already forming.',
        body:    'You may notice tender breasts and mild cramping. A home pregnancy test will now show positive.',
        tip:     'Start taking folic acid (400mcg daily) if you have not already. Avoid alcohol and smoking.',
        warning: 'Seek care if you have heavy bleeding or severe one-sided pain (ectopic warning).' },
  5:  { babySize: 'Apple seed', babyMm: 5,  emoji: '🍎',
        baby:    'The heart begins to beat. The embryo has three distinct layers that will become all organs and tissues.',
        body:    'Nausea and fatigue often begin this week. Frequent urination is normal as your blood volume increases.',
        tip:     'Eat small, frequent meals to manage nausea. Ginger tea or crackers before getting up can help.',
        warning: 'Heavy bleeding with cramping should be evaluated immediately.' },
  6:  { babySize: 'Sweet pea', babyMm: 8,  emoji: '🫛',
        baby:    'Tiny arm and leg buds appear. The facial features — eyes, nose, mouth — are beginning to form.',
        body:    'Morning sickness may peak now. Many women experience heightened sense of smell.',
        tip:     'Stay hydrated. If vomiting is severe and you cannot keep fluids down, contact your health worker.',
        warning: 'Persistent vomiting with inability to keep down fluids (hyperemesis) requires medical care.' },
  8:  { babySize: 'Raspberry', babyMm: 18, emoji: '🫐',
        baby:    'All major organs are now forming. Fingers and toes are visible. Baby moves, though you cannot feel it yet.',
        body:    'Your uterus is the size of an orange. You may notice clothes feeling tighter at the waist.',
        tip:     'Book your first antenatal visit if you have not done so. First ultrasound is usually offered at 8–12 weeks.',
        warning: 'Report any bright red bleeding, severe abdominal pain, or fever to your midwife.' },
  10: { babySize: 'Strawberry', babyMm: 35, emoji: '🍓',
        baby:    'All vital organs are formed and starting to work together. The embryo is now officially called a fetus.',
        body:    'Nausea often begins to ease. Energy levels may improve slightly.',
        tip:     'Schedule your nuchal translucency scan (10–14 weeks). Eat iron-rich foods: beans, leafy greens, meat.',
        warning: 'Bleeding from the vagina at any time needs immediate assessment.' },
  12: { babySize: 'Lime', babyMm: 60, emoji: '🍈',
        baby:    'Baby can open and close fingers, curl toes, and make sucking movements. Kidneys are producing urine.',
        body:    'End of the first trimester — risk of miscarriage drops significantly. Your uterus may start to show.',
        tip:     'End of highest-risk period. Attend your first antenatal visit if not yet done.',
        warning: 'Swelling of face or hands, severe headache, or visual changes need urgent assessment.' },
  16: { babySize: 'Avocado', babyMm: 116, emoji: '🥑',
        baby:    'Baby can make facial expressions. Eyebrows, eyelashes, and fine hair are growing. Can suck their thumb.',
        body:    'Many women feel more energetic. You may feel the first fluttery movements (quickening) — like butterflies.',
        tip:     'Iron supplementation is important now — eat beans, liver (avoid in excess), spinach, and fortified cereals.',
        warning: 'If you have not felt movement by week 20, tell your midwife.' },
  20: { babySize: 'Banana', babyMm: 250, emoji: '🍌',
        baby:    'Baby is now 20 cm long. You are halfway there! Baby can hear sounds and may respond to your voice.',
        body:    'Your belly is clearly visible. The top of your uterus (fundus) reaches your belly button. Back pain is common.',
        tip:     'Sleep on your left side to improve blood flow to the baby. Use a pillow between your knees for comfort.',
        warning: 'Reduced or no fetal movement for 24+ hours requires immediate assessment.' },
  24: { babySize: 'Corn cob', babyMm: 300, emoji: '🌽',
        baby:    'Lungs are developing rapidly but not yet mature. Baby has a regular sleep/wake cycle and responds to sound.',
        body:    'Braxton Hicks contractions (practice contractions) may begin — irregular and painless. This is normal.',
        tip:     'Attend your glucose test if offered (24–28 weeks) — screens for gestational diabetes.',
        warning: 'Regular or painful contractions before week 37 may indicate preterm labour — go to a facility immediately.' },
  28: { babySize: 'Large eggplant', babyMm: 370, emoji: '🍆',
        baby:    'Baby can open and close eyes, and has a strong grasp. Brain development is rapid. Fat is accumulating.',
        body:    'Third trimester begins. Heartburn, breathlessness, and swollen ankles become more common.',
        tip:     'Begin counting fetal movements daily. Baby should move at least 10 times in 2 hours during active periods.',
        warning: 'Severe swelling of face, hands, or sudden weight gain with headache: seek care immediately (pre-eclampsia).' },
  32: { babySize: 'Squash', babyMm: 420, emoji: '🎃',
        baby:    'Baby is practising breathing movements. Bones are hardening. Baby is head-down in most cases by now.',
        body:    'Shortness of breath is common as the uterus pushes on your diaphragm. Sleep may be difficult.',
        tip:     'Prepare your birth plan. Decide who will accompany you and how you will get to the health facility.',
        warning: 'Leaking fluid (waters breaking) before 37 weeks requires immediate hospital attendance.' },
  36: { babySize: 'Head of lettuce', babyMm: 470, emoji: '🥬',
        baby:    'Baby is considered "early term" at 36 weeks. Lungs are nearly mature. Baby may drop into the pelvis.',
        body:    'Breathing becomes easier as baby drops. Pelvic pressure and frequent urination increase.',
        tip:     'Pack your hospital bag now: ID, maternity card, clothing, towels, baby clothes, sanitary pads.',
        warning: 'No fetal movement for 2+ hours, water breaking, or regular contractions — go to hospital now.' },
  38: { babySize: 'Watermelon', babyMm: 500, emoji: '🍉',
        baby:    'Baby is full term. All organs are ready for life outside the womb. Baby is gaining about 30g per day.',
        body:    'You may lose the mucus plug (bloody show) — a sign labour is approaching. Contractions may become irregular.',
        tip:     'Rest as much as possible. Eat light, nutritious meals. Stay close to your facility.',
        warning: 'Any bleeding beyond a bloody show, no fetal movement, severe headache — go to hospital immediately.' },
  40: { babySize: 'Pumpkin', babyMm: 510, emoji: '🎃',
        baby:    'Your due date has arrived! Baby weighs approximately 3–4kg and is ready to meet you.',
        body:    'Labour can begin any time now. Early signs include irregular contractions, back pain, and a mucous show.',
        tip:     'Contractions every 5 minutes lasting 1 minute for 1 hour = time to go to the facility.',
        warning: 'Convulsions, heavy bleeding, no fetal movement, or difficulty breathing: call 999 immediately.' },
  41: { babySize: 'Jackfruit', babyMm: 515, emoji: '🍈',
        baby:    'Post-dates pregnancy. Baby continues to gain weight and shed vernix. The placenta begins to age.',
        body:    'You are likely feeling very tired and uncomfortable. Your midwife will monitor you and baby closely.',
        tip:     'Attend all monitoring appointments. Your team may discuss induction to protect you and baby.',
        warning: 'Reduced fetal movement at this stage requires same-day assessment.' },
};

/**
 * Returns the nearest available week entry (rounds down, then up).
 */
function getWeekContent(week) {
  if (WEEKLY_CONTENT[week]) return { ...WEEKLY_CONTENT[week], week };

  const keys = Object.keys(WEEKLY_CONTENT).map(Number).sort((a, b) => a - b);

  // Find nearest lower key
  const lower = [...keys].reverse().find((k) => k <= week);
  if (lower) return { ...WEEKLY_CONTENT[lower], week };

  // Fall back to week 4
  return { ...WEEKLY_CONTENT[4], week: 4 };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WeeklyGuideScreen({ navigation, route }) {
  const [content, setContent] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [language, setLanguage] = useState('en-KE');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const profile = await storage.getProfile();
      const lang = profile?.preferredLanguage || 'en-KE';
      setLanguage(lang);

      // Week can come from route params (HomeScreen) or calculated from LMP
      let week = route?.params?.week;
      if (!week && profile?.lmpDate) {
        const age = calculateGestationalAge(profile.lmpDate);
        week = age?.weeks ?? 1;
      }
      week = Math.max(4, Math.min(42, week || 12));
      setCurrentWeek(week);
      setContent(getWeekContent(week));
    } catch (_) {
      console.warn('[WeeklyGuideScreen] Failed to load content');
      setContent(getWeekContent(12));
      setCurrentWeek(12);
    } finally {
      setLoading(false);
    }
  };

  const navigateWeek = (delta) => {
    const newWeek = Math.max(4, Math.min(42, currentWeek + delta));
    setCurrentWeek(newWeek);
    setContent(getWeekContent(newWeek));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B9D" />
      </View>
    );
  }

  if (!content) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Week navigator */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          accessibilityHint={currentWeek > 1 ? `Go to week ${currentWeek - 1}` : 'Already at earliest week'}
          accessibilityState={{ disabled: currentWeek <= 1 }}
          onPress={() => navigateWeek(-1)}
          style={[styles.navBtn, currentWeek <= 1 && styles.navBtnDisabled]}
          disabled={currentWeek <= 1}
        >
          <Text style={styles.navBtnText} accessible={false}>←</Text>
        </TouchableOpacity>

        <View style={styles.weekCenter}>
          <Text style={styles.weekEmoji}>{content.emoji}</Text>
          <Text style={styles.weekTitle} accessibilityRole="header">Week {currentWeek}</Text>
          <Text style={styles.weekBabySize}>
            Baby size: {content.babySize}
            {content.babyMm ? ` (~${content.babyMm < 10 ? content.babyMm + 'mm' : Math.round(content.babyMm / 10) + 'cm'})` : ''}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Next week"
          accessibilityHint={currentWeek < 42 ? `Go to week ${currentWeek + 1}` : 'Already at latest week'}
          accessibilityState={{ disabled: currentWeek >= 42 }}
          onPress={() => navigateWeek(1)}
          style={[styles.navBtn, currentWeek >= 42 && styles.navBtnDisabled]}
          disabled={currentWeek >= 42}
        >
          <Text style={styles.navBtnText} accessible={false}>→</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Baby development */}
        <View style={[styles.card, { borderLeftColor: '#FF6B9D' }]}>
          <Text style={styles.cardHeader}>👶 Baby this week</Text>
          <Text style={styles.cardText}>{content.baby}</Text>
        </View>

        {/* Your body */}
        <View style={[styles.card, { borderLeftColor: '#9C27B0' }]}>
          <Text style={styles.cardHeader}>🤰 Your body</Text>
          <Text style={styles.cardText}>{content.body}</Text>
        </View>

        {/* Nutrition & wellness tip */}
        <View style={[styles.card, { borderLeftColor: '#4CAF50' }]}>
          <Text style={styles.cardHeader}>🥗 Health tip</Text>
          <Text style={styles.cardText}>{content.tip}</Text>
        </View>

        {/* Warning signs */}
        <View style={[styles.card, styles.warningCard]}>
          <Text style={[styles.cardHeader, { color: '#C62828' }]}>⚠️ Warning signs</Text>
          <Text style={[styles.cardText, { color: '#7f1c1c' }]}>{content.warning}</Text>
        </View>

        {/* Emergency CTA */}
        <TouchableOpacity
          style={styles.emergencyBtn}
          onPress={() => navigation.navigate('SymptomChecker')}
          accessibilityRole="button"
          accessibilityLabel="Check warning symptoms now"
          accessibilityHint="Opens the symptom checker"
        >
          <Text style={styles.emergencyBtnText}>
            🚨 Experiencing any symptoms? Check now
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F8' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B9D',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  navBtn: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.35 },
  navBtnText: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
  weekCenter: { flex: 1, alignItems: 'center' },
  weekEmoji: { fontSize: 36 },
  weekTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 4 },
  weekBabySize: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  warningCard: {
    backgroundColor: '#FFF3E0',
    borderLeftColor: '#E53935',
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },

  emergencyBtn: {
    backgroundColor: '#D32F2F',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  emergencyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
