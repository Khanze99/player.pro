// Принадлежность к команде в шапке: без плашки, на прозрачном фоне —
// название слева, герб клуба справа. Один и тот же элемент на всех вкладках.

import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { logoUri, useBranding } from '@/api/branding';
import { useMyTeams } from '@/api/hooks';
import { activeTeamStore } from '@/auth/activeTeam';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

interface Props {
  /** Показывать «личный режим», когда команды нет. Включено только в профиле:
   *  на остальных вкладках у игрока без команды шапка остаётся пустой. */
  showPersonal?: boolean;
  /** Явная команда — для экранов с переключателем: у тренера их несколько,
   *  и бейдж обязан показывать выбранную, а не первую в списке. */
  teamName?: string;
  /** Бейдж внутри своего контейнера (шапка с колокольчиком): ширину ограничивает
   *  контейнер. Процентный maxWidth посчитался бы от него же и резал название. */
  inline?: boolean;
}

export function TeamBadge({ showPersonal = false, teamName: explicitTeam, inline = false }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const teams = useMyTeams();
  const activeTeamId = activeTeamStore((s) => s.activeTeamId);
  const { data: branding } = useBranding();
  const [broken, setBroken] = useState(false);

  // Явная команда (экраны со своим гейтом/пропсом) > выбранная в сторе (staff
  // с несколькими командами) > первая из списка (игрок — у него она обычно одна).
  const activeTeam = teams.data?.find((team) => team.id === activeTeamId) ?? teams.data?.[0];
  // В тесной шапке с колокольчиком: короткое имя, если админ его задал; иначе
  // полное название в две строки (дальше многоточие).
  const shortName = inline && !explicitTeam ? activeTeam?.short_name : null;
  const teamName = explicitTeam ?? shortName ?? activeTeam?.name;
  const lines = inline && !shortName ? 2 : 1;
  const logo = logoUri(branding);
  if (!teamName && !showPersonal) return null;

  // Герб заменяет точку: он и так говорит, что режим командный
  const withLogo = Boolean(teamName && logo) && !broken;

  return (
    <View style={[styles.wrap, inline && styles.inline]}>
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
      <Text style={[styles.label, lines > 1 && styles.labelWrap]} numberOfLines={lines}>
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
  inline: { maxWidth: undefined, flexShrink: 1 },
  labelWrap: { textAlign: 'right', lineHeight: 14 },
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
