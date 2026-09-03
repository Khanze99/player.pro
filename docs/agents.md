# AI-агенты проекта

Специализированные субагенты проекта. Лежат в `.claude/agents/` — Claude Code подхватывает
их оттуда автоматически. Каждый файл — frontmatter (`name`, `description`, `tools`) плюс
роль, принципы работы и чеклист.

Вызов: по имени (`используй python-senior`) или автоматически по `description`.
Локальные настройки в `.claude/` игнорируются git, а `.claude/agents/` — версионируется.

| Агент | Файл | Когда использовать |
|---|---|---|
| **Executor** | [executor.md](../.claude/agents/executor.md) | Большая фича, затрагивающая несколько слоёв |
| **Python Senior** | [python-senior.md](../.claude/agents/python-senior.md) | Реализация сервисов, рефакторинг, архитектура |
| **API Designer** | [api-designer.md](../.claude/agents/api-designer.md) | Проектирование REST-эндпоинтов |
| **DB Architect** | [db-architect.md](../.claude/agents/db-architect.md) | Схема БД, миграции, индексы, запросы |
| **Tester** | [tester.md](../.claude/agents/tester.md) | Тесты pytest |
| **Code Reviewer** | [code-reviewer.md](../.claude/agents/code-reviewer.md) | Качество кода перед мержем |
| **Security Auditor** | [security-auditor.md](../.claude/agents/security-auditor.md) | Персональные и медицинские данные, доступ, OWASP |

## Как это устроено

Агенты описаны **абстрактно** — принципами и правилами, а не пересказом текущего кода.
Проектная специфика (стек, слои, команды, формулы) — в `CLAUDE.md` и
`PlayerPro_TZ_final.md`; они источник правды, здесь она не дублируется, чтобы описания
не расходились с реальностью при каждом изменении.

Базовые инженерные принципы, общие для всех агентов, — раздел «Принципы Роберта Мартина»
в [python-senior.md](../.claude/agents/python-senior.md): чистый код, SOLID, чистая архитектура,
компонентные принципы, TDD.

## Скиллы и команды

| Вызов | Файл | Что делает |
|---|---|---|
| `/preparing [фича]` | [commands/preparing.md](../.claude/commands/preparing.md) → [skills/preparing/SKILL.md](../.claude/skills/preparing/SKILL.md) | Подготовка фичи до кода: сверка с ТЗ, разведка, развилки, план в `docs/plan-*.md` |

Логика лежит в скилле (`.claude/skills/`) — его вызывает и сам Клод, когда видит, что
начинается фича. Файл в `.claude/commands/` нужен только для того, чтобы то же самое
можно было запустить руками как слэш-команду.

## Типичные цепочки

```
Новая фича          api-designer → db-architect* → python-senior → tester → code-reviewer
Изменение схемы БД  db-architect → python-senior → tester → security-auditor*
Новый эндпоинт      api-designer → python-senior → tester → code-reviewer
Рефакторинг         python-senior → tester → code-reviewer

* db-architect       — если меняется схема данных
* security-auditor   — обязателен, если затронуты персональные или медицинские данные
```
