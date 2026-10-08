// Выбор активной команды (docs/plan-team-selector.md). Вне группы (auth): открывается
// и как гейт при входе (2+ команды у staff/admin, из (tabs)/_layout.tsx), и по явному
// действию из профиля для смены — различаем по ?from=gate, чтобы знать, как вернуться:
// гейту некуда «назад» (ещё не выбрана команда), профилю — обычный back.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMyTeams } from '@/api/hooks';
import { activeTeamStore } from '@/auth/activeTeam';
import { ActionCard } from '@/components/ActionCard';
import { BackButton } from '@/components/BackButton';
import { GridIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { ScreenTitle } from '@/components/Typography';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';

export default function TeamChoice() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isGate = from === 'gate';

  const teams = useMyTeams();
  const activeTeamId = activeTeamStore((s) => s.activeTeamId);
  const setActiveTeam = activeTeamStore((s) => s.setActiveTeam);

  const choose = (id: string) => {
    setActiveTeam(id);
    if (isGate) router.replace('/');
    else router.back();
  };

  return (
    <Screen>
      {isGate ? null : <BackButton />}
      <View style={styles.content}>
        <ScreenTitle>{t('teamChoice.title')}</ScreenTitle>
        <View style={styles.cards}>
          {(teams.data ?? []).map((team) => (
            <ActionCard
              key={team.id}
              icon={<GridIcon color={team.id === activeTeamId ? th.onBrand : th.textMuted} />}
              title={team.name}
              primary={team.id === activeTeamId}
              onPress={() => choose(team.id)}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { flex: 1, padding: spacing.screen, justifyContent: 'center', gap: spacing.l },
  cards: { gap: spacing.m },
});
