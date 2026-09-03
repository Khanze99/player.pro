// Карта боли (дизайн-ТЗ 5.3): манекен из скрина приложения. Тап отмечает больную часть
// (мульти-выбор). Данные — деталь для медика; на Readiness НЕ влияют (за боль отвечает soreness).

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { ClipPath, Defs, Path } from 'react-native-svg';

import type { BodyRegion, BodySide, PainPoint } from '@/api/types';
import { spacing, type Theme, useStyles, useTheme } from '@/theme';
import { MANNEQUIN_DIVIDERS, MANNEQUIN_SIL, MANNEQUIN_ZONES } from './mannequinPaths';

interface Props {
  value: PainPoint[];
  onChange: (points: PainPoint[]) => void;
  /** Тяжесть, с которой сохраняется отмеченная часть (обычно общий балл боли). */
  severity?: number;
}

export function BodyMap({ value, onChange, severity = 5 }: Props) {
  const th = useTheme();
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();

  const isOn = (region: BodyRegion, side: BodySide) =>
    value.some((p) => p.region === region && p.side === side);

  const toggle = (region: BodyRegion, side: BodySide) => {
    onChange(
      isOn(region, side)
        ? value.filter((p) => !(p.region === region && p.side === side))
        : [...value, { region, side, severity }],
    );
  };

  return (
    <View>
      <View style={styles.labels}>
        <Text style={styles.label}>{t('wellness.bodyMap.left')}</Text>
        <Text style={styles.label}>{t('wellness.bodyMap.right')}</Text>
      </View>

      <Svg width="100%" height={360} viewBox="0 0 300 600">
        <Defs>
          <ClipPath id="mannequinSil">
            <Path d={MANNEQUIN_SIL} />
          </ClipPath>
        </Defs>

        <Path
          d={MANNEQUIN_SIL}
          fill="#3A4150"
          stroke="#8AA0BF"
          strokeWidth={1.4}
          strokeOpacity={0.85}
        />

        {/* Заливки-зоны (тап-цели), обрезаны по силуэту */}
        {MANNEQUIN_ZONES.map((z) => (
          <Path
            key={`${z.region}:${z.side}`}
            d={z.d}
            clipPath="url(#mannequinSil)"
            fill={th.brand}
            fillOpacity={isOn(z.region, z.side) ? 0.8 : 0}
            onPress={() => toggle(z.region, z.side)}
          />
        ))}

        {/* Плавные пунктирные линии-разделители */}
        {MANNEQUIN_DIVIDERS.map((d, i) => (
          <Path
            key={`div-${i}`}
            d={d}
            clipPath="url(#mannequinSil)"
            fill="none"
            stroke="#9FB2CC"
            strokeOpacity={0.7}
            strokeWidth={1.3}
            strokeDasharray={[5, 4]}
          />
        ))}
      </Svg>
    </View>
  );
}

const makeStyles = (th: Theme) => StyleSheet.create({
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    marginBottom: spacing.xs,
  },
  label: { fontFamily: th.font.medium, fontSize: 12, color: th.textMuted, letterSpacing: 1 },
});
