// Чтение сессии в Server Components/страницах. Основной гейт — proxy.ts (гарантирует
// свежий pp_access до рендера страницы); requireSession() здесь — защита в глубину
// на случай прямого обращения к странице в обход proxy (не должно случаться при
// правильном matcher, но полагаться на один слой для мед. данных не стоит).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_ACCESS, COOKIE_USER, decodeCookieJson } from "@/lib/cookies";
import type { GlobalRole } from "@/types";

export interface SessionUser {
  id: string;
  name: string;
  role: GlobalRole;
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_ACCESS)?.value ?? null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return decodeCookieJson<SessionUser>(store.get(COOKIE_USER)?.value);
}

export async function requireSession(): Promise<{ token: string; user: SessionUser }> {
  const token = await getAccessToken();
  const user = await getSessionUser();
  if (!token || !user) {
    redirect("/login");
  }
  return { token, user };
}
