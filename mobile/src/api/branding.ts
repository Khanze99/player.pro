// Тема организации: сервер — источник правды, клиент применяет её как есть
// (docs/plan-org-branding.md).

import { useQuery } from '@tanstack/react-query';

import { session } from '@/auth/session';
import { type Theme, defaultTheme } from '@/theme';

import { API_URL, api } from './client';

/** Ответ бэкенда: цвета в snake_case, как и во всём остальном API. */
export interface BrandingResponse {
  version: number;
  org_id: string | null;
  org_name: string | null;
  logo_url: string | null;
  tokens: {
    bg: string;
    bg_top: string;
    surface: string;
    surface_2: string;
    border: string;
    border_bright: string;
    text: string;
    text_muted: string;
    brand: string;
    brand_dark: string;
    brand_on: string;
    on_brand: string;
    brand_2: string;
    brand_2_on: string;
    gradient_brand: [string, string];
    gradient_screen: [string, string];
  };
}

/** Цвета приходят с сервера, форма и типографика пока продуктовые. */
export function toTheme(branding: BrandingResponse): Theme {
  const c = branding.tokens;
  return {
    ...defaultTheme,
    bg: c.bg,
    bgTop: c.bg_top,
    surface: c.surface,
    surface2: c.surface_2,
    border: c.border,
    borderBright: c.border_bright,
    text: c.text,
    textMuted: c.text_muted,
    brand: c.brand,
    brandDark: c.brand_dark,
    brandOn: c.brand_on,
    onBrand: c.on_brand,
    brand2: c.brand_2,
    brand2On: c.brand_2_on,
    gradients: { brand: c.gradient_brand, screen: c.gradient_screen },
  };
}

export const fetchBranding = () => api<BrandingResponse>('/branding');

/** Брендинг целиком: тема, название организации и герб. */
export function useBranding() {
  const status = session((st) => st.status);
  return useQuery({
    queryKey: ['branding'],
    queryFn: fetchBranding,
    enabled: status === 'active',
    staleTime: 5 * 60_000,
  });
}

/** Абсолютный адрес герба: сервер отдаёт путь, а не URL. */
export function logoUri(branding?: BrandingResponse | null): string | undefined {
  return branding?.logo_url ? `${API_URL}${branding.logo_url}` : undefined;
}
