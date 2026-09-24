"use client";

// OTP-логин, два шага: identifier → код (тот же способ входа, что у мобилки,
// backend/app/api/v1/auth.py — паролей в системе нет вообще). Ходит в
// собственные Route Handlers (/api/auth/otp/*), не в FastAPI напрямую — токен
// эта страница никогда не видит, куки ставит сервер (docs/plan-web-admin.md).

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Step = "identifier" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Не удалось отправить код");
      setDebugCode(data.debug_code ?? null);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Неверный код");
      router.push("/teams");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[var(--text)] tracking-tight">player.pro</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">Кабинет тренера и врача</p>
        </div>

        <form
          onSubmit={step === "identifier" ? requestCode : verifyCode}
          className="bg-[var(--surface)] border border-[var(--border)] p-6 space-y-4"
        >
          {step === "identifier" ? (
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1.5">Email</label>
              <input
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="coach@club.ru"
                required
                autoFocus
                className="w-full bg-[var(--surface)] border border-[var(--border-strong)] rounded-sm px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1.5">
                Код из письма на {identifier}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
                className="w-full bg-[var(--surface)] border border-[var(--border-strong)] rounded-sm px-3 py-2.5 text-sm text-[var(--text)] tracking-[0.3em] text-center placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              {debugCode && (
                <p className="text-xs text-[var(--text-faint)] mt-1.5">Debug-код: {debugCode}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep("identifier");
                  setCode("");
                  setError("");
                }}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] mt-2"
              >
                Изменить email
              </button>
            </div>
          )}

          {error && <p className="text-[var(--risk)] text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-medium py-2.5 rounded-sm text-sm transition-colors"
          >
            {loading ? "Подождите…" : step === "identifier" ? "Получить код" : "Войти"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-faint)] mt-4">
          Доступ — только для тренерского штаба и врача
        </p>
      </div>
    </div>
  );
}
