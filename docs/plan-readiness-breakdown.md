# План: детальная разбивка Readiness Score по критериям

Статус: **реализовано** (шаги 1–6 из декомпозиции; 7–8 — см. примечание внизу). Дата составления: 2026-09-22, реализация — 2026-09-22.

Дополняет ТЗ: раздел 6.4 описывает саму формулу Readiness, но не предусматривает её
детализацию на экране — это решение расширяет функциональность сверх раздела 6.4/3.2,
явно как ответ на фидбэк пользователя («непонятно, по каким критериям идёт просадка»).
Текущее состояние — `docs/functionality.md` разделы 4.2 (Readiness), 4.4 (DailyMetric),
6 (что видит штаб): сейчас везде отдаётся только итоговый балл + зона + флаги, сырые
компоненты (`mood`, `energy`, `sleep_quality`, `stress`, `soreness`) видны только как
дублирующиеся 1–10 значения в `WellnessOut`, без нормализации и весов — тренер должен
сам в уме умножать на веса, чтобы понять, что тянет балл вниз.

Решения, принятые в обсуждении 2026-09-22:

- **Отдельный экран по тапу на игрока** (не мини-бары в строке Squad Status) — список
  на 25+ игроков и так плотный, а разбивка требует места под 5 критериев + модификатор.
  Тот же паттерн, что и у `event/[id].tsx` — карточка списка кликабельна, детали на
  отдельном экране.
- **Разбивка за день + агрегат за период** (не только по дню) — коуч должен видеть не
  только «сегодня просело из-за сна», но и «за 7/28 дней в среднем сильнее всего тянет
  вниз стресс». День — для конкретного случая, период — для тренда.
- **Заодно уточняются reason-коды в `/dashboard/teams/{id}/summary`** — код причины
  `low_readiness` в списке «у кого что не так» становится конкретным
  (`low_sleep` / `low_energy` / `low_mood` / `high_stress` / `high_soreness`), это тот же
  вопрос с точки зрения тренера, просто на уровне команды, а не одного игрока.
- **Не храним разбивку в БД, считаем на лету.** В отличие от EWMA/ACWR, Readiness за
  день — не рекуррентная величина: она полностью выводится из одной строки
  `WellnessEntry` за этот день плюс `baseline_resting_hr` из профиля. Раскладка на
  компоненты — это просто промежуточные значения той же чистой функции, а не новая
  формула, требующая пересчёта истории. Никакой миграции не нужно, старые данные
  (WellnessEntry уже есть с самого начала) показываются сразу.
- **Компоненты — не мед. деталь.** `mood/energy/sleep_quality/stress/soreness` уже
  видны тренеру в разных формах (readiness сам по себе, флаги на Squad Status) — это не
  спецкатегория вроде карты боли/описания травмы/`body_metrics`. Доступ к разбивке —
  тот же `authz.ensure_can_view_athlete`, что и у `/analytics/athletes/{id}/metrics`,
  без отдельного согласия.
- **Новая схема ответа не включает `injury_details`/`symptom_details`/`pain_points`/
  `comment`** — только 5 числовых критериев + модификатор пульса + булевы флаги
  травмы/болезни. Обнаружена смежная проблема: существующий
  `GET /wellness/athletes/{id}` отдаёт эти медицинские поля любому штабу с общей
  командой (не только медику), что противоречит принципу «мед. деталь — только у
  медика» из `docs/functionality.md`. Это **не в объёме этого плана** — фиксирую в
  разделе «Риски», чтобы не потерялось, но не трогаю задним числом.
- **Без фича-флага.** Аддитивное чтение поверх уже существующих данных, ничего не
  ломает и не выключаемо (в отличие от питания/цикла, где включена новая категория
  персданных).

## Зачем

Тренер/врач видит в Squad Status и в командной сводке, что у игрока просел Readiness
или он попал в список «у кого что не так», но не видит — почему. Формула прозрачная
(раздел 6.4 ТЗ), но нигде не показывается разложенной. Разбивка нужна, чтобы:

- тренер понимал, что делать — не спать игроку, снижать стресс, беречь ушиб;
- врач видел паттерн — постоянно низкое качество сна у конкретного игрока за 28 дней,
  а не разовый провал;
- фраза «у кого что не так» в сводке команды стала конкретной, а не общим
  `low_readiness`.

## Что уже есть

- `app/core/calculations.readiness()` — чистая функция, считает `readiness_base`
  через `Σ norm_i × вес_i`, но норм. значения и вклад каждого компонента не
  возвращаются наружу, теряются внутри функции.
- `GET /analytics/athletes/{id}/metrics` и `GET /analytics/me/metrics` — отдают ряд
  `DailyMetric` (только итоговый балл/зону/флаги) за период, authz —
  `ensure_can_view_athlete`.
- `GET /wellness/athletes/{id}` — отдаёт сырые `WellnessEntry` за период (избыточно,
  включая мед. детали — см. риски выше), но именно оттуда можно достать 5 сырых
  компонентов на конкретный день.
- Squad Status (`CoachHome.tsx`) — список игроков, строки **не тапабельны**, перехода
  никуда нет.
- `history.tsx` (свой прогресс игрока) — есть спарклайн Readiness за 14 дней, но без
  разбивки по критериям.
- `dashboard_service._alerts()` — уже строит список причин с машиночитаемыми кодами
  (`low_readiness`, `high_load`, `injury`, …), клиент подставляет текст через
  `t('dashboard.reason.<код>')` — паттерн для новых кодов уже есть, ничего изобретать
  не нужно.
- **Тестовая группа по чекапам — уже есть, отдельно делать не нужно.**
  `backend/scripts/seed_demo.py` (`make seed-reset`) уже гоняет 25 игроков с разными
  архетипами самочувствия (`green/yellow/red/mixed`, полосы `WELLNESS_BANDS` по каждому
  критерию отдельно) на 30 дней истории — это и есть «рандомная тестовая группа по
  чекапам». После реализации плана — прогнать `make seed-reset` и визуально проверить
  разбивку на игроках с разными архетипами (у `mixed` разные критерии будут тянуть вниз
  в разные дни, у `red` — почти все сразу, удобно для проверки сортировки по дефициту).

## Данные и миграции

Нет. Ничего не храним — считаем на лету из `WellnessEntry` + `AthleteProfile` при
каждом запросе. Обоснование — см. решения выше.

## Формулы (`app/core/calculations.py`)

Рефакторинг `readiness()`: выносим тело в новую `readiness_breakdown()`, `readiness()`
становится тонкой обёрткой над ней (не дублирует взвешенную сумму, существующие тесты
`test_calculations.py` продолжают проходить без изменений — поведение идентично).

```python
@dataclass
class ComponentBreakdown:
    key: str            # sleep_quality | energy | mood | soreness | stress
    value: int           # сырое 1–10
    normalized: float    # 0–100
    weight: float
    contribution: float  # normalized * weight — очков заработано (0..100*weight)
    deficit: float        # weight*100 - contribution — очков потеряно относительно максимума

@dataclass
class ReadinessBreakdown:
    components: list[ComponentBreakdown]  # отсортированы по deficit убыв. — самый вклад в просадку первым
    base_score: float     # Σ contribution, до модификатора и клампа
    hr_modifier: float     # 0 или RESTING_HR_PENALTY
    hr_flag: bool
    unavailable_flag: bool
    score: int
    zone: str
```

Свойство для теста: `Σ deficit_i == 100 - base_score` (веса суммируются в 1.0) — это
и есть «на сколько очков в сумме просело от максимума», а порядок компонентов по
`deficit` — прямой ответ на «по каким критериям идёт просадка».

Агрегат за период — отдельная функция `readiness_breakdown_average(breakdowns:
list[ReadinessBreakdown]) -> ...`: среднее `value`/`normalized`/`contribution`/`deficit`
по каждому `key` среди дней, где `WellnessEntry` существовал (пропущенный день — не
ноль, тот же принцип, что и в разделе 4.2 ТЗ), плюс среднее `score`. Не пытаемся
усреднять `hr_modifier`/флаги — это точечные события дня, не измеряемая величина.

## API

Новые эндпоинты в `app/api/v1/analytics.py`, тот же паттерн `me`/`athletes/{id}`, что
у `/metrics`:

- `GET /analytics/me/readiness-breakdown?date=YYYY-MM-DD` (обязательный `date` — клиент
  уже знает валидные даты из истории/метрик, не гадаем на бэкенде «последний день»)
- `GET /analytics/athletes/{id}/readiness-breakdown?date=…` — `authz.ensure_can_view_athlete`
- `GET /analytics/me/readiness-breakdown/average?date_from=&date_to=` (по умолчанию
  последние 7 дней, как `LOAD_WINDOW_DAYS`; клиент может запросить 28)
- `GET /analytics/athletes/{id}/readiness-breakdown/average?date_from=&date_to=` — тот
  же authz

Оба «дневных» эндпоинта — `404` («Опрос за эту дату не найден»), если `WellnessEntry`
на `date` нет (день без опроса — это отсутствие данных, а не нулевой балл).

Схемы (`app/schemas/metric.py`):

```python
class ReadinessComponentOut(BaseModel):
    key: str
    value: float          # int на дневном эндпоинте, среднее на /average
    normalized: float
    weight: float
    contribution: float
    deficit: float

class ReadinessBreakdownOut(BaseModel):
    date: date_type
    components: list[ReadinessComponentOut]  # отсортированы по deficit убыв.
    hr_modifier: float
    hr_flag: bool
    injury: bool
    symptom: bool
    unavailable_flag: bool
    score: int
    zone: str

class ReadinessBreakdownAverageOut(BaseModel):
    date_from: date_type
    date_to: date_type
    days_with_data: int
    components: list[ReadinessComponentOut]
    avg_score: float | None
```

Расширение командной сводки (`app/schemas/dashboard.py`, `AlertReason` на клиенте):
новые коды `low_sleep` / `low_energy` / `low_mood` / `high_stress` / `high_soreness`
вместо `low_readiness`, когда причина определима (а она определима всегда, когда
`readiness_zone == "red"`, потому что балл вообще посчитан только если был опрос в этот
день). `low_readiness` остаётся как защитный фолбэк, если по какой-то причине разбивку
получить не удалось — не должно происходить в норме, но не роняем сводку на этом.

## Права доступа

- Дневная и агрегатная разбивка — `ensure_can_view_athlete` (свои данные / общая
  команда для staff / admin организации), как у `/analytics/*/metrics`. Никакой новой
  сенситивной категории, согласие не требуется (см. решения выше).
- Командная сводка с уточнёнными кодами — доступ не меняется, это то же место,
  что и сейчас (`team_summary`, командная роль по `authz.py`).

## Мобильный клиент

- **Новый переиспользуемый компонент `ReadinessBreakdownCard`** (`mobile/src/components/`):
  список из 5 критериев, бар пропорционален `deficit` (самый длинный бар = главная
  причина просадки), сверху — бар/строка модификатора пульса, если `hr_flag`, и бейджи
  травмы/болезни, если флаги стоят. Один компонент, переиспользуется в двух местах ниже.
- **`history.tsx`** (свой прогресс) — карточка `ReadinessBreakdownCard` для последнего
  дня с опросом (дата берётся из уже загруженного `useMetrics`, не гадаем на бэкенде).
  Переключатель день/7д/28д переиспользует ту же карточку поверх `/average`.
- **Новый экран `mobile/src/app/athlete/[id].tsx`** — открывается тапом по строке
  `PlayerRow` в `CoachHome.tsx` (`PlayerRow` становится `Pressable`, `router.push`,
  параметры — `id` + `name`, тот же паттерн, что у `event/[id].tsx`). Состав экрана:
  шапка (имя, зона Readiness, ACWR), `LoadBars`/`ReadinessSparkline` за 28 дней
  (переиспечь из `history.tsx` — вынести в `mobile/src/components/`, чтобы не
  дублировать), `ReadinessBreakdownCard` за последний день + переключатель на
  агрегат 7/28.
- **`dashboard.tsx` (`AlertRow`)** — без изменений в коде: новые коды `low_sleep` и
  т.д. проходят через существующий `t('dashboard.reason.${reason}')`, нужно только
  добавить строки в локали и расширить union `AlertReason` в `mobile/src/api/types.ts`.
- **i18n** — новые ключи в `ru.ts`/`en.ts`/`es.ts`: подписи 5 критериев + модификатора
  пульса для `ReadinessBreakdownCard`, заголовок экрана `athlete/[id]`, 5 новых
  `dashboard.reason.*`.
- Состояния: нет опроса за день → карточка «нет данных за этот день» (а не пустая/0);
  меньше 2 дней с опросом в окне → агрегат «недостаточно данных», тот же паттерн, что
  `history.accumulatingHint`.

## Этапность

Всё делается за один заход — фича замкнутая, разрезать на релизы незачем (в отличие от
«фундамент → фичи» из `project_change_brief_2026_07`, где были независимые модули).

## Декомпозиция

1. **[python-senior]** `readiness_breakdown()` + `readiness_breakdown_average()` в
   `app/core/calculations.py`, рефакторинг `readiness()` поверх неё
   → существующие тесты `test_calculations.py` зелёные без изменений, `ruff` чист.
2. **[api-designer]** Контракт: `ReadinessComponentOut`/`ReadinessBreakdownOut`/
   `ReadinessBreakdownAverageOut`, 4 новых роута в `analytics.py`, новые коды в
   `AlertReason`/`TeamAlertOut.reasons` → схемы и коды ошибок (404 на день без опроса)
   описаны и согласованы с существующим паттерном `me`/`athletes/{id}`.
3. **[python-senior]** Сервисный слой: `analytics_service.get_readiness_breakdown_day`,
   `get_readiness_breakdown_average`; в `dashboard_service` — батч-запрос
   `WellnessEntry` + `baseline_resting_hr` по команде на день сводки, замена
   `low_readiness` на конкретный код в `_alerts()` → `make lint` чист, в роутах нет
   бизнес-логики.
4. **[python-senior]** Роуты поверх сервисов (`analytics.py`) → тонкие, без запросов к БД.
5. **[tester]** Тесты: свойство `Σ deficit == 100 - base_score` в
   `test_calculations.py`; `test_analytics.py` — 404 без опроса на дату, доступ через
   `ensure_can_view_athlete` (свой/чужая команда/чужая организация), агрегат с
   пропущенными днями; `test_dashboard.py` — новые reason-коды в `/summary`, фолбэк на
   `low_readiness` → `make test` зелёный.
6. **python-senior (мобильный клиент)**: `ReadinessBreakdownCard`, вынос
   `LoadBars`/`ReadinessSparkline` в общие компоненты, экран `athlete/[id].tsx`, тап по
   `PlayerRow`, карточка в `history.tsx`, i18n (ru/en/es) → экран собирается, три
   локали синхронны, пустые состояния на месте.
7. **[security-auditor]** Точечная проверка: разбивка не протекает
   injury_details/symptom_details/pain_points/comment ни в одном новом эндпоинте; новые
   reason-коды в сводке не раскрывают medic-only детали тренеру → есть выявленная
   смежная проблема `GET /wellness/athletes/{id}` (см. риски) — зафиксировать отдельным
   пунктом, не фиксить в этом плане.
8. **[code-reviewer]** Ревью изменений целиком.

## Риски

- **Не в объёме, но обнаружено:** `GET /wellness/athletes/{id}` отдаёт
  `injury_details`/`symptom_details`/`pain_points`/`comment` любому штабу с общей
  командой (не только медику) — противоречит заявленному разделению
  «мед. деталь — только у медика» (`docs/functionality.md`, раздел 6). Новый код этого
  не касается и не использует этот эндпоинт, но стоит завести отдельную задачу.
- Агрегат за период — N дополнительных вызовов чистой функции на каждый запрос
  (`days_with_data` ≤ 28), не запрос к БД в цикле — риска по НФТ дашборда нет, т.к.
  все `WellnessEntry` за период читаются одним батч-запросом.
- Сортировка reason-кодов в `_alerts()` по `-len(reasons)` не изменится — просто один
  из кодов стал конкретнее, порядок и `severity` не трогаем.

## Открытые вопросы

Нет — все развилки закрыты в обсуждении 2026-09-22.

## Примечание о реализации (2026-09-22)

Шаги 1–6 сделаны в этом заходе: формулы + рефакторинг `readiness()`, схемы, сервисный
слой (`get_readiness_breakdown_day/average`), 4 роута в `analytics.py`, reason-коды в
`dashboard_service._alerts`, тесты (`test_calculations.py`, `test_analytics.py`,
`test_authz.py`, обновлён `test_dashboard.py`), мобильный клиент (`ReadinessBreakdownCard`,
`ReadinessBreakdownSection`, `LoadBars`/`ReadinessSparkline` вынесены в общие компоненты,
экран `athlete/[id].tsx`, тап по строке в `CoachHome`, карточка в `history.tsx`, i18n
ru/en/es). `make lint`/`ruff check`/весь backend-набор (240 тестов) и `tsc --noEmit` +
`expo lint` — зелёные.

Шаг 7 (security-auditor) и шаг 8 (code-reviewer) — не запускались в рамках этого захода;
даю по шагу 7 замену — see «Риски»: проверено вручную, что новые эндпоинты и reason-коды
не используют `injury_details`/`symptom_details`/`pain_points`/`comment` (grep по коду).
Формальный проход security-auditor/code-reviewer стоит сделать перед мёржем.

Тестовая группа по чекапам — не сидировалась в рамках этого захода (`make seed-reset`
не запускался); инструмент готов и не менялся, прогон — на усмотрение пользователя перед
визуальной проверкой.
