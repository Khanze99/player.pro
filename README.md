# player.pro


правки:
1. при регистрации, вернуться назад
2. Инвайт код при добавлении, есть ли. Допустим у нас инвайт от оргов, мы просто вводим почту и там же надо ввести отп пароль
3. как создается тренер и роли? где смотреть дашборд всех спортсменов?
4. как создаются евенты, как привязывать евенты к спортсменам?
5. как создается организация?
6. где добавление своей тренировки?
7. так же при прохождении теста с утра, нужно чуть переделать:
   1. убрать смайлы
   2. вместо цифр сделать прогресс бар типа, и по бокам минус и плюс, где заполняется этот прогресс бар от 1 до 10
   3. момент где недомогание - soreness добавить привязку новой сущности, это будет такой человечек нарисованный и пунктиром обозначены основные части тела, и что болит то и указывать, это тоже вписывать в отчет бд и при аналитике
   4. добавить поле комментарий
   5. добавить варианты injury и symptmom
8. по тренировке тоже rpe надо сделать от 1 до 10 и соответственно привязка к событию
9. добавить календарь с евентами, просмотр календаря

 Context: React Native + Expo mobile app (mobile/), FastAPI backend (backend/). Source of truth: PlayerPro_TZ_final.md. Roles: global admin/staff/player; team-level head_coach/coach/medic/athlete. Core
  loop: daily wellness survey + post-session RPE → Readiness / ACWR / Availability.

  A. Onboarding & Auth

  1. Back navigation during registration — Build
  Add a "Back" affordance across the onboarding flow (src/app/(auth)/: welcome → otp → profile-setup → org-choice → org-create → pin-setup). Currently the flow is forward-only via router.push/replace.
  Requirements:
  - Header back button (or swipe-back) on every step except the first.
  - Going back must preserve entered data (email, name, etc.) and not re-trigger OTP send.
  - On the OTP screen, "Back" should return to identifier entry so the user can correct a typo.

  2. Invite code — Question + Build
  Clarify the invite model. Target UX: an org admin invites a user; the user just enters their email, and on the same screen enters the OTP — no separate invite code to type.
  - Confirm whether a dedicated invite code exists in the backend or if the invite is bound purely to the email/phone (recommended: bind to identifier, no code to type).
  - If invited, after OTP the user should be auto-attached to the org/team and skip org-choice/org-create, going straight to profile-setup → pin-setup. (The current AuthGate already routes org_id-present
  users past org setup — verify this covers the invite case.)
  - Decision needed: are invites single-use, time-limited, and role-preset (e.g. invited as athlete vs coach)?

  5. Organization creation — Question + verify
  Document/verify the current flow: org-choice → org-create (org name + first team) → backend POST /organizations + POST /teams. Confirm the creator becomes admin + head_coach. If this already works, this
  item is "document only"; if not, implement.

  B. Roles, Staff & Dashboards

  3. Coach creation, roles, and athlete dashboard — Question + Build (likely missing)
  Two parts:
  - Creating staff/coaches: define how an admin invites/creates a staff user and assigns team roles (head_coach/coach/medic). Likely needs: an admin "Invite staff" flow (email + role + team) reusing the
  invite mechanism from item 2.
  - Athlete dashboard for staff: there is currently no coach-facing roster/dashboard in the mobile app — it's athlete-first. Build a team dashboard: list of all athletes with Readiness (color), Load/ACWR
  zone, and Availability status; tap-through to an athlete detail. Respect the medic/coach data split from CLAUDE.md (medic sees medical detail; coach sees aggregates/statuses only). This is a substantial
  new surface — flag for scoping.

  C. Events / Sessions / Calendar (shared new domain)

  ▎ Dependency note: items 4, 8, and 9 all require an Event/Session entity that does not exist yet. Recommend building this first as a foundation: a backend Event model (team_id, type [training/match/other],
  ▎ title, starts_at, duration_min, optional location) plus athlete linkage (event_participants join, or per-athlete assignment). Then RPE and the calendar build on top.

  4. Event creation & linking athletes — Build (new)
  - Coach/admin creates events for a team (single or recurring).
  - Assign events to specific athletes or the whole team (event_participants).
  - Backend: models, Pydantic schemas, POST/GET/PATCH/DELETE /events, authz (only staff of that team can create).

  8. Training RPE 1–10 + event linkage — Build
  - Note: the exertion scale is already CR10 1–10 (src/components/RpeScale.tsx). Confirm what's requested: (a) also convert the "performance" self-rating from 1–5 → 1–10, and/or (b) keep exertion as-is.
  Please specify.
  - Link RPE to an event: add optional event_id FK on the RPE entry. In the RPE screen (src/app/rpe.tsx), let the athlete pick which assigned event this RPE is for. session_load = RPE × minutes stays; if
  linked to an event, prefer the event's duration_min as the default.

  9. Calendar with events — Build (new)
  - Calendar view (month/week) showing the athlete's assigned events; tap an event → details → "Rate load (RPE)" for it (ties into item 8).
  - Staff calendar shows the full team schedule.
  - Suggest a maintained RN calendar lib compatible with Expo (agent to pick; verify against Expo SDK 57).

  D. Morning Wellness Survey redesign (src/app/wellness.tsx, ScaleRow, backend wellness model + Readiness formula)

  7.1 Remove emojis — Build
  Drop the emoji from each scale row and any emoji labels; keep clean text labels only.

  7.2 Replace 1–5 number buttons with a 1–10 progress-bar stepper — Build
  - New control: a horizontal progress/fill bar with minus on the left and plus on the right; the bar fills proportionally to the value, range 1–10.
  - Important dependency: wellness scales are currently 1–5 Likert, and the Readiness formula normalizes 1–5 (weights: sleep .25, energy .25, soreness .20, stress .15, mood .15 — see CLAUDE.md §Analytics /
  backend calculations). Moving to 1–10 requires updating the normalization (raw 1–10 → 0–100) and any stored-data assumptions. This must be done in lockstep or the Readiness score breaks. Flag as a
  coordinated FE+BE change.

  7.3 Soreness → body pain-map (new entity) — Build
  Replace/augment the soreness input with an interactive body map: a drawn human figure with major body regions outlined (dashed), front/back; the athlete taps the regions that hurt.
  - Store as a new structured entity (e.g. SorenessMap / pain_points: list of { region, side (L/R/center), severity }), linked to the daily wellness entry.
  - Persist to DB and feed analytics — decision needed: does the map drive the soreness sub-score for Readiness, or is it recorded alongside the existing 1–10 soreness value? (Recommend: keep a single
  overall soreness value for the score + the map as detail for medic/coach.)
  - Needs a fixed body-region taxonomy (define the list of regions).

  7.4 Comment field — Build
  Add an optional free-text comment to the wellness entry (FE input + backend column + include in reports). Keep it optional to preserve the "60-second survey" goal.

  7.5 Injury / symptom options — Build
  Today injury/symptom are boolean toggles + free-text details. Add structured options (predefined lists/dropdowns), e.g. injury type/body area and symptom type, while keeping an "other + free text"
  fallback. Persist structured values and surface them in reports/analytics.

  6. "Add your own training" — Question + Build
  Clarify: is this for personal-mode athletes (no org) to log an ad-hoc self-created session, separate from coach-assigned events? If so, add a "Log training" entry point that creates a self-owned session
  (date, type, duration) which the RPE flow can attach to — reusing the Event model from Section C but self-created and self-scoped.

  ---
  Cross-cutting flags for the implementer
  
  - Formula coupling: any 1–5 → 1–10 change (7.2) must update the Readiness normalization and be covered by tests (CLAUDE.md requires analytics formulas be tested). Don't ship the UI without the backend
  change.
  Add an optional free-text comment to the wellness entry (FE input + backend column + include in reports). Keep it optional to preserve the "60-second survey" goal.

  7.5 Injury / symptom options — Build
  Today injury/symptom are boolean toggles + free-text details. Add structured options (predefined lists/dropdowns), e.g. injury type/body area and symptom type, while keeping an "other + free text"
  fallback. Persist structured values and surface them in reports/analytics.

  6. "Add your own training" — Question + Build
  Clarify: is this for personal-mode athletes (no org) to log an ad-hoc self-created session, separate from coach-assigned events? If so, add a "Log training" entry point that creates a self-owned session
  (date, type, duration) which the RPE flow can attach to — reusing the Event model from Section C but self-created and self-scoped.

  ---
  Cross-cutting flags for the implementer

  - Formula coupling: any 1–5 → 1–10 change (7.2) must update the Readiness normalization and be covered by tests (CLAUDE.md requires analytics formulas be tested). Don't ship the UI without the backend
  change.
  - Sequencing: build the Event/Session model (C) before RPE-linkage (8) and calendar (9). Build the invite mechanism (2) before staff invites (3).
  - Backend layering: thin routes + service layer, Pydantic v2, authz in app/core/authz.py, tests hit real Postgres (no mocks) — per CLAUDE.md.
  - New entities to migrate: Event, event_participants, SorenessMap/pain points, wellness comment + structured injury/symptom, RPE event_id. (Alembic is post-MVP; currently create_all.)
  - Open decisions to confirm before coding: invite single-use/role-preset (2); performance scale 1–5 vs 1–10 (8); soreness-map's role in the Readiness score (7.3); personal-mode training scope (6).
