"""Питание: снапшот нутриентов, витрины штаба, защита от агрессивного дефицита.

Ключевое здесь — тренер не получает калории ни при каком согласии: счётчик
калорий у спортсменов связан с риском РПП (docs/plan-women-health-nutrition.md).
"""

import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core import authz
from app.models.enums import (
    ConsentScope,
    CustomFoodKind,
    FoodCategory,
    FoodSource,
    GlobalRole,
    MealType,
    TeamRole,
    UserStatus,
)
from app.models.nutrition import FoodItem
from app.models.organization import Organization
from app.models.team import Team, TeamMembership
from app.models.user import User
from app.schemas.nutrition import FoodItemIn, FoodLogIn, NutritionTargetIn
from app.services import nutrition_service
from tests.conftest import register_user


async def _world(db) -> dict:
    org = Organization(name="Клуб")
    db.add(org)
    await db.flush()
    team = Team(org_id=org.id, name="Основа")
    db.add(team)
    await db.flush()

    def make(name: str, role: GlobalRole) -> User:
        user = User(
            org_id=org.id,
            last_name=name,
            email=f"{name}-{uuid.uuid4().hex[:8]}@test.com",
            global_role=role,
            status=UserStatus.active,
        )
        db.add(user)
        return user

    athlete = make("athlete", GlobalRole.player)
    coach = make("coach", GlobalRole.staff)
    medic = make("medic", GlobalRole.staff)
    await db.flush()
    for user, role in [
        (athlete, TeamRole.athlete),
        (coach, TeamRole.coach),
        (medic, TeamRole.medic),
    ]:
        db.add(TeamMembership(user_id=user.id, team_id=team.id, team_role=role))

    chicken = FoodItem(
        source=FoodSource.curated,
        name="Куриная грудка",
        kcal_100g=137,
        protein_100g=29.8,
        fat_100g=1.8,
        carbs_100g=0.5,
        verified=True,
    )
    db.add(chicken)
    await db.commit()
    return {"athlete": athlete, "coach": coach, "medic": medic, "chicken": chicken}


# ------------------------------------------------------------------ подсчёт


async def test_nutrients_scaled_from_100g(db):
    world = await _world(db)
    entry = await nutrition_service.add_entry(
        db,
        world["athlete"].id,
        FoodLogIn(date=date.today(), meal=MealType.lunch, food_item_id=world["chicken"].id, grams=150),
    )
    assert entry.kcal == pytest.approx(205.5)  # 137 × 1.5
    assert entry.protein == pytest.approx(44.7)


async def test_entry_is_a_snapshot_immune_to_catalog_edits(db):
    """Правка справочника не должна переписывать уже съеденное."""
    world = await _world(db)
    athlete_id = world["athlete"].id
    today = date.today()

    await nutrition_service.add_entry(
        db,
        athlete_id,
        FoodLogIn(date=today, meal=MealType.lunch, food_item_id=world["chicken"].id, grams=100),
    )
    # Кто-то уточнил состав продукта задним числом
    world["chicken"].kcal_100g = 500
    await db.commit()

    day = await nutrition_service.get_day(db, athlete_id, today)
    assert day.totals.kcal == pytest.approx(137)  # осталось как было


async def test_day_groups_by_meal_and_sums(db):
    world = await _world(db)
    athlete_id = world["athlete"].id
    today = date.today()

    for meal, grams in [(MealType.breakfast, 100), (MealType.lunch, 200)]:
        await nutrition_service.add_entry(
            db,
            athlete_id,
            FoodLogIn(date=today, meal=meal, food_item_id=world["chicken"].id, grams=grams),
        )

    day = await nutrition_service.get_day(db, athlete_id, today)
    assert day.totals.kcal == pytest.approx(411)  # 137 + 274
    breakfast = next(m for m in day.meals if m.meal == MealType.breakfast)
    assert breakfast.totals.kcal == pytest.approx(137)
    assert len(day.meals) == len(MealType)  # пустые приёмы пищи тоже присутствуют


async def test_free_form_entry_without_catalog_item(db):
    """«Съел в столовой» — значения уже на порцию, масштабировать их нельзя."""
    world = await _world(db)
    entry = await nutrition_service.add_entry(
        db,
        world["athlete"].id,
        FoodLogIn(date=date.today(), meal=MealType.dinner, grams=350, name="Обед в столовой", kcal=620),
    )
    assert entry.kcal == 620
    assert entry.food_item_id is None


async def test_copy_meal_duplicates_yesterday(db):
    world = await _world(db)
    athlete_id = world["athlete"].id
    today = date.today()
    yesterday = today - timedelta(days=1)

    await nutrition_service.add_entry(
        db,
        athlete_id,
        FoodLogIn(date=yesterday, meal=MealType.breakfast, food_item_id=world["chicken"].id, grams=100),
    )
    copied = await nutrition_service.copy_meal(db, athlete_id, yesterday, today, MealType.breakfast)

    assert copied == 1
    day = await nutrition_service.get_day(db, athlete_id, today)
    assert day.totals.kcal == pytest.approx(137)


# ------------------------------------------------------------------ справочник


async def test_custom_food_is_private_to_author(db):
    world = await _world(db)
    item = await nutrition_service.create_item(
        db,
        world["athlete"].id,
        FoodItemIn(
            name="Мамин борщ", kcal_100g=60, category=FoodCategory.dish, custom_kind=CustomFoodKind.homemade
        ),
    )
    assert item.category == FoodCategory.dish
    assert item.custom_kind == CustomFoodKind.homemade

    own = await nutrition_service.search_items(db, world["athlete"].id, "борщ")
    assert len(own) == 1

    stranger = await nutrition_service.search_items(db, world["coach"].id, "борщ")
    assert stranger == []  # чужой custom не виден


async def test_search_finds_curated_items(db):
    world = await _world(db)
    found = await nutrition_service.search_items(db, world["athlete"].id, "гру")
    assert any(item.name == "Куриная грудка" for item in found)


# ------------------------------------------------------------------ цели


def test_target_accepts_any_positive_value():
    """Нижнего порога нет: пользователь ставит цель сам. Отсекаем только бессмыслицу."""
    assert NutritionTargetIn(kcal=900).kcal == 900
    with pytest.raises(ValidationError):
        NutritionTargetIn(kcal=0)


async def test_target_roundtrip(db):
    world = await _world(db)
    await nutrition_service.set_target(db, world["athlete"].id, NutritionTargetIn(kcal=3000, protein_g=150))
    target = await nutrition_service.get_target(db, world["athlete"].id)
    assert target.kcal == 3000
    assert target.protein_g == 150


# ------------------------------------------------------------------ витрины


async def test_no_staff_endpoint_for_nutrition(client, db):
    """Дневник строго личный: витрин для тренера и врача не существует."""
    world = await _world(db)
    coach = await register_user(client, world["coach"].email, "coach-device-01")
    athlete_id = world["athlete"].id

    for path in (
        f"/api/v1/nutrition/athletes/{athlete_id}/summary",
        f"/api/v1/nutrition/athletes/{athlete_id}/day",
    ):
        resp = await client.get(path, headers=coach["headers"])
        assert resp.status_code == 404, f"{path}: {resp.status_code}"


async def test_nutrition_closed_without_consent(db):
    world = await _world(db)
    for role in ("coach", "medic"):
        with pytest.raises(HTTPException):
            await authz.ensure_can_view_sensitive(
                db, world[role], world["athlete"].id, ConsentScope.nutrition
            )


# ------------------------------------------------------------------ API


async def test_nutrition_api_roundtrip(client, db):
    world = await _world(db)
    user = await register_user(client, world["athlete"].email, "nutri-device-01")
    today = date.today().isoformat()

    resp = await client.get("/api/v1/nutrition/foods/search?q=гру", headers=user["headers"])
    assert resp.status_code == 200, resp.text
    item_id = resp.json()[0]["id"]

    resp = await client.post(
        "/api/v1/nutrition/me/entries",
        json={"date": today, "meal": "lunch", "food_item_id": item_id, "grams": 150},
        headers=user["headers"],
    )
    assert resp.status_code == 201, resp.text
    entry_id = resp.json()["id"]

    resp = await client.get("/api/v1/nutrition/me/day", headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json()["totals"]["kcal"] == pytest.approx(205.5)

    resp = await client.get("/api/v1/nutrition/foods/recent", headers=user["headers"])
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    resp = await client.delete(f"/api/v1/nutrition/me/entries/{entry_id}", headers=user["headers"])
    assert resp.status_code == 204


async def test_cannot_delete_someone_elses_entry(client, db):
    world = await _world(db)
    entry = await nutrition_service.add_entry(
        db,
        world["athlete"].id,
        FoodLogIn(date=date.today(), meal=MealType.lunch, food_item_id=world["chicken"].id, grams=100),
    )
    intruder = await register_user(client, "intruder@example.com")

    resp = await client.delete(f"/api/v1/nutrition/me/entries/{entry.id}", headers=intruder["headers"])
    assert resp.status_code == 404


async def test_target_over_api_has_no_lower_bound(client):
    """Нижнего порога нет — цель ставит сам пользователь."""
    user = await register_user(client, "floor@example.com")
    resp = await client.put("/api/v1/nutrition/me/target", json={"kcal": 900}, headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json()["kcal"] == 900
