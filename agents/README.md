# Backend AI Agents

Описание специализированных AI агентов для разработки backend.

| Агент | Файл | Когда использовать |
|---|---|---|
| **Executor** | [executor.md](executor.md) | Большая фича, затрагивающая несколько слоёв |
| **Python Senior** | [python-senior.md](python-senior.md) | Реализация сервисов, рефакторинг, архитектура |
| **Tester** | [tester.md](tester.md) | Написание pytest тестов |
| **Code Reviewer** | [code-reviewer.md](code-reviewer.md) | Проверка качества кода перед мержем |
| **Security Auditor** | [security-auditor.md](security-auditor.md) | Проверка PHI/PII, аутентификация, OWASP |
| **DB Architect** | [db-architect.md](db-architect.md) | Схема БД, миграции, индексы, pgmq |
| **API Designer** | [api-designer.md](api-designer.md) | Проектирование REST эндпоинтов |

## Типичные цепочки вызовов

**Новая фича:**
`executor` → `python-senior` → `tester` → `code-reviewer`

**Изменения схемы БД:**
`db-architect` → `python-senior` → `tester` → `security-auditor` (если PHI)

**Новый API эндпоинт:**
`api-designer` → `python-senior` → `tester` → `code-reviewer`

**Работа с данными пациентов:**
любой агент → `security-auditor` в конце обязательно
