// «Дом» тренера/админа: Squad Status — состояние состава на сегодня (раздел 3.2 ТЗ).
// Красные зоны сервер сортирует наверх. Приглашения в клуб живут в профиле:
// это админское действие, а не часть ежедневной картины состава.

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMyTeams, useSquadStatus } from '@/api/hooks';
import type { SquadPlayer } from '@/api/types';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { TeamBadge } from '@/components/TeamBadge';
import { ScreenTitle } from '@/components/Typography';
import { loadZoneColor, readinessColor, spacing, type Theme, useStyles, useTheme } from '@/theme';

function availabilityColor(status: SquadPlayer['availability'], th: Theme): string {
  switch (status) {
    case 'full':
      return th.good;
    case 'modified':
      return th.caution;
    case 'unavailable':
      return th.risk;
    default:
      return th.low;
  }
}

function PlayerRow({ player, last }: { player: SquadPlayer; last: boolean }) {
  const th = useTheme();
  const rowStyles = useStyles(makeRowStyles);
  const { t } = useTranslation();
  const zoneColor = readinessColor(player.readiness_zone);

  const flags: { label: string; color: string }[] = [];
  if (!player.wellness_filled) flags.push({ label: t('coach.noSurvey'), color: th.textMuted });
  if (player.active_injury) flags.push({ label: t('coach.injury'), color: th.risk });
  if (player.hr_flag) flags.push({ label: t('coach.hrFlag'), color: th.caution });

  return (
    <View style={[rowStyles.row, last && { borderBottomWidth: 0 }]}>
      <View style={[rowStyles.badge, { borderColor: zoneColor }]}>
        <Text style={[rowStyles.badgeText, { color: player.readiness != null ? th.text : th.textMuted }]}>
          {player.readiness ?? '—'}
        </Text>
      </View>
      <View style={rowStyles.main}>
        <Text style={rowStyles.name} numberOfLines={1}>
          {player.name}
        </Text>
        {flags.length > 0 ? (
          <View style={rowStyles.flags}>
            {flags.map(({ label, color }) => (
              <Text key={label} style={[rowStyles.flag, { color }]}>
                {label.toUpperCase()}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={[rowStyles.flag, { color: th.textMuted }]}>
            {t(`coach.availability.${player.availability ?? 'full'}`).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={rowStyles.side}>
        <Text style={[rowStyles.acwr, { color: loadZoneColor(player.load_zone) }]}>
          {player.acwr != null ? player.acwr.toFixed(2) : '—'}
        </Text>
        <View style={[rowStyles.availDot, { backgroundColor: availabilityColor(player.availability, th) }]} />
      </View>
    </View>
  );
}

export function CoachHome() {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  const teams = useMyTeams();
  const activeTeamId = teamId ?? teams.data?.[0]?.id;
  const squad = useSquadStatus(activeTeamId);
  const activeTeam = teams.data?.find((team) => team.id === activeTeamId);

  const players = squad.data?.players ?? [];
  const readyCount = players.filter((p) => p.readiness_zone === 'green').length;
  const riskCount = players.filter((p) => p.readiness_zone === 'red' || p.active_injury).length;
  const filledCount = players.filter((p) => p.wellness_filled).length;

  const dateLabel = new Date()
    .toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void qc.invalidateQueries().finally(() => setRefreshing(false));
  }, [qc]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.textMuted} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.date}>{dateLabel}</Text>
            <ScreenTitle>{t('coach.title')}</ScreenTitle>
          </View>
          <TeamBadge teamName={activeTeam?.name} />
        </View>

        {(teams.data?.length ?? 0) > 1 && (
          <View style={styles.teamRow}>
            {teams.data?.map((team) => {
              const active = team.id === activeTeamId;
              return (
                <Pressable
                  key={team.id}
                  onPress={() => setTeamId(team.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.teamChip, active && styles.teamChipActive]}
                >
                  <Text style={[styles.teamText, active && styles.teamTextActive]}>{team.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.tiles}>
          <StatTile label={t('coach.ready')} value={String(readyCount)} accent={th.good} />
          <StatTile label={t('coach.risk')} value={String(riskCount)} accent={th.risk} />
          <StatTile
            label={t('coach.surveys')}
            value={`${filledCount}/${players.length}`}
            accent={th.brandOn}
          />
        </View>

        {players.length > 0 ? (
          <View style={styles.list}>
            {players.map((player, i) => (
              <PlayerRow key={player.athlete_id} player={player} last={i === players.length - 1} />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('coach.empty')}</Text>
            <Text style={styles.emptyHint}>{t('coach.emptyHint')}</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  content: { padding: spacing.screen, paddingBottom: 40 },
  header: {
    marginBottom: spacing.l,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  date: {
    fontFamily: th.font.semibold,
    fontSize: 11,
    color: th.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, marginBottom: spacing.l },
  teamChip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: th.radius.chip,
    backgroundColor: th.surface2,
    borderWidth: 1,
    borderColor: th.border,
  },
  teamChipActive: { backgroundColor: th.brand, borderColor: th.brandOn },
  teamText: { fontFamily: th.font.medium, fontSize: 13, color: th.textMuted },
  teamTextActive: { color: th.onBrand },
  tiles: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.l },
  list: {
    backgroundColor: th.surface,
    borderWidth: 1,
    borderColor: th.border,
    borderRadius: th.radius.card,
  },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.s },
  emptyTitle: { fontFamily: th.font.semibold, fontSize: 16, color: th.text },
  emptyHint: {
    fontFamily: th.font.regular,
    fontSize: 14,
    color: th.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});

const makeRowStyles = (th: Theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: th.border,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: th.font.display, fontSize: 15 },
  main: { flex: 1, gap: 3 },
  name: { fontFamily: th.font.semibold, fontSize: 15, color: th.text },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  flag: { fontFamily: th.font.semibold, fontSize: 10, letterSpacing: 0.8 },
  side: { alignItems: 'flex-end', gap: 6 },
  acwr: { fontFamily: th.font.semibold, fontSize: 14 },
  availDot: { width: 8, height: 8, borderRadius: 4 },
});
