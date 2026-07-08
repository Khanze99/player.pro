from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    auth,
    availability,
    dashboard,
    events,
    injuries,
    organizations,
    rpe,
    teams,
    users,
    wellness,
)

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router)
router.include_router(users.router)
router.include_router(organizations.router)
router.include_router(teams.router)
router.include_router(wellness.router)
router.include_router(rpe.router)
router.include_router(events.router)
router.include_router(availability.router)
router.include_router(injuries.router)
router.include_router(analytics.router)
router.include_router(dashboard.router)
