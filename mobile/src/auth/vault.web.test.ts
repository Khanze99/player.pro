import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// Бэкенд секретов подменяем in-memory Map. Она живёт в области файла, поэтому
// переживает jest.resetModules() — это и есть «перезагрузка вкладки»: у vault.web
// сбрасывается память (memRefresh/memKey), а «localStorage» остаётся.
const mockStore = new Map<string, string>();

jest.mock('./storage', () => ({
  secureStorage: {
    get: (k: string) => Promise.resolve(mockStore.has(k) ? mockStore.get(k)! : null),
    set: (k: string, v: string) => {
      mockStore.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      mockStore.delete(k);
      return Promise.resolve();
    },
  },
}));

type Vault = typeof import('./vault.web');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (): Vault => require('./vault.web');

const WRAP_KEY = 'pp_refresh_wrap';
const ATTEMPTS_KEY = 'pp_pin_attempts';

beforeEach(() => {
  mockStore.clear();
  jest.resetModules();
});

describe('vault.web — состояние до PIN', () => {
  test('чистый старт: ни PIN, ни сохранённой сессии, ни токена', async () => {
    const v = load();
    expect(await v.hasPin()).toBe(false);
    expect(await v.hasStoredSession()).toBe(false);
    expect(await v.getRefreshToken()).toBeNull();
  });

  test('saveRefreshToken до PIN держит токен только в памяти, на диск не пишет', async () => {
    const v = load();
    await v.saveRefreshToken('rt-onboarding');
    expect(await v.getRefreshToken()).toBe('rt-onboarding');
    expect(await v.hasPin()).toBe(false);
    expect(mockStore.has(WRAP_KEY)).toBe(false);
  });
});

describe('vault.web — установка PIN', () => {
  test('savePin шифрует токен: в блобе нет плейнтекста, форма корректна', async () => {
    const v = load();
    const secret = 'rt-super-secret-payload-9f3a';
    await v.saveRefreshToken(secret);
    await v.savePin('1234');

    expect(await v.hasPin()).toBe(true);
    const raw = mockStore.get(WRAP_KEY)!;
    expect(raw).toBeDefined();
    expect(raw).not.toContain(secret);

    const blob = JSON.parse(raw) as Record<string, unknown>;
    expect(blob.v).toBe(1);
    expect(typeof blob.salt).toBe('string');
    expect(typeof blob.iv).toBe('string');
    expect(typeof blob.ct).toBe('string');
    expect(typeof blob.iterations).toBe('number');
    expect(blob.iterations as number).toBeGreaterThanOrEqual(100_000);

    // токен по-прежнему доступен в памяти этой «вкладки»
    expect(await v.getRefreshToken()).toBe(secret);
  });

  test('savePin без токена в памяти — ошибка (PIN нечего защищать)', async () => {
    const v = load();
    await expect(v.savePin('1234')).rejects.toThrow();
  });
});

describe('vault.web — разблокировка после перезагрузки', () => {
  const setup = async (pin: string, token: string) => {
    const v1 = load();
    await v1.saveRefreshToken(token);
    await v1.savePin(pin);
    jest.resetModules(); // «перезагрузка вкладки»
    return load();
  };

  test('после перезагрузки: блоб есть, токен из памяти пропал', async () => {
    const v = await setup('4321', 'rt-reload');
    expect(await v.hasStoredSession()).toBe(true);
    expect(await v.hasPin()).toBe(true);
    expect(await v.getRefreshToken()).toBeNull();
  });

  test('верный PIN восстанавливает refresh-токен, возвращает null', async () => {
    const v = await setup('4321', 'rt-reload-value');
    const res = await v.verifyPin('4321');
    expect(res).toBeNull();
    expect(await v.getRefreshToken()).toBe('rt-reload-value');
  });

  test('юникод в токене переживает шифрование/расшифровку', async () => {
    const token = 'rt-Юникод-テスト-🎽- end';
    const v = await setup('1234', token);
    await v.verifyPin('1234');
    expect(await v.getRefreshToken()).toBe(token);
  });
});

describe('vault.web — счётчик попыток PIN', () => {
  const locked = async () => {
    const v1 = load();
    await v1.saveRefreshToken('rt-attempts');
    await v1.savePin('1111');
    jest.resetModules();
    return load();
  };

  test('неверный PIN уменьшает остаток попыток', async () => {
    const v = await locked();
    expect(await v.verifyPin('0000')).toBe(4);
    expect(await v.verifyPin('0000')).toBe(3);
  });

  test('после 5 неверных — 0 (сигнал на откат к OTP)', async () => {
    const v = await locked();
    const seq: (number | null)[] = [];
    for (let i = 0; i < 5; i++) seq.push(await v.verifyPin('0000'));
    expect(seq).toEqual([4, 3, 2, 1, 0]);
  });

  test('верный PIN сбрасывает счётчик', async () => {
    const v = await locked();
    await v.verifyPin('0000');
    await v.verifyPin('0000');
    expect(await v.verifyPin('1111')).toBeNull();
    // счётчик обнулён: следующий промах снова начинается с 4
    expect(await v.verifyPin('0000')).toBe(4);
  });

  test('verifyPin без блоба возвращает MAX_PIN_ATTEMPTS', async () => {
    const v = load();
    expect(await v.verifyPin('0000')).toBe(v.MAX_PIN_ATTEMPTS);
  });
});

describe('vault.web — смена PIN и очистка', () => {
  test('смена PIN: старый перестаёт открывать, новый открывает', async () => {
    let v = load();
    await v.saveRefreshToken('rt-change-pin');
    await v.savePin('1234');
    await v.savePin('5678'); // смена PIN из профиля: сессия активна, токен в памяти

    jest.resetModules();
    v = load();
    expect(await v.verifyPin('1234')).toBe(4); // старый PIN отвергнут
    expect(await v.verifyPin('5678')).toBeNull(); // новый работает
    expect(await v.getRefreshToken()).toBe('rt-change-pin');
  });

  test('clearVault стирает блоб, счётчик и память', async () => {
    const v = load();
    await v.saveRefreshToken('rt-clear');
    await v.savePin('3333');
    await v.verifyPin('0000'); // оставить след в счётчике

    await v.clearVault();

    expect(await v.hasPin()).toBe(false);
    expect(await v.hasStoredSession()).toBe(false);
    expect(await v.getRefreshToken()).toBeNull();
    expect(mockStore.has(WRAP_KEY)).toBe(false);
    expect(mockStore.has(ATTEMPTS_KEY)).toBe(false);
  });
});
