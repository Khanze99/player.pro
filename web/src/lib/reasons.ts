// Тексты reason-кодов командной сводки — сервер отдаёт только машиночитаемые
// коды (backend/app/services/dashboard_service.py: "текст подставляет клиент"),
// тот же список, что в mobile/src/i18n/ru.ts (dashboard.reason.*).
import type { AlertReason } from "@/types";

export const reasonLabel: Record<AlertReason, string> = {
  low_readiness: "низкая готовность",
  low_sleep: "мало сна",
  low_energy: "низкая энергия",
  low_mood: "плохое настроение",
  high_stress: "высокий стресс",
  high_soreness: "сильная боль в мышцах",
  high_load: "перегруз",
  rising_load: "рост нагрузки",
  undertraining: "недогруз",
  injury: "травма",
  unavailable: "недоступен",
  hr_flag: "пульс покоя выше нормы",
  no_survey: "нет опроса",
};
