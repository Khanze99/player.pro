// Принадлежность к команде в шапке: без плашки, на прозрачном фоне —
// название слева, герб клуба справа. Один и тот же элемент на всех вкладках.

import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { logoUri, useBranding } from '@/api/branding';
import { useMyTeams } from '@/api/hooks';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

interface Props {
  /** Показывать «личный режим», когда команды нет. Включено только в профиле:
   *  на остальных вкладках у игрока без команды шапка остаётся пустой. */
  showPersonal?: boolean;
  /** Явная команда — для экранов с переключателем: у тренера их несколько,
   *  и бейдж обязан показывать выбранную, а не первую в списке. */
  teamName?: string;
}

export function TeamBadge({ showPersonal = false, teamName: explicitTeam }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const teams = useMyTeams();
  const { data: branding } = useBranding();
  const [broken, setBroken] = useState(false);

  const teamName = explicitTeam ?? teams.data?.[0]?.name;
  const logo = logoUri(branding);
  if (!teamName && !showPersonal) return null;

  // Герб заменяет точку: он и так говорит, что режим командный
  const withLogo = Boolean(teamName && logo) && !broken;

  return (
    <View style={styles.wrap}>
      {withLogo ? null : (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: teamName ? th.brandOn : th.low,
              shadowColor: teamName ? th.brandOn : th.low,
            },
          ]}
        />
      )}
      <Text style={styles.label} numberOfLines={1}>
        {(teamName ?? t('home.personalMode')).toUpperCase()}
      </Text>
      {withLogo ? (
        <Image
          source={{ uri: logo }}
          style={styles.logo}
          contentFit="contain"
          transition={150}
          onError={() => setBroken(true)}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, maxWidth: '55%' },
  label: { fontFamily: th.font.semibold, fontSize: 10.5, color: th.text, letterSpacing: 1, flexShrink: 1 },
  // Герб вписан в квадрат по длинной стороне, поэтому без скругления и обрезки
  logo: { width: 24, height: 24 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});
