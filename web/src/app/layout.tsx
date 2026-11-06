import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "player.pro · Кабинет штаба",
  description: "Ежедневные отчёты игроков для тренера и врача",
};

// Светлая/тёмная (docs/design-player-passport-theme.md) — выставляется до
// гидратации, иначе страница на долю секунды мигнёт светлой даже у того, кто
// выбрал тёмную (localStorage читается только на клиенте). beforeInteractive
// обязательно в корневом layout — это не компонент конкретной страницы.
const THEME_INIT = `
(function () {
  try {
    var t = localStorage.getItem("pp-theme");
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning — только на этом теге (не глубже): data-theme
    // выставляет блокирующий скрипт ДО гидратации, серверный HTML его не
    // знает, и без этой пометки React считает разницу ошибкой гидратации
    // (реальная ошибка, увиденная в браузере: "A tree hydrated but some
    // attributes... didn't match"). Тот же приём, что у next-themes.
    <html lang="ru" className={geist.variable} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT}
        </Script>
        {children}
      </body>
    </html>
  );
}
