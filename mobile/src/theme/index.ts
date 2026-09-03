// Дизайн-токены v2 — sport-tech: тёмная база, брендовый градиент,
// светофор состояний (раздел 4 дизайн-ТЗ).
//
// Токены живут в объекте темы: организация может подменить брендовый слой
// (docs/plan-org-branding.md), поэтому в компонентах они берутся через
// useTheme()/useStyles(), а не импортом константы.

/** Светофор состояний. Не тематизируется никогда: это язык продукта, общий
 *  для всех организаций. Клуб, перекрасивший «красный», ломает не свой дизайн,
 *  а интерпретацию данных врачом и тренером. */
export const status = {
  good: '#2FD27A',
  caution: '#FFB02E',
  risk: '#FF5C5C',
  low: '#6B7A8D',
} as const;

export interface Theme {
  /** Поверхности и текст */
  bg: string;
  bgTop: string;
  surface: string;
  surface2: string;
  border: string;
  borderBright: string;
  text: string;
  textMuted: string;
  /** Брендовый слой — то, что подменяет организация */
  brand: string;
  brandDark: string;
  /** Бренд как текст, иконка или граница на тёмном фоне: тёмный клубный цвет
   *  в этой роли нечитаем, поэтому это отдельный, осветлённый оттенок. */
  brandOn: string;
  /** Текст поверх брендовой заливки */
  onBrand: string;
  /** Второй цвет клуба; по умолчанию совпадает с основным */
  brand2: string;
  brand2On: string;
  /** Светофор — копия status, чтобы в фабриках стилей был один способ доступа */
  good: string;
  caution: string;
  risk: string;
  low: string;
  gradients: {
    brand: readonly [string, string];
    screen: readonly [string, string];
  };
  radius: { card: number; control: number; chip: number };
  font: {
    display: string;
    regular: string;
    medium: string;
    semibold: string;
    bold: string;
  };
}

/** Тема продукта по умолчанию: организации без брендинга видят её. */
export const defaultTheme: Theme = {
  bg: '#0A0D13',
  bgTop: '#10161F',
  surface: '#131A26',
  surface2: '#1B2432',
  border: '#26303F',
  borderBright: '#33405280',
  text: '#EDF2F9',
  textMuted: '#8A99AD',
  brand: '#2D8CFF',
  brandDark: '#1B6FE8',
  brandOn: '#2D8CFF',
  onBrand: '#FFFFFF',
  brand2: '#2D8CFF',
  brand2On: '#2D8CFF',
  ...status,
  gradients: {
    brand: ['#3D96FF', '#1B6FE8'],
    screen: ['#111927', '#0A0D13'],
  },
  radius: { card: 20, control: 14, chip: 8 },
  font: {
    display: 'Unbounded_600SemiBold',
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
};

export const spacing = { screen: 20, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24 } as const;

// Цвет = состояние: зоны готовности и нагрузки (раздел 4.1).
// Функции намеренно ходят в `status`, а не в тему: так подмена темы физически
// не может перекрасить светофор.
export function readinessColor(zone: string | null | undefined): string {
  switch (zone) {
    case 'green':
      return status.good;
    case 'yellow':
      return status.caution;
    case 'red':
      return status.risk;
    default:
      return status.low;
  }
}

export function loadZoneColor(zone: string | null | undefined): string {
  switch (zone) {
    case 'optimal':
      return status.good;
    case 'overreaching':
      return status.caution;
    case 'high_risk':
      return status.risk;
    default:
      return status.low; // undertraining / no_data
  }
}

/** Тип события — брендовый цвет, поэтому зависит от темы. */
export function eventTypeColor(type: string, t: Theme): string {
  switch (type) {
    case 'training':
      return t.brand;
    case 'match':
      return status.caution;
    case 'individual':
      return status.good;
    default:
      return status.low;
  }
}

export { ThemeProvider, useStyles, useTheme } from './provider';
