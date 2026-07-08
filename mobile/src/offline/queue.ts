// Офлайн-очередь опросов/RPE (раздел 11 ТЗ): при отсутствии сети записи копятся
// в AsyncStorage и отправляются при следующем удобном случае.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { NetworkError, post } from '../api/client';

const QUEUE_KEY = 'pp_offline_queue';

interface QueuedItem {
  path: string;
  body: unknown;
}

async function readQueue(): Promise<QueuedItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedItem[]) : [];
}

export async function enqueue(path: string, body: unknown): Promise<void> {
  const queue = await readQueue();
  queue.push({ path, body });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Пытается отправить накопленное. Останавливается на первой сетевой ошибке. */
export async function flushQueue(): Promise<number> {
  const queue = await readQueue();
  let sent = 0;
  for (const item of queue) {
    try {
      await post(item.path, item.body);
      sent += 1;
    } catch (e) {
      if (e instanceof NetworkError) break;
      sent += 1; // 4xx (дубль/конфликт) — из очереди убираем, повторять бессмысленно
    }
  }
  if (sent > 0) {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(sent)));
  }
  return sent;
}

/** POST с офлайн-фолбэком: true — ушло сразу, false — легло в очередь. */
export async function postOrQueue(path: string, body: unknown): Promise<boolean> {
  try {
    await post(path, body);
    return true;
  } catch (e) {
    if (e instanceof NetworkError) {
      await enqueue(path, body);
      return false;
    }
    throw e;
  }
}
