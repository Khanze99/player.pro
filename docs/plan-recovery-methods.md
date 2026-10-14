# План: восстановительные процедуры в wellness-опросе

Статус: **проектирование, код не начат.** Дата составления: 2026-10-14.

Дополняет ТЗ: в `PlayerPro_TZ_final.md` и `docs/functionality.md` восстановительные
процедуры не упоминаются вообще — раздела 6 (аналитика) это не касается, в формулы
не входит. Пересечения с существующими `docs/plan-*.md` нет.

Решения, принятые в обсуждении 2026-10-14:
- Хранение — отдельная таблица `recovery_method_logs` (FK на `wellness_entries`),
  не Postgres ARRAY и не строка через запятую. В проекте уже два прецедента именно
  такого устройства для мультивыбора на одну запись: `PainPoint` (карта боли) и
  `CycleSymptomLog` (симптомы цикла) — обе через дочернюю таблицу «одна строка на
  значение». Повторяю это устройство, а не придумываю третий способ.
- 4 фиксированных варианта, enum `RecoveryMethod`: `massage` (Массаж), `compression`
  (Компрессия), `cryo_compression` (Крио компрессия), `physio` (Физиолечение).
  Без «другое» — список закрытый, расширять не просили.
- Поле **необязательное** — как `comment`, `resting_hr`, `sleep_hours`: можно не
  выбрать ничего (вчера не было процедур), сабмит опроса это не блокирует.
- На Readiness/ACWR не влияет — как и карта боли, это деталь для отчёта, не вес
  в формуле. Пересчёт `DailyMetric` не трогаем.
- Права доступа — без новых правил. Эндпоинт `GET /wellness/athletes/{id}` уже
  отдаёт carte blanche и coach, и medic одним и тем же `ensure_can_view_athlete`
  (так же, как сейчас с `pain_points`/заметками — мед. детализация от тренерской
  здесь исторически не разделена на уровне этого эндпоинта, это не новая дыра,
  я её не создаю и не расширяю).
- UI — новый компонент `RecoveryMethods` по образцу `BodyMap`: один компонент,
  `value` + опциональные `onChange`/`readOnly`, используется и в опросе
  (интерактивно), и в отчёте (только просмотр). Не трогаю `OptionChips` — он
  типизирован под одиночный выбор (`value: T | null`) и используется для
  injury/symptom type; переиспользование его визуального стиля — да, его API — нет.
- Без фича-флага и миграции данных назад: поле новое, старые записи просто без
  выбранных процедур (пустой список), как и у pain_points при добавлении карты боли.

## Зачем

Тренеру/врачу нужно видеть не только как спортсмен себя чувствует, но и что он
делал вчера для восстановления — массаж/компрессия/крио/физио — как контекст к
самочувствию и решениям по нагрузке.

## Что уже есть

`WellnessEntry` + дочерняя `PainPoint` — ровно тот шаблон, который повторяется.
Экран опроса (`wellness.tsx`) и отчёт по дню (`athlete/[id]/index.tsx`) уже читают
один и тот же `WellnessOut` с бэкенда, доп. полей на фронте добавлять в контракт
клиента, кроме схемы, не нужно.

## Данные и миграции

```python
# app/models/enums.py
class RecoveryMethod(str, enum.Enum):
    massage = "massage"
    compression = "compression"
    cryo_compression = "cryo_compression"
    physio = "physio"
```

```python
# app/models/recovery_method.py (новый файл, по образцу pain_point.py)
class RecoveryMethodLog(Base):
    __tablename__ = "recovery_method_logs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("wellness_entries.id"), index=True)
    method: Mapped[RecoveryMethod] = mapped_column(String(20))
    entry: Mapped["WellnessEntry"] = relationship(back_populates="recovery_methods")
```

`WellnessEntry.recovery_methods: Mapped[list["RecoveryMethodLog"]]` — `relationship`
с `cascade="all, delete-orphan", lazy="selectin"`, тем же способом, что и `pain_points`.

Миграция — `make migration m="recovery method logs"` (autogenerate), ревью, `make upgrade`.
Откат — `make downgrade`, дропает таблицу, данных не теряет (её ещё нет).

## API

```python
# schemas/wellness.py
class WellnessCreateIn(BaseModel):
    ...
    recovery_methods: list[RecoveryMethod] = Field(default_factory=list, max_length=4)

class WellnessOut(BaseModel):
    ...
    recovery_methods: list[RecoveryMethod] = Field(default_factory=list)
```

Обёрточная схема (`RecoveryMethodIn`/`Out`, как у `PainPointIn`/`Out`) не нужна —
у точки нет своих полей кроме самого значения enum, в отличие от боли (`severity`,
`note`). Плоский список enum проще и ничего не теряет.

Сервис (`wellness_service.create_entry`): `set(payload.pop("recovery_methods", []))`
(на дубли с фронта — защита, не ожидается, но дёшево), `entry.recovery_methods =
[RecoveryMethodLog(method=m) for m in methods]`, тем же паттерном, что `pain_points`
на соседней строке.

Эндпоинт `GET /wellness/athletes/{id}` и вывод в `wellness_service.get_history` не
меняются — `recovery_methods` приезжает вместе с остальными полями `WellnessOut`.

## Права доступа

Не применимо: новое правило не нужно, эндпоинт уже общий для coach/medic
(`ensure_can_view_athlete`), поле не более чувствительное, чем `comment`/`pain_points`.

## Мобильный клиент

- `api/types.ts` — тип `RecoveryMethod`, поле `recovery_methods: RecoveryMethod[]`
  в `WellnessEntry`/`WellnessCreatePayload` (точные имена — по месту).
- Новый компонент `components/RecoveryMethods.tsx`: 4 чипа, `value`,
  `onChange?`, `readOnly?` — по образцу `BodyMap`.
- `wellness.tsx`: секция «Восстановительные процедуры вчера» после травмы/
  недомогания, перед комментарием. Необязательна, в `done`/`complete` не
  участвует (как карта боли вне порога и часы сна).
- `athlete/[id]/index.tsx`: в карточке дня — список выбранных процедур
  (`RecoveryMethods readOnly`), пустое состояние `dayDetail.noRecovery`
  («Процедур не было»), тем же паттерном, что `noPain`/`noInjury`/`noSymptom`.
- `i18n/{ru,en,es}.ts`: `wellness.recoveryTitle`, `wellness.recoveryMethod.*`
  (4 ключа), `dayDetail.recovery`, `dayDetail.noRecovery`.

## Этапность

Один этап, без фича-флага — объём и риск сопоставимы с уже выкаченной картой боли.

## Декомпозиция

```
1. [python-senior]  enum + модель + relationship на WellnessEntry → make lint чист
2. [db-architect]    make migration + ревью файла + make upgrade/downgrade    → применяется и откатывается
3. [python-senior]  схемы + wellness_service                                  → make lint чист
4. [tester]          тест: сохранение, дедуп дублей, чтение через /wellness/athletes/{id} → make test зелёный
5. [python-senior]  api/types.ts, i18n×3, компонент RecoveryMethods           → tsc/eslint чисты
6. [python-senior]  wellness.tsx (ввод) + athlete/[id]/index.tsx (отчёт)      → оба экрана собираются
```

security-auditor не привлекаю: поле не мед. тайна выше уровня уже собираемых
(comment/pain_points), новых путей утечки не создаёт.

## Риски

Минимальные — геометрии/расчётов не трогаем, наложение на Readiness нулевое.

## Открытые вопросы

Нет — весь объём и 4 варианта заданы явно в запросе, развилок с разным кодом
на выходе не возникло.
