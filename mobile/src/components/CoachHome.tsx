// «Дом» тренера/админа: Squad Status — состояние состава на сегодня (раздел 3.2 ТЗ).
// Красные зоны сервер сортирует наверх; админ отсюда же приглашает людей в клуб.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMe, useMyTeams, useSquadStatus } from '@/api/hooks';
import type { SquadPlayer } from '@/api/types';
import { ActionCard } from '@/components/ActionCard';
import { BoltIcon } from '@/components/Icons';
import { Screen } from '@/components/Screen';
import { StatTile } from '@/components/StatTile';
import { ScreenTitle } from '@/components/Typography';
import { colors, font, loadZoneColor, radius, readinessColor, spacing } from '@/theme';

function availabilityColor(status: SquadPlayer['availability']): string {
  switch (status) {
    case 'full':
      return colors.good;
    case 'modified':
      return colors.caution;
    case 'unavailable':
      return colors.risk;
    default:
      return colors.low;
  }
}

function PlayerRow({ player, last }: { player: SquadPlayer; last: boolean }) {
  const { t } = useTranslation();
  const zoneColor = readinessColor(player.readiness_zone);

  const flags: { label: string; color: string }[] = [];
  if (!player.wellness_filled) flags.push({ label: t('coach.noSurvey'), color: colors.textMuted });
  if (player.active_injury) flags.push({ label: t('coach.injury'), color: colors.risk });
  if (player.hr_flag) flags.push({ label: t('coach.hrFlag'), color: colors.caution });

  return (
    <View style={[rowStyles.row, last && { borderBottomWidth: 0 }]}>
      <View style={[rowStyles.badge, { borderColor: zoneColor }]}>
        <Text style={[rowStyles.badgeText, { color: player.readiness != null ? colors.text : colors.textMuted }]}>
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
          <Text style={[rowStyles.flag, { color: colors.textMuted }]}>
            {t(`coach.availability.${player.availability ?? 'full'}`).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={rowStyles.side}>
        <Text style={[rowStyles.acwr, { color: loadZoneColor(player.load_zone) }]}>
          {player.acwr != null ? player.acwr.toFixed(2) : '—'}
        </Text>
        <View style={[rowStyles.availDot, { backgroundColor: availabilityColor(player.availability) }]} />
      </View>
    </View>
  );
}

export function CoachHome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  const me = useMe();
  const teams = useMyTeams();
  const activeTeamId = teamId ?? teams.data?.[0]?.id;
  const squad = useSquadStatus(activeTeamId);

  const isAdmin = me.data?.global_role === 'admin';
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.date}>{dateLabel}</Text>
          <ScreenTitle>{t('coach.title')}</ScreenTitle>
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
          <StatTile label={t('coach.ready')} value={String(readyCount)} accent={colors.good} />
          <StatTile label={t('coach.risk')} value={String(riskCount)} accent={colors.risk} />
          <StatTile
            label={t('coach.surveys')}
            value={`${filledCount}/${players.length}`}
            accent={colors.brand}
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

        {isAdmin && (
          <View style={styles.actions}>
            <ActionCard
              icon={<BoltIcon color={colors.brand} />}
              title={t('coach.invite')}
              hint={t('coach.inviteHint')}
              onPress={() => router.push('/invite')}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, paddingBottom: 40 },
  header: { marginBottom: spacing.l },
  date: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, marginBottom: spacing.l },
  teamChip: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: radius.chip,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  teamText: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  teamTextActive: { color: '#FFFFFF' },
  tiles: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.l },
  list: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.s },
  emptyTitle: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  emptyHint: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  actions: { marginTop: spacing.xl },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.display, fontSize: 15 },
  main: { flex: 1, gap: 3 },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  flag: { fontFamily: font.semibold, fontSize: 10, letterSpacing: 0.8 },
  side: { alignItems: 'flex-end', gap: 6 },
  acwr: { fontFamily: font.semibold, fontSize: 14 },
  availDot: { width: 8, height: 8, borderRadius: 4 },
});
