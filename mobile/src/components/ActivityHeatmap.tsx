// Карта активности, GitHub-style (docs/plan-activity-heatmap.md) — 12 месяцев,
// неделя с понедельника, 4 состояния дня: ничего / только опрос / только RPE /
// оба. Бэкенда не касается — сигналы берутся из дат уже загруженных
// WellnessEntry[]/RpeEntry[] (см. вызовы в index.tsx/athlete/[id]/index.tsx),
// здесь только геометрия и цвет.

import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { type Theme, useStyles, useTheme } from '@/theme';

const WEEKS = 53;
const CELL = 11;
const GAP = 2.5;
const PAD_LEFT = 18; // подписи дней недели
const PAD_TOP = 14; // подписи месяцев
const STEP = CELL + GAP;
const GRID_W = PAD_LEFT + WEEKS * STEP;
const GRID_H = PAD_TOP + 7 * STEP;

type DayState = 'none' | 'survey' | 'rpe' | 'both';

interface Cell {
  iso: string;
  x: number;
  y: number;
  state: DayState;
}

interface MonthLabel {
  x: number;
  label: string;
}

function mondayOf(d: Date): Date {
  const date = new Date(d);
  const dow = (date.getDay() + 6) % 7; // 0=Пн … 6=Вс
  date.setDate(date.getDate() - dow);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISO(d: Date): string {
  // Локальные компоненты даты, не toISOString() — тот конвертирует в UTC и при
  // положительном смещении (например, Москва, UTC+3) сдвигает дату на день
  // назад, из-за чего ключи клеток переставали совпадать с WellnessEntry.date/
  // RpeEntry.date (чистая календарная дата без таймзоны) — сетка выглядела
  // пустой почти целиком.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildGrid(
  wellnessDates: Set<string>,
  rpeDates: Set<string>,
  locale: string,
): { cells: Cell[]; months: MonthLabel[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastMonday = mondayOf(today);
  const firstMonday = new Date(lastMonday);
  firstMonday.setDate(firstMonday.getDate() - (WEEKS - 1) * 7);

  const cells: Cell[] = [];
  const months: MonthLabel[] = [];
  let prevMonth = -1;

  for (let col = 0; col < WEEKS; col++) {
    const colMonday = new Date(firstMonday);
    colMonday.setDate(colMonday.getDate() + col * 7);
    const month = colMonday.getMonth();
    if (month !== prevMonth) {
      months.push({ x: PAD_LEFT + col * STEP, label: colMonday.toLocaleDateString(locale, { month: 'short' }) });
      prevMonth = month;
    }
    for (let row = 0; row < 7; row++) {
      const day = new Date(colMonday);
      day.setDate(day.getDate() + row);
      if (day > today) continue; // будущее — не рисуем вовсе, не «ничего»
      const iso = toISO(day);
      const hasSurvey = wellnessDates.has(iso);
      const hasRpe = rpeDates.has(iso);
      const state: DayState = hasSurvey && hasRpe ? 'both' : hasSurvey ? 'survey' : hasRpe ? 'rpe' : 'none';
      cells.push({ iso, x: PAD_LEFT + col * STEP, y: PAD_TOP + row * STEP, state });
    }
  }
  return { cells, months };
}

interface Props {
  wellnessDates: Set<string>;
  rpeDates: Set<string>;
  onCellPress?: (date: string, hasSurvey: boolean, hasRpe: boolean) => void;
}

export function ActivityHeatmap({ wellnessDates, rpeDates, onCellPress }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);

  const { cells, months } = buildGrid(wellnessDates, rpeDates, i18n.language);
  const colorFor: Record<DayState, string> = {
    none: th.surface2,
    survey: th.brand,
    rpe: th.caution,
    both: th.good,
  };

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Сегодня — всегда правый край, сетка открывается уже на нём, без ручного скролла.
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <Svg width={GRID_W} height={GRID_H}>
          {months.map((m) => (
            <SvgText key={`mo-${m.x}`} x={m.x} y={10} fontSize={8.5} fill={th.textMuted}>
              {m.label}
            </SvgText>
          ))}
          {cells.map((c) => (
            <Rect
              key={c.iso}
              x={c.x}
              y={c.y}
              width={CELL}
              height={CELL}
              rx={2.5}
              fill={colorFor[c.state]}
              onPress={onCellPress ? () => onCellPress(c.iso, c.state === 'survey' || c.state === 'both', c.state === 'rpe' || c.state === 'both') : undefined}
            />
          ))}
        </Svg>
      </ScrollView>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: th.surface2 }]} />
          <Text style={styles.legendLabel}>{t('activity.legend.none')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: th.brand }]} />
          <Text style={styles.legendLabel}>{t('activity.legend.survey')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: th.caution }]} />
          <Text style={styles.legendLabel}>{t('activity.legend.rpe')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: th.good }]} />
          <Text style={styles.legendLabel}>{t('activity.legend.both')}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (th: Theme) =>
  StyleSheet.create({
    legend: { flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendSwatch: { width: 9, height: 9, borderRadius: 2 },
    legendLabel: { fontFamily: th.font.regular, fontSize: 10.5, color: th.textMuted },
  });
