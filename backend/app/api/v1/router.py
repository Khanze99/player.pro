from fastapi import APIRouter, Depends

from app.api.deps import require_consented
from app.api.v1 import (
    analytics,
    auth,
    availability,
    branding,
    consent,
    cycle,
    dashboard,
    events,
    features,
    injuries,
    nutrition,
    organizations,
    rpe,
    teams,
    users,
    wellness,
)

router = APIRouter(prefix="/api/v1")

# auth и consent — без гейта require_consented: /auth/* должен работать до
# онбординга (refresh/logout/me), а /consents/policy иначе блокировал бы сам себя.
router.include_router(auth.router)
router.include_router(consent.router)

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
router.include_router(events.router, dependencies=[_consented])
router.include_router(availability.router, dependencies=[_consented])
router.include_router(injuries.router, dependencies=[_consented])
router.include_router(analytics.router, dependencies=[_consented])
router.include_router(dashboard.router, dependencies=[_consented])
