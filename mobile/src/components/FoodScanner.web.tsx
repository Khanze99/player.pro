// Веб-вариант сканера штрихкода. В браузере (и в PWA на iOS) надёжного доступа к
// сканеру нет: BarcodeDetector в Safari отсутствует, доступ к камере в standalone
// нестабилен. Даём ручной ввод кода — дальше тот же lookup, что и по камере.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLookupBarcode } from '@/api/hooks';
import type { FoodItem } from '@/api/types';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { spacing, type Theme, useStyles } from '@/theme';

export function FoodScanner({ onFound }: { onFound: (item: FoodItem) => void }) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const lookup = useLookupBarcode();
  const toast = useToast((s) => s.show);
  const [code, setCode] = useState('');

  const submit = () => {
    const value = code.trim();
    if (value.length < 6) return;
    lookup.mutate(value, {
      onSuccess: onFound,
      onError: () => toast(t('nutrition.barcodeNotFound')),
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardHint}>{t('nutrition.barcodeManualHint')}</Text>
      <Field
        label={t('nutrition.barcodeLabel')}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        placeholder="4600000000000"
      />
      <Button
        title={t('nutrition.barcodeLookup')}
        onPress={submit}
        loading={lookup.isPending}
      />
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: th.surface,
      borderWidth: 1,
      borderColor: th.border,
      borderRadius: th.radius.card,
      padding: spacing.l,
      gap: spacing.m,
    },
    cardHint: { fontFamily: th.font.regular, fontSize: 12, color: th.textMuted },
  });
