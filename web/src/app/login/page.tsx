"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await api.login(email, password);
      const user = await api.me(tokens.access_token);
      saveAuth(tokens.access_token, tokens.refresh_token, user);

      if (user.role === "doctor" || user.role === "admin") {
        router.push("/doctor/dashboard");
      } else if (user.role === "coach") {
        router.push("/coach/dashboard");
      } else {
        setError("Этот интерфейс только для тренеров и врачей.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--accent)] tracking-tight">player.pro</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">Система мониторинга спортсменов</p>
        </div>

        <form onSubmit={submit} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@playerpro.ru"
              required
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1.5">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {error && <p className="text-[var(--red)] text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-muted)] mt-4">
          Тест: coach@playerpro.ru / coach123 · doctor@playerpro.ru / doctor123
        </p>
      </div>
    </div>
  );
}
