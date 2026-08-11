// Тренерский дашборд (раздел 3.2 ТЗ): три раздела в одной вкладке.
//   Обзор  — четыре бублика, утренний отчёт, события, командный отчёт
//   Статус — состав в четырёх разрезах: готовность, нагрузка, перфоманс, доступность
//   Травмы — активные и закрытые, плюс «горячие зоны» тела
// Все цифры приходят предрасчитанными с сервера, клиент только раскрашивает.

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMyTeams, useSquadStatus, useTeamInjuries, useTeamSummary } from '@/api/hooks';
import type {
  DashboardEvent,
  MetricGauge,
  SquadPlayer,
  TeamAlert,
  TeamInjury,
  TeamSummary,
} from '@/api/types';
import { Donut } from '@/components/Donut';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { MicroLabel, ScreenTitle } from '@/components/Typography';
import { colors, eventTypeColor, font, loadZoneColor, radius, readinessColor, spacing } from '@/theme';

type Section = 'summary' | 'status' | 'injuries';
type StatusTab = 'readiness' | 'load' | 'performance' | 'availability';

const SECTIONS: readonly Section[] = ['summary', 'status', 'injuries'];
const STATUS_TABS: readonly StatusTab[] = ['readiness', 'load', 'performance', 'availability'];

/** Нагрузка живёт в словаре зон ACWR, остальные метрики — в светофоре. */
const zoneColor = (zone: string) =>
  zone === 'optimal' || zone === 'overreaching' || zone === 'high_risk' || zone === 'undertraining'
    ? loadZoneColor(zone)
    : readinessColor(zone);

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <MicroLabel>{title}</MicroLabel> : null}
      {children}
    </View>
  );
}

function GaugeRow({ summary }: { summary: TeamSummary }) {
  const { t } = useTranslation();
  const gauge = (key: 'readiness' | 'load' | 'performance' | 'availability') => summary[key];

  const caption = (g: MetricGauge, kind: string) => {
    if (g.value === null) return t('dashboard.noData');
    if (kind === 'load') return t(`home.loadZone.${g.zone}`);
    return t(`dashboard.zoneCaption.${g.zone}`);
  };

  return (
    <View style={styles.gaugeGrid}>
      {(
        [
          ['readiness', 0], // 0–100, целое
          ['load', 2], // ACWR, два знака
          ['performance', 1], // 1–10, один знак
          ['availability', 0], // %, целое
        ] as const
      ).map(([key, digits]) => {
        const g = gauge(key);
        return (
          <Donut
            key={key}
            value={g.value}
            scaleMax={g.scale_max}
            color={zoneColor(g.zone)}
            digits={digits}
            label={t(`dashboard.metric.${key}`)}
            caption={caption(g, key)}
          />
        );
      })}
    </View>
  );
}

function EventRow({ event, past }: { event: DashboardEvent; past: boolean }) {
  const { t, i18n } = useTranslation();
  const when = new Date(event.planned_start).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  return (
    <View style={styles.row}>
      <View style={[styles.eventDot, { backgroundColor: eventTypeColor(event.type) }]} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {event.title ?? t(`calendar.types.${event.type}`)}
        </Text>
        <Text style={styles.rowHint}>
          {when} · {event.planned_duration_min} {t('dashboard.min')}
          {past ? ` · ${t('dashboard.attended', { n: event.present })}` : ''}
        </Text>
      </View>
      {past && event.avg_exertion !== null ? (
        <View style={styles.rowSide}>
          <Text style={styles.rowValue}>{event.avg_exertion.toFixed(1)}</Text>
          <Text style={styles.rowHint}>{t('dashboard.avgRpe')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function AlertRow({ alert }: { alert: TeamAlert }) {
  const { t } = useTranslation();
  const color = alert.severity === 'risk' ? colors.risk : colors.caution;
  return (
    <View style={styles.row}>
      <View style={[styles.severityBar, { backgroundColor: color }]} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {alert.name}
        </Text>
        <Text style={styles.rowHint} numberOfLines={2}>
          {alert.reasons.map((reason) => t(`dashboard.reason.${reason}`)).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

function SummarySection({ teamId }: { teamId: string | undefined }) {
  const { t } = useTranslation();
  const summary = useTeamSummary(teamId);

  if (!summary.data) return <Text style={styles.empty}>{t('dashboard.loading')}</Text>;
  const s = summary.data;
  const w = s.wellness;
  const scale = (value: number | null) => (value === null ? '—' : value.toFixed(1));

  return (
    <View style={styles.sectionBody}>
      <GaugeRow summary={s} />

      <Card title={t('dashboard.wellnessReport')}>
        <Text style={styles.bigStat}>
          {w.filled}
          <Text style={styles.bigStatMuted}>/{w.total}</Text>
        </Text>
        <Text style={styles.cardHint}>{t('dashboard.surveysFilled')}</Text>
        <View style={styles.scaleGrid}>
          {(
            [
              ['sleep', w.avg_sleep_quality],
              ['energy', w.avg_energy],
              ['mood', w.avg_mood],
              ['stress', w.avg_stress],
              ['soreness', w.avg_soreness],
              ['sleepHours', w.avg_sleep_hours],
            ] as const
          ).map(([key, value]) => (
            <View key={key} style={styles.scaleCell}>
              <Text style={styles.scaleValue}>{scale(value)}</Text>
              <Text style={styles.scaleLabel}>{t(`dashboard.scale.${key}`)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.flagRow}>
          <Text style={[styles.flag, { color: colors.caution }]}>
            {t('dashboard.withPain', { n: w.with_pain })}
          </Text>
          <Text style={[styles.flag, { color: colors.risk }]}>
            {t('dashboard.withInjury', { n: w.with_injury_flag })}
          </Text>
          <Text style={[styles.flag, { color: colors.brand }]}>
            {t('dashboard.withSymptom', { n: w.with_symptom_flag })}
          </Text>
        </View>
        {w.missing.length > 0 ? (
          <Text style={styles.missing}>
            {t('dashboard.missing')}: {w.missing.join(', ')}
          </Text>
        ) : null}
      </Card>

      {s.past_events.length > 0 ? (
        <Card title={t('dashboard.pastEvents')}>
          {s.past_events.map((event) => (
            <EventRow key={event.id} event={event} past />
          ))}
        </Card>
      ) : null}

      {s.upcoming_events.length > 0 ? (
        <Card title={t('dashboard.upcomingEvents')}>
          {s.upcoming_events.map((event) => (
            <EventRow key={event.id} event={event} past={false} />
          ))}
        </Card>
      ) : null}

      <Card title={t('dashboard.teamReport')}>
        {s.alerts.length > 0 ? (
          s.alerts.map((alert) => <AlertRow key={alert.athlete_id} alert={alert} />)
        ) : (
          <Text style={styles.cardHint}>{t('dashboard.allClear')}</Text>
        )}
      </Card>
    </View>
  );
}

/** Одна строка состава. Что показывать справа — зависит от выбранной вкладки. */
function PlayerRow({ player, tab }: { player: SquadPlayer; tab: StatusTab }) {
  const { t } = useTranslation();

  const view: Record<StatusTab, { value: string; color: string; hint: string }> = {
    readiness: {
      value: player.readiness !== null ? String(player.readiness) : '—',
      color: readinessColor(player.readiness_zone),
      hint: player.wellness_filled ? t(`dashboard.zoneCaption.${player.readiness_zone}`) : t('coach.noSurvey'),
    },
    load: {
      value: player.acwr !== null ? player.acwr.toFixed(2) : '—',
      color: loadZoneColor(player.load_zone),
      hint: `${t(`home.loadZone.${player.load_zone}`)} · ${Math.round(player.load_7d)} AU`,
    },
    performance: {
      value: player.performance_7d !== null ? player.performance_7d.toFixed(1) : '—',
      color: readinessColor(
        player.performance_7d === null
          ? null
          : player.performance_7d >= 7
            ? 'green'
            : player.performance_7d >= 5
              ? 'yellow'
              : 'red',
      ),
      hint: t('dashboard.last7d'),
    },
    availability: {
      value: player.availability_percent !== null ? `${Math.round(player.availability_percent)}%` : '—',
      color: readinessColor(
        player.availability_percent === null
          ? null
          : player.availability_percent >= 85
            ? 'green'
            : player.availability_percent >= 70
              ? 'yellow'
              : 'red',
      ),
      hint: t(`coach.availability.${player.availability ?? 'full'}`),
    },
  };
  const { value, color, hint } = view[tab];

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { borderColor: color }]}>
        <Text style={styles.badgeText}>{value}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.rowHint} numberOfLines={1}>
          {player.position ?? hint}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={[styles.rowValue, { color }]}>{hint}</Text>
        {player.active_injury ? (
          <Text style={[styles.rowHint, { color: colors.risk }]}>{t('coach.injury')}</Text>
        ) : null}
      </View>
    </View>
  );
}

function StatusSection({ teamId }: { teamId: string | undefined }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<StatusTab>('readiness');
  const squad = useSquadStatus(teamId);
  const players = squad.data?.players ?? [];

  // Каждый разрез сортируется по своей метрике: худшие — сверху
  const sorted = [...players].sort((a, b) => {
    const rank = (p: SquadPlayer) => {
      switch (tab) {
        case 'load':
          return -(p.acwr ?? 0);
        case 'performance':
          return p.performance_7d ?? 999;
        case 'availability':
          return p.availability_percent ?? 999;
        default:
          return p.readiness ?? 999;
      }
    };
    return rank(a) - rank(b);
  });

  return (
    <View style={styles.sectionBody}>
      <Segmented
        options={STATUS_TABS}
        value={tab}
        onSelect={setTab}
        labelFor={(v) => t(`dashboard.metric.${v}`)}
        scrollable
      />
      <Card>
        {sorted.length > 0 ? (
          sorted.map((player) => <PlayerRow key={player.athlete_id} player={player} tab={tab} />)
        ) : (
          <Text style={styles.cardHint}>{t('coach.empty')}</Text>
        )}
      </Card>
    </View>
  );
}

function InjuryRow({ item }: { item: TeamInjury }) {
  const { t, i18n } = useTranslation();
  const color = item.kind === 'illness' ? colors.brand : colors.risk;
  const since = new Date(item.start_date).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const where = item.body_region
    ? [t(`dashboard.bodyRegion.${item.body_region}`), item.body_side ? t(`dashboard.bodySide.${item.body_side}`) : null]
        .filter(Boolean)
        .join(' · ')
    : item.symptom_type
      ? t(`wellness.symptomType.${item.symptom_type}`)
      : t(`dashboard.kind.${item.kind}`);

  return (
    <View style={styles.row}>
      <View style={[styles.severityBar, { backgroundColor: color }]} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.athlete_name}
        </Text>
        <Text style={styles.rowHint} numberOfLines={2}>
          {item.title || t(`dashboard.kind.${item.kind}`)} · {where}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={[styles.rowValue, { color }]}>{t('dashboard.days', { n: item.days_out })}</Text>
        <Text style={styles.rowHint}>{since}</Text>
      </View>
    </View>
  );
}

function InjuriesSection({ teamId }: { teamId: string | undefined }) {
  const { t } = useTranslation();
  const injuries = useTeamInjuries(teamId);

  if (!injuries.data) return <Text style={styles.empty}>{t('dashboard.loading')}</Text>;
  const data = injuries.data;

  return (
    <View style={styles.sectionBody}>
      <Card title={t('dashboard.activeInjuries')}>
        {data.active.length > 0 ? (
          data.active.map((item) => <InjuryRow key={`${item.kind}-${item.id}`} item={item} />)
        ) : (
          <Text style={styles.cardHint}>{t('dashboard.noInjuries')}</Text>
        )}
      </Card>

      {data.hotspots.length > 0 ? (
        <Card title={t('dashboard.hotspots')}>
          {data.hotspots.map((spot) => (
            <View key={spot.body_region} style={styles.hotspotRow}>
              <Text style={styles.rowTitle}>{t(`dashboard.bodyRegion.${spot.body_region}`)}</Text>
              <View style={styles.hotspotBarTrack}>
                <View
                  style={[
                    styles.hotspotBar,
                    { width: `${(spot.count / data.hotspots[0].count) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.hotspotCount}>{spot.count}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {data.recent.length > 0 ? (
        <Card title={t('dashboard.recentInjuries', { days: data.window_days })}>
          {data.recent.map((item) => (
            <InjuryRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </Card>
      ) : null}
    </View>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>('summary');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const teams = useMyTeams();
  const activeTeamId = teamId ?? teams.data?.[0]?.id;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void qc.invalidateQueries().finally(() => setRefreshing(false));
  }, [qc]);

  const dateLabel = new Date()
    .toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

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
          <ScreenTitle>{t('dashboard.title')}</ScreenTitle>
        </View>

        {(teams.data?.length ?? 0) > 1 ? (
          <View style={styles.teamRow}>
            <Segmented
              options={(teams.data ?? []).map((team) => team.id)}
              value={activeTeamId ?? ''}
              onSelect={setTeamId}
              labelFor={(id) => teams.data?.find((team) => team.id === id)?.name ?? ''}
              scrollable
            />
          </View>
        ) : null}

        <Segmented
          options={SECTIONS}
          value={section}
          onSelect={setSection}
          labelFor={(v) => t(`dashboard.section.${v}`)}
        />

        {section === 'summary' && <SummarySection teamId={activeTeamId} />}
        {section === 'status' && <StatusSection teamId={activeTeamId} />}
        {section === 'injuries' && <InjuriesSection teamId={activeTeamId} />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, paddingBottom: 40, gap: spacing.l },
  header: { marginBottom: spacing.xs },
  date: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  teamRow: { marginBottom: -spacing.s },
  sectionBody: { gap: spacing.l },

  gaugeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.l,
    gap: spacing.s,
  },
  cardHint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  bigStat: { fontFamily: font.display, fontSize: 30, color: colors.text },
  bigStatMuted: { fontFamily: font.display, fontSize: 18, color: colors.textMuted },

  scaleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, marginTop: spacing.s },
  scaleCell: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface2,
    borderRadius: radius.chip,
    paddingVertical: spacing.s,
    alignItems: 'center',
  },
  scaleValue: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  scaleLabel: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, letterSpacing: 0.4 },

  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m, marginTop: spacing.xs },
  flag: { fontFamily: font.medium, fontSize: 12 },
  missing: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, gap: 2 },
  rowSide: { alignItems: 'flex-end', gap: 2 },
  rowTitle: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  rowHint: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  rowValue: { fontFamily: font.bold, fontSize: 13, color: colors.text },

  badge: {
    width: 46,
    height: 40,
    borderRadius: radius.control,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.display, fontSize: 14, color: colors.text },
  eventDot: { width: 8, height: 8, borderRadius: 4 },
  severityBar: { width: 3, height: 32, borderRadius: 2 },

  hotspotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingVertical: spacing.s },
  hotspotBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  hotspotBar: { height: 6, borderRadius: 3, backgroundColor: colors.risk },
  hotspotCount: { fontFamily: font.bold, fontSize: 13, color: colors.text, minWidth: 20, textAlign: 'right' },

  empty: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
