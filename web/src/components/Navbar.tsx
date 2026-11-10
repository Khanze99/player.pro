import Link from "next/link";

import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { GlobalRole } from "@/types";

const roleLabel: Record<GlobalRole, string> = {
  admin: "Администратор",
  staff: "Тренер/врач",
  player: "Игрок",
};

export function Navbar({
  name,
  role,
  orgName,
  hasLogo,
}: {
  name: string;
  role: GlobalRole;
  // Лого организации в шапке (docs/design-player-passport-theme.md) — общее
  // для всей админки, не только паспорта игрока. orgName без org_id (личный
  // режим) не приходит — центральный блок просто не рисуется.
  orgName?: string | null;
  hasLogo?: boolean;
}) {
  return (
    // Три колонки, не flex-justify-between: лого+организация должны быть
    // по центру навбара независимо от ширины левого/правого блоков, не
    // просто «между ними».
    <nav className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 grid grid-cols-3 items-center">
      <Link href="/teams" className="text-base font-semibold tracking-tight text-[var(--text)] justify-self-start">
        player.pro
      </Link>

      <div className="flex items-center justify-center gap-2.5">
        {orgName && (
          <>
            {hasLogo && (
              // eslint-disable-next-line @next/next/no-img-element -- внешняя картинка через свой BFF-роут, не next/image
              <img
                src="/api/branding/logo"
                alt={orgName}
                width={30}
                height={30}
                // width/height-атрибуты обязательны, не только классы: герб
                // организации приходит произвольного разрешения (у ФК Рубин
                // — 250×336), без явного intrinsic size браузер до применения
                // object-contain/класса w/h иногда успевает отрисовать кадр
                // в натуральную величину — на навбаре это выглядит как
                // гигантское лого. Без белой подложки/рамки — герб с
                // прозрачным фоном, рамка-квадрат вокруг нарисованного контура
                // в тёмной теме выглядела как «белое лого» (та подложка и
                // была контуром, не сам герб).
                className="w-[30px] h-[30px] object-contain flex-none"
              />
            )}
            <span className="text-sm font-medium text-[var(--text)]">{orgName}</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-4">
        <NotificationBell />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)]">{name}</span>
          <span className="text-[var(--text)] font-medium">{roleLabel[role]}</span>
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </nav>
  );
}
