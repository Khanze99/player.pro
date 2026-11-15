# Агенты и скиллы проекта

## Codex

Общие инструкции — в корневом `AGENTS.md`. Для mobile и web дополнительно действуют
вложенные `AGENTS.md`. Профили Claude перенесены в `.agents/skills/` как именованные
скиллы Codex. Их выполняет основная сессия; отдельный субагент автоматически не создаётся.

| Вызов | Назначение | Инструкции |
|---|---|---|
| `$executor` | Декомпозиция и критерии приёмки | [SKILL.md](../.agents/skills/executor/SKILL.md) |
| `$python-senior` | Backend, сервисы, рефакторинг | [SKILL.md](../.agents/skills/python-senior/SKILL.md) |
| `$api-designer` | REST-контракты | [SKILL.md](../.agents/skills/api-designer/SKILL.md) |
| `$db-architect` | PostgreSQL, Alembic, индексы | [SKILL.md](../.agents/skills/db-architect/SKILL.md) |
| `$tester` | Backend-тесты на PostgreSQL | [SKILL.md](../.agents/skills/tester/SKILL.md) |
| `$code-reviewer` | Ревью без изменения кода | [SKILL.md](../.agents/skills/code-reviewer/SKILL.md) |
| `$security-auditor` | Доступ и защита данных | [SKILL.md](../.agents/skills/security-auditor/SKILL.md) |
| `$preparing` | Подготовка фичи, только план | [SKILL.md](../.agents/skills/preparing/SKILL.md) |
| `$release-checklist` | Чек-лист выкладки по diff | [SKILL.md](../.agents/skills/release-checklist/SKILL.md) |
| `$brag-slim` | Launch-видео | [SKILL.md](../.agents/skills/brag-slim/SKILL.md) |

Примеры: `$preparing дневник травм для врача`, `$code-reviewer проверь текущий diff`,
`$release-checklist составь шаги выкладки текущего релиза`.
Можно также попросить применить роль по имени обычным текстом.

Типичная цепочка backend-фичи: api-designer → db-architect (при изменении схемы) →
python-senior → tester → code-reviewer. Для изменений прав, персональных или медицинских
данных дополнительно применяется security-auditor. Это этапы работы основной сессии.
Отдельные субагенты используются только при разрешённом делегировании.

Если поручена реализация, Codex продолжает после подготовки без повторного разрешения
на уже порученную работу. Явный `$preparing` ограничивается планом.
`$release-checklist` составляет инструкции и сам по себе не поручает деплой.

## Claude Code

Исходные `.claude/agents/`, `.claude/skills/`, `.claude/commands/` и `CLAUDE.md`
сохранены. В Claude остаются прежние имена агентов и `/preparing`.
При изменении общих правил сверять `AGENTS.md` и `CLAUDE.md`, при изменении профилей —
соответствующие версии инструкций. Существующий скилл brag-slim не изменён.
