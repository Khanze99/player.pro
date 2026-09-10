// Сканер штрихкода для дневника питания (нативный). Камера шлёт кадры непрерывно,
// поэтому повторный запрос по тому же коду отсекается. Веб-вариант —
// FoodScanner.web.tsx: в браузере надёжного доступа к сканеру нет, там ручной ввод.

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLookupBarcode } from '@/api/hooks';
import type { FoodItem } from '@/api/types';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { spacing, type Theme, useStyles } from '@/theme';

export function FoodScanner({ onFound }: { onFound: (item: FoodItem) => void }) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useLookupBarcode();
  const toast = useToast((s) => s.show);
  const [scanned, setScanned] = useState<string | null>(null);

  if (!permission) return <Text style={styles.cardHint}>{t('common.loading')}</Text>;

  if (!permission.granted) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardHint}>{t('nutrition.cameraNeeded')}</Text>
        <Button title={t('nutrition.allowCamera')} onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.scannerWrap}>
      <CameraView
        style={styles.scanner}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={({ data }) => {
          if (data === scanned || lookup.isPending) return;
          setScanned(data);
          lookup.mutate(data, {
            onSuccess: onFound,
            onError: () => {
              toast(t('nutrition.barcodeNotFound'));
              setScanned(null);
            },
          });
        }}
      />
      <Text style={styles.scannerHint}>{t('nutrition.scanHint')}</Text>
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
    scannerWrap: { gap: spacing.m },
    scanner: { height: 280, borderRadius: th.radius.card, overflow: 'hidden' },
    scannerHint: {
      fontFamily: th.font.regular,
      fontSize: 12,
      color: th.textMuted,
      textAlign: 'center',
    },
  });
