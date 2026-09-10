// Бочка темы. Токены живут в ./tokens (лист без импортов), провайдер — в ./provider.
// Раздельно, потому что provider.tsx на старте читает defaultTheme в createContext:
// если бы токены и re-export провайдера жили в одном модуле, на вебе это давало бы
// circular-import TDZ (index ⇄ provider). Потребители по-прежнему импортят '@/theme'.

export * from './tokens';
export { ThemeProvider, useStyles, useTheme } from './provider';
