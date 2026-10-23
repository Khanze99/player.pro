# План: график веса и ИМТ

Статус: **проектирование завершено, код не начат.** Дата составления: 2026-10-23.

Дополняет `PlayerPro_TZ_final.md` — там веса/антропометрии нет вообще (раздел 6
знает только Readiness/ACWR/Availability). Опирается на уже реализованное:
`docs/plan-profile.md` (`AthleteProfile.height_cm`/`weight_kg`, спецкатегория
`body_metrics`, `ensure_can_view_sensitive`) и пересекается с рисками из
`docs/plan-women-health-nutrition.md` (счётчик калорий/вес как фактор риска РПП) —
пересечение разбирается ниже, не замалчивается.

Черновик экранов обсуждён и подтверждён в артефакте
(`https://claude.ai/code/artifact/ae279f4c-3069-4926-81dd-033050045d8d`).

## Решения, принятые в обсуждении 2026-10-23

- **Формула — ИМТ (BMI), не EA/RED-S.** `ИМТ = вес(кг) / рост(м)²`, категории ВОЗ
  (дефицит <18.5 / норма 18.5–24.9 / избыток 25–29.9 / ожирение ≥30). EA/RED-S
  (`plan-women-health-nutrition.md`, «Этап 3») — другая, более тяжёлая фича: тащит
  дневник питания + состав тела (калипер), ни того ни другого не просили. Не делаем.
- **Видимость — тренеру и врачу одинаково.** Это осознанный выбор пользователя,
  отличный от принципа «не выводить вес тренеру» из `plan-women-health-nutrition.md`
  (там речь про калории/дефицит дневника питания — отдельная фича, отдельный риск).
  Технически это НЕ новое правило: используем ту же спецкатегорию `body_metrics` и
  тот же `ensure_can_view_sensitive`, что уже гейтит рост/вес в профиле — решает
  согласие самого игрока на обе аудитории (`ConsentAudience.coach`/`medic`), а не
  специальное «тренеру нельзя». Если игрок даст согласие обеим аудиториям — видно
  обеим, ровно как с ростом/весом сегодня.
- **Без цели веса.** Набрать/сбросить с конкретной цифрой — не делаем сейчас,
  это прямо то, от чего отказались в women-health-nutrition («не показывать
  агрессивный дефицит как цель»). Открытый вопрос на будущее, не блокирует.
- **Рекомендации — текст по категории ИМТ, не расчёт плана.** Короткая фраза,
  направляет к врачу команды, без цифр калорийности/БЖУ и без императива
  «похудей». ИМТ не учитывает состав тела — об этом отдельная строка в самой
  карточке (мышечный спортсмен может ложно попасть в «избыток»), не молчим про
  это ограничение.
- **Вес в опросе — необязательное поле, как сон/пульс.** Не входит в
  `done`/`complete`. Отправленное значение **синхронизируется в
  `AthleteProfile.weight_kg`** («последнее известное») — чтобы профиль не
  расходился с графиком. Это сознательно иначе, чем `resting_hr`/
  `baseline_resting_hr`: там baseline — осознанно стабильный ориентир для
  сравнения, у веса такой семантики нет, у него «текущее» и есть «текущее».
- **Источник точек графика — `WellnessEntry.weight_kg`** (дневная серия), а не
  отдельная таблица: тот же приём, что уже применяли бы для разовых числовых
  полей опроса (`sleep_hours`, `resting_hr`) — не плодим сущность ради одного
  nullable-столбца.
- **ИМТ не хранится, считается на лету** (`core/calculations.py`) из текущего
  `height_cm`/`weight_kg` — не денормализуем в `DailyMetric`, это не входит в
  Readiness/ACWR.

## Зачем

Игрок/тренер/врач видят тренировочную нагрузку и готовность, но не видят, как
меняется вес — а резкий набор/потеря веса у футболиста — значимый сигнал
(нагрузка на суставы, риск травм, форма). ИМТ даёт быстрый ориентир «в группе
риска или нет» без дополнительных измерений (состав тела калипером не делаем —
его просто нет в проекте).

## Что уже есть

- `AthleteProfile.height_cm` (`SmallInteger`, CHECK 100–250), `weight_kg`
  (`Numeric(4,1)`, CHECK 30–250) — текущее значение, редактируется в профиле
  (`(tabs)/profile.tsx`), спецкатегория `body_metrics`.
- `GET/PUT /users/me/profile`, `GET /users/athletes/{id}/profile` — последний уже
  нулит `height_cm`/`weight_kg` при отсутствии `ensure_can_view_sensitive(scope=
  body_metrics)` (`api/v1/users.py:athlete_profile`), но **никто его не вызывает**
  ни на мобилке, ни на вебе — висит неиспользуемым.
- `WellnessEntry` — дневная запись, уже есть прецеденты необязательных числовых
  полей (`sleep_hours`, `resting_hr`) и child-таблиц для деталей
  (`pain_points`, `recovery_methods`).
- `GET /wellness/athletes/{athlete_id}` (`api/v1/wellness.py`) — отдаёт полный
  `WellnessOut` и coach, и medic через один и тот же `ensure_can_view_athlete`,
  без доп. гейтов (прецедент из `plan-recovery-methods.md`).
- Визуальный прецедент графика — `ReadinessSparkline.tsx` (мобилка, react-native-svg,
  полилиния + градиентная область + подпись последней точки) и
  `LoadChart.tsx`/`ReadinessTrendChart` (веб, тот же паттерн на чистом `<svg>`).
- Веб: `athletes/[athleteId]/page.tsx` уже верстает `LoadChart`+`ReadinessTrendChart`
  в одной сетке — туда же встаёт новая карточка.

## Данные и миграции

Одна миграция, `make migration m="wellness weight"` из `backend/`, ревью, `make upgrade`.

`wellness_entries`:
| колонка | тип | примечание |
|---|---|---|
| `weight_kg` | `Numeric(4,1)` null, CHECK 30–250 | те же границы, что у `athlete_profiles.weight_kg` |

Откат — drop колонки, данных не теряет (её ещё нет). Денормализации в
`DailyMetric` нет — аналитика не меняется.

## API

### `core/calculations.py` (новые чистые функции, юнит-тесты)
```python
BMI_UNDERWEIGHT = 18.5
BMI_OVERWEIGHT = 25.0
BMI_OBESE = 30.0

def bmi(height_cm: int | None, weight_kg: Decimal | None) -> float | None:
    """None, если рост или вес не заполнены — защита от деления на ноль не нужна,
    height_cm > 0 гарантирован CHECK-ом в БД."""

def bmi_zone(value: float | None) -> str:
    """underweight | normal | overweight | obese | no_data."""
```

### `schemas/wellness.py`
`WellnessCreateIn`/`WellnessOut` + `weight_kg: Decimal | None = Field(default=None,
ge=30, le=250, decimal_places=1)` — те же границы, что `AthleteProfileIn.weight_kg`.

### `schemas/user.py`
`AthleteProfileOut` + `bmi: float | None`, `bmi_zone: str | None` — считаются в
роуте после финального `height_cm`/`weight_kg` (после гейта sensitive, не до —
иначе значение ИМТ утечёт даже при нулированном весе).

### `wellness_service.create_entry`
После `entry = WellnessEntry(...)`: если `payload.get("weight_kg")` не `None` —
upsert `AthleteProfile.weight_kg` тем же значением (создать профиль, если его нет,
как в `users_service.upsert_profile`). Тот же приём, что уже есть в этой функции
для `cycle_service.record_from_wellness` — кросс-сервисный вызов рядом.

### `api/v1/wellness.py` — `GET /wellness/athletes/{athlete_id}`
Для `user.id != athlete_id`: `try: await authz.ensure_can_view_sensitive(db, user,
athlete_id, ConsentScope.body_metrics) except HTTPException: занулить weight_kg во
всех записях ответа`. Тот же приём, что `athlete_profile` в `users.py`, применённый
к списку, а не к одному объекту. `GET /wellness/me` не трогаем — себе всегда всё.

### `api/v1/users.py` — `my_profile` / `athlete_profile`
После финального `height_cm`/`weight_kg` (после гейта в `athlete_profile`):
`out.bmi = calculations.bmi(out.height_cm, out.weight_kg)`,
`out.bmi_zone = calculations.bmi_zone(out.bmi)`.

Коды ошибок не меняются (403/404 уже есть). Пагинация не применима.

## Права доступа

Не вводим новое правило. `weight_kg`/`bmi`/`bmi_zone` — та же спецкатегория
`body_metrics`, тот же `ensure_can_view_sensitive`, что уже гейтит рост/вес в
профиле. «Тренеру и врачу одинаково» — это поведение уже заложено в
`consent_service.covers`/`ConsentAudience`: если игрок даст согласие и coach, и
medic, видно обеим ролям; разводить их здесь искусственно не нужно.

## Аналитика

**Не применимо** — ИМТ не входит в Readiness/ACWR/`DailyMetric`, считается на
лету из текущих `height_cm`/`weight_kg`, пересчёт не требуется.

## Мобильный клиент

- `api/types.ts`: `weight_kg` в `WellnessEntry`/`WellnessCreatePayload`; `bmi`,
  `bmi_zone` в `AthleteProfile`.
- Новый компонент `components/WeightSparkline.tsx` — по образцу
  `ReadinessSparkline`, но динамический Y (`min`/`max` по точкам, не фикс 0–100),
  точки — только дни с `weight_kg !== null` (разреженный ряд, как опрос вообще).
- `wellness.tsx`: поле «Вес» (необязательно) рядом с «Часов сна»/«Пульс покоя»,
  тот же `TextInput`, decimal-фильтр (`v.replace(/[^\d.]/g, '')`), границы 30–250
  как в `profile.tsx:saveNumber`.
- `(tabs)/index.tsx` (`PlayerHome`): добавить `useMyProfile()` (хук уже есть),
  карточка «Вес» после `actions` — текущее значение + `WeightSparkline` +
  бейдж `bmi_zone` (цвет через `status.good/caution/risk`) + строка рекомендации.
  Пустое состояние (ни одной отметки) — приглашение заполнить, не пустая карточка
  (см. артефакт, вариант «без истории»).
- `athlete/[id]/index.tsx` (отчёт тренера/врача): добавить фетч профиля атлета
  (эндпоинт уже есть, хука на него пока нет — завести `useAthleteProfile(id)` в
  `api/hooks.ts`), та же карточка, `weight_kg=null`/`bmi=null` → нейтральное
  «Недостаточно данных» (одна формулировка для «нет согласия» и «нет данных»,
  как уже принято у `body_metrics`/цикла).
- i18n (ru/en/es, все три): `wellness.weightLabel`, `wellness.weightOptional`,
  `wellness.weightUnit`, `home.weightTitle`, `home.weightEmptyNudge`,
  `bmi.zone.{underweight,normal,overweight,obese}`,
  `bmi.note.{underweight,normal,overweight,obese}`, `bmi.caveat` (про состав тела),
  `dayDetail.weightInsufficientData`.

## Веб

- `lib/api.ts`: добавить `athleteProfile(athleteId, token)` → `GET
  /users/athletes/{id}/profile` (сейчас не вызывается вообще).
- `lib/types.ts`: `weight_kg` в `WellnessEntry`; новый тип или расширение
  существующего под `AthleteProfileOut` (`bmi`, `bmi_zone`, `height_cm`,
  `weight_kg`).
- Новый компонент `WeightCard` (в `LoadChart.tsx`, по образцу
  `ReadinessTrendChart`, светлая клиническая палитра) — та же сетка, что
  `LoadChart`+`ReadinessTrendChart` в `athletes/[athleteId]/page.tsx`.
  `bmi === null` → карточка с «Недостаточно данных» (как `CycleCard`, который
  просто не рендерит секцию при `null`; здесь рендерим пустую карточку, не
  скрываем целиком — чтобы тренер не терялся, куда делась карточка).

## Персональные и медицинские данные

- `weight_kg`/`bmi`/`bmi_zone` — спецкатегория `body_metrics`, уже описанная в
  `plan-profile.md`: себе всегда, штабу по согласию. Новых категорий не вводим.
- Не логировать: вес (как и сейчас не логируется при правках профиля).
- Изменение веса через опрос не аудируем — как и сейчас остальные правки
  wellness/профиля; аудит sharing уже покрыт `consent_service`.

## Выкатка

- Фича-флага нет — аддитивно и низкорискованно, как и профиль/карта боли/
  восстановительные процедуры до этого (прецедент `plan-profile.md`,
  `plan-recovery-methods.md`).
- Миграция вручную `make upgrade` до деплоя бэкенда.
- Порядок: бэкенд → клиенты (мобилка + веб). Старый клиент новое поле `WellnessOut`
  игнорирует; новый клиент против старого бэкенда — `weight_kg`/`bmi` просто не
  приходят, карточка показывает пустое состояние, не падает.
- Старые записи: `weight_kg` nullable, обратной миграции данных не требуется.

## Этапность

Один этап, без промежуточных срезов — объём сопоставим с уже выкаченными
картой боли и восстановительными процедурами.

## Декомпозиция

```
1. [db-architect]      миграция wellness_entries.weight_kg + CHECK
                        → make upgrade и make downgrade проходят чисто
2. [python-senior]      core/calculations.py: bmi()/bmi_zone()
                        → make lint чист
3. [python-senior]      схемы (WellnessCreateIn/Out, AthleteProfileOut) +
                        wellness_service (sync в AthleteProfile) +
                        роуты (bmi в users.py, нулирование weight_kg в wellness.py)
                        → в роутах нет логики, make lint чист
4. [tester]             тесты: bmi() границы (18.5/25/30, None-кейсы), submit
                        веса синхронизирует профиль, authz-нулирование
                        weight_kg в /wellness/athletes/{id} (coach без
                        согласия видит null, с согласием — значение, self —
                        всегда значение), миграция up/down
                        → make test зелёный
5. [security-auditor]   body_metrics-гейт на новом поле, утечка через
                        bmi/bmi_zone при отсутствии согласия, что не
                        логируется
                        → заключение
6. [mobile]             api/types.ts, WeightSparkline, поле в wellness.tsx,
                        карточка в (tabs)/index.tsx + athlete/[id]/index.tsx,
                        useAthleteProfile, i18n ru/en/es
                        → tsc/eslint чисты
7. [web]                lib/api.ts (athleteProfile), WeightCard, встраивание в
                        athletes/[athleteId]/page.tsx
                        → tsc/eslint чисты
8. [code-reviewer]      ревью всего диффа
```

## Риски

- **ИМТ медицински слаб для мускулистых спортсменов** (мышцы тяжелее жира,
  может ложно показать «избыток» у здорового атлета) — снято явной строкой-
  предупреждением в самой карточке, не молчим про ограничение метода.
- **Текст рекомендаций — черновой**, не юридически/медицински вычитанный
  (как и согласие в women-health — «нужен юрист», здесь нужен врач/методист на
  финальную формулировку). Не блокирует реализацию, формулировки правятся без
  миграции.
- **Видимость тренеру — осознанное отступление** от принципа
  `plan-women-health-nutrition.md`. Задокументировано здесь как сознательное
  решение этого пользователя для этой фичи, не тихая отмена того решения —
  если возникнет проблема (давление на игрока по весу от тренера), это
  решается отзывом согласия самим игроком (`privacy.tsx`), механизм уже есть.

## Открытые вопросы

- **Цель веса (набрать/сбросить)** — отложена, не в объёме. Где её заводить
  (по тапу на график — предложение пользователя) решать отдельным `/preparing`,
  когда до неё дойдёт очередь.
- **Текст рекомендаций по категориям** — финальная формулировка за
  врачом/методистом команды, не за разработкой.
