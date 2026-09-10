// Хранилище секретов сессии (веб). В браузере secure-store нет, а класть refresh-токен
// в localStorage открытым нельзя (XSS, чужой доступ к машине). Поэтому:
//
//  • PIN не хранится вообще — ни хэшом. Из PIN через PBKDF2-SHA256 выводится ключ
//    AES-GCM, которым шифруется refresh-токен. В localStorage лежит только блоб
//    {salt, iv, iterations, ct}. Неверный PIN → тег GCM не сходится → «неверный код».
//  • Расшифрованный refresh-токен и производный ключ живут только в памяти вкладки.
//    Перезагрузка до ввода PIN → refresh недоступен → экран PIN (или OTP, если PIN
//    ещё не ставили). Так и задумано.
//
// Интерфейс совпадает с vault.ts (нативным) — session и экраны платформу не различают.

import { secureStorage } from './storage';

const KEYS = {
  wrap: 'pp_refresh_wrap',
  pinAttempts: 'pp_pin_attempts',
} as const;

export const MAX_PIN_ATTEMPTS = 5;

// OWASP-ориентир для PBKDF2-SHA256. 4-значный PIN всё равно перебирается за 10⁴
// попыток, итерации — это защита в глубину: дамп блоба без вычислений бесполезен.
// Число едет в блобе, поднять позже можно без поломки старых блобов.
const PBKDF2_ITERATIONS = 210_000;

interface WrapBlob {
  v: 1;
  salt: string;
  iv: string;
  iterations: number;
  ct: string;
}

// Живёт только в памяти вкладки, на диск не попадает.
let memRefresh: string | null = null;
let memKey: CryptoKey | null = null;

const dec = new TextDecoder();

// Явный ArrayBuffer под капотом: SubtleCrypto-типы (Pbkdf2Params.salt, AesGcmParams.iv)
// в свежем lib.dom не принимают Uint8Array<ArrayBufferLike>.
function bytes(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(n));
}

function toB64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = bytes(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function encode(text: string): Uint8Array<ArrayBuffer> {
  const s = unescape(encodeURIComponent(text));
  const out = bytes(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrap(
  key: CryptoKey,
  token: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<WrapBlob> {
  const iv = crypto.getRandomValues(bytes(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encode(token));
  return {
    v: 1,
    salt: toB64(salt),
    iv: toB64(iv),
    iterations: PBKDF2_ITERATIONS,
    ct: toB64(new Uint8Array(ct)),
  };
}

async function readBlob(): Promise<WrapBlob | null> {
  const raw = await secureStorage.get(KEYS.wrap);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as WrapBlob;
    if (b.v !== 1 || !b.salt || !b.iv || !b.ct) return null;
    return b;
  } catch {
    return null;
  }
}

const writeBlob = (b: WrapBlob): Promise<void> => secureStorage.set(KEYS.wrap, JSON.stringify(b));

const getAttempts = async (): Promise<number> =>
  Number((await secureStorage.get(KEYS.pinAttempts)) ?? '0');
const setAttempts = (n: number): Promise<void> =>
  secureStorage.set(KEYS.pinAttempts, String(n));

export const getRefreshToken = async (): Promise<string | null> => memRefresh;

/**
 * До установки PIN (онбординг) — просто держим токен в памяти. Если PIN уже стоит
 * (смена PIN, будущая ротация токена) — перешифровываем блоб тем же ключом.
 */
export async function saveRefreshToken(token: string): Promise<void> {
  memRefresh = token;
  if (memKey) {
    const blob = await readBlob();
    if (blob) await writeBlob(await wrap(memKey, token, fromB64(blob.salt)));
  }
}

export async function savePin(pin: string): Promise<void> {
  if (memRefresh == null) {
    // PIN всегда ставится после OTP в той же вкладке — токен в памяти есть.
    throw new Error('vault.web: no refresh token in memory to protect with PIN');
  }
  const salt = crypto.getRandomValues(bytes(16));
  const key = await deriveKey(pin, salt, PBKDF2_ITERATIONS);
  await writeBlob(await wrap(key, memRefresh, salt));
  memKey = key;
  await setAttempts(0);
}

export const hasPin = async (): Promise<boolean> => (await readBlob()) !== null;

/** На вебе продолжать нечего без блоба: refresh без PIN не сохраняется. */
export const hasStoredSession = hasPin;

/** null — верный PIN; число — осталось попыток; 0 — попытки кончились (откат на OTP). */
export async function verifyPin(pin: string): Promise<number | null> {
  const blob = await readBlob();
  if (!blob) return MAX_PIN_ATTEMPTS;
  try {
    const key = await deriveKey(pin, fromB64(blob.salt), blob.iterations);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(blob.iv) },
      key,
      fromB64(blob.ct),
    );
    memRefresh = dec.decode(pt);
    memKey = key;
    await setAttempts(0);
    return null;
  } catch {
    // Неверный PIN (тег не сошёлся) либо битый блоб — и то, и то жжёт попытку.
    const n = (await getAttempts()) + 1;
    await setAttempts(n);
    return Math.max(0, MAX_PIN_ATTEMPTS - n);
  }
}

export async function clearVault(): Promise<void> {
  memRefresh = null;
  memKey = null;
  await secureStorage.delete(KEYS.wrap);
  await secureStorage.delete(KEYS.pinAttempts);
}
