// Дизайн-токены v2 — sport-tech: тёмная база, брендовый градиент,
// светофор состояний (раздел 4 дизайн-ТЗ)

export const colors = {
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
  good: '#2FD27A',
  caution: '#FFB02E',
  risk: '#FF5C5C',
  low: '#6B7A8D',
} as const;

export const gradients = {
  brand: ['#3D96FF', '#1B6FE8'] as const,
  screen: ['#111927', '#0A0D13'] as const,
};

export const radius = { card: 20, control: 14, chip: 8 } as const;

export const spacing = { screen: 20, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24 } as const;

export const font = {
  display: 'Unbounded_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

// Цвет = состояние: зоны готовности и нагрузки (раздел 4.1)
export function readinessColor(zone: string | null | undefined): string {
  switch (zone) {
    case 'green':
      return colors.good;
    case 'yellow':
      return colors.caution;
    case 'red':
      return colors.risk;
    default:
      return colors.low;
  }
}

export function eventTypeColor(type: string): string {
  switch (type) {
    case 'training':
      return colors.brand;
    case 'match':
      return colors.caution;
    case 'individual':
      return colors.good;
    default:
      return colors.low;
  }
}

export function loadZoneColor(zone: string | null | undefined): string {
  switch (zone) {
    case 'optimal':
      return colors.good;
    case 'overreaching':
      return colors.caution;
    case 'high_risk':
      return colors.risk;
    default:
      return colors.low; // undertraining / no_data
  }
}
