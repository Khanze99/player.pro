from fastapi import APIRouter, Depends

from app.api.deps import require_consented
from app.api.v1 import (
    account,
    analytics,
    auth,
    availability,
    branding,
    consent,
    cycle,
    dashboard,
    events,
    exercises,
    features,
    injuries,
    medical_exams,
    notifications,
    nutrition,
    organizations,
    rpe,
    season_stats,
    teams,
    users,
    wellness,
    workout_sessions,
    workouts,
)

router = APIRouter(prefix="/api/v1")

# auth, consent и account без гейта require_consented: /auth/* должен работать до
# онбординга (refresh/logout/me), а /consents/policy иначе блокировал бы сам себя.
router.include_router(auth.router)
router.include_router(consent.router)
# account тоже без гейта: удалиться можно, не принимая новую редакцию документов
# (экран consent → «Не согласен, удалить аккаунт», docs/plan-legal-texts.md).
router.include_router(account.router)

# features/branding уже требуют CurrentUser (авторизация), но не завязаны на
# согласие: в потоке онбординга экран consent идёт сразу после логина и не
# нуждается в теме/флагах, поэтому исключений под них не делаем — гейтим как
# остальные приватные ресурсы.
_consented = Depends(require_consented)

router.include_router(features.router, dependencies=[_consented])
router.include_router(branding.router, dependencies=[_consented])
router.include_router(users.router, dependencies=[_consented])
router.include_router(cycle.router, dependencies=[_consented])
router.include_router(nutrition.router, dependencies=[_consented])
router.include_router(organizations.router, dependencies=[_consented])
router.include_router(teams.router, dependencies=[_consented])
router.include_router(wellness.router, dependencies=[_consented])
router.include_router(rpe.router, dependencies=[_consented])
router.include_router(notifications.router, dependencies=[_consented])
router.include_router(events.router, dependencies=[_consented])
router.include_router(exercises.router, dependencies=[_consented])
router.include_router(workouts.router, dependencies=[_consented])
router.include_router(workout_sessions.router, dependencies=[_consented])
router.include_router(availability.router, dependencies=[_consented])
router.include_router(injuries.router, dependencies=[_consented])
router.include_router(medical_exams.router, dependencies=[_consented])
router.include_router(analytics.router, dependencies=[_consented])
router.include_router(dashboard.router, dependencies=[_consented])
router.include_router(season_stats.router, dependencies=[_consented])
