// Короткий гид первого запуска — 3 подсказки, пропускается одним тапом (дизайн-ТЗ 6.3)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { spacing, type Theme, useStyles } from '../theme';

const GUIDE_KEY = 'pp_guide_done';
const STEPS = ['onboarding.guide1', 'onboarding.guide2', 'onboarding.guide3'] as const;

export function Guide() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(GUIDE_KEY).then((done) => {
      if (!done) setVisible(true);
    });
  }, []);

  if (!visible) return null;

  const last = step === STEPS.length - 1;
  const next = () => {
    if (last) {
      setVisible(false);
      void AsyncStorage.setItem(GUIDE_KEY, '1');
    } else {
      setStep(step + 1);
    }
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.text}>{t(STEPS[step])}</Text>
        <Pressable onPress={next} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonText}>
            {last ? t('onboarding.guideDone') : t('onboarding.guideNext')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    padding: spacing.screen,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.borderBright,
    borderRadius: th.radius.card,
    padding: spacing.xl,
    gap: spacing.l,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: th.border },
  dotActive: { backgroundColor: th.brand, width: 18 },
  text: { fontFamily: th.font.medium, fontSize: 15, color: th.text, lineHeight: 22 },
  button: { alignSelf: 'flex-end', paddingVertical: spacing.s, paddingHorizontal: spacing.m },
  buttonText: { fontFamily: th.font.semibold, fontSize: 15, color: th.brandOn },
});
