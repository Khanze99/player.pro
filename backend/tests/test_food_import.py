"""Импорт справочника продуктов (scripts/import_foods.py, docs/plan-food-catalog.md).

Проверяем ровно те ловушки, из-за которых импорт нельзя было запускать: повторный
прогон, дубли внутри одного дампа и пользовательский продукт с чужим штрихкодом.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models.enums import FoodCategory, FoodSource, UserStatus
from app.models.nutrition import FoodItem
from app.models.user import User


def _load_script():
    path = Path(__file__).resolve().parents[1] / "scripts" / "import_foods.py"
    spec = importlib.util.spec_from_file_location("import_foods", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


foods = _load_script()


def _row(code: str, name: str, **overrides) -> dict:
    row = {
        "code": code,
        "product_name": name,
        "brands": "Бренд",
        "categories_tags": "en:dairies,en:milks",
        "countries_en": "Russia",
        "energy-kcal_100g": "60",
        "proteins_100g": "2.9",
        "fat_100g": "3.2",
        "carbohydrates_100g": "4.7",
        "fiber_100g": "",
        "serving_quantity": "250",
    }
    row.update(overrides)
    return row


# ------------------------------------------------------------------ разбор строки


@pytest.mark.parametrize(
    "tags,expected",
    [
        ("en:dairies,en:milks", FoodCategory.dairy),
        # Широкий тег содержит подстроку `potatoes`, но это крупа, а не овощ:
        # порядок правил важнее самих подстрок
        ("en:plant-based-foods,en:cereals-and-potatoes", FoodCategory.grain),
        ("en:beverages,en:sodas", FoodCategory.drinks),
        ("en:sweet-snacks,en:chocolates", FoodCategory.sweets),
        ("en:meats,en:poultry", FoodCategory.meat),
        ("en:seafood,en:fishes", FoodCategory.fish),
        ("en:dietary-supplements", FoodCategory.supplements),
        ("", FoodCategory.other),
        ("en:something-unmapped", FoodCategory.other),
    ],
)
def test_off_category_mapping(tags, expected):
    assert foods.map_off_category(tags) == expected


@pytest.mark.parametrize(
    "row",
    [
        # Без штрихкода: в сканере бесполезна, а развести её по дублям нечем
        _row("", "Безымянный"),
        # Карточка без нутриентов — в OFF их много, в дневнике они мусор
        _row("111", "Без калорий", **{"energy-kcal_100g": ""}),
        _row("111", "Ноль калорий", **{"energy-kcal_100g": "0"}),
        _row("111", "Битая калорийность", **{"energy-kcal_100g": "9999"}),
        _row("111", ""),
        _row("111", "х" * 256),
    ],
)
def test_parse_row_rejects_useless_records(row):
    assert foods._parse_row(row) is None


def test_parse_row_unescapes_html_entities():
    """В дампе названия HTML-экранированы; без распаковки игрок увидит их как есть."""
    values = foods._parse_row(_row("111", "Творог &quot;Мягкий&quot; 4 %", brands="&amp; Co"))
    assert values["name"] == 'Творог "Мягкий" 4 %'
    assert values["brand"] == "& Co"


def test_parse_row_maps_fields():
    values = foods._parse_row(_row("4600682015147", "Молоко 3,2%"))
    assert values["barcode"] == "4600682015147"
    assert values["source"] == FoodSource.open_food_facts
    assert values["category"] == FoodCategory.dairy
    assert values["kcal_100g"] == 60
    assert values["serving_size_g"] == 250
    # Пустая клетчатка — именно NULL, а не ноль: «не знаем» и «нет» это разное
    assert values["fiber_100g"] is None


# ------------------------------------------------------------------ отбор рынка


@pytest.mark.parametrize(
    "countries,name,cyrillic,expected",
    [
        # Пометка страны есть — берём при любом языке названия
        ("Russia", "Tvorog", False, True),
        ("Russia", "Творог", False, True),
        # Страна не проставлена, название русское — доводим по кириллице
        ("", "Творог 5%", True, True),
        ("", "Творог 5%", False, False),
        # Кириллица НЕ признак российского товара: болгарские и украинские позиции
        # подписаны ей же, и чужой тег страны должен перевешивать
        ("Bulgaria", "Кисело краве мляко 3.6%", True, False),
        ("Ukraine", "Банановий нектар", True, False),
        # Латиница без пометки страны — не наш рынок
        ("", "Fromage blanc", True, False),
    ],
)
def test_market_filter(countries, name, cyrillic, expected):
    row = _row("111", name, countries_en=countries)
    assert foods._in_market(row, "russia", cyrillic) is expected


def test_empty_filters_take_everything():
    """Пустая страна и выключенная кириллица — фильтра нет вовсе."""
    assert foods._in_market(_row("111", "Nutella", countries_en="France"), "", False) is True


# ------------------------------------------------------------------ upsert


async def _off_items(db) -> list[FoodItem]:
    rows = await db.execute(
        select(FoodItem).where(FoodItem.source == FoodSource.open_food_facts).order_by(FoodItem.name)
    )
    return list(rows.scalars())


async def test_repeated_flush_updates_instead_of_duplicating(db):
    """Главная причина, по которой импорт нельзя было запускать: второй прогон
    дампа удваивал каталог."""
    first = foods._parse_row(_row("4600682015147", "Молоко 3,2%"))
    await foods._flush(db, {first["barcode"]: first})

    second = foods._parse_row(_row("4600682015147", "Молоко 3,2% (уточнили)", **{"energy-kcal_100g": "61"}))
    await foods._flush(db, {second["barcode"]: second})

    items = await _off_items(db)
    assert len(items) == 1
    assert items[0].name == "Молоко 3,2% (уточнили)"
    assert items[0].kcal_100g == 61


async def test_flush_keeps_manual_markup(db):
    """Перезаливка обновляет данные из дампа, но не сбрасывает ручную разметку."""
    values = foods._parse_row(_row("4607057394589", "Творог 5%"))
    await foods._flush(db, {values["barcode"]: values})

    item = (await _off_items(db))[0]
    item.verified = True
    await db.commit()

    await foods._flush(db, {values["barcode"]: values})
    await db.refresh(item)
    assert item.verified is True


async def test_custom_item_with_same_barcode_survives_import(db):
    """Частичный индекс покрывает только импортированный слой. Глобальный UNIQUE
    здесь либо заблокировал бы импорт, либо затёр чужой продукт."""
    user = User(
        last_name="Игрок",
        email=f"{uuid.uuid4().hex[:8]}@test.com",
        status=UserStatus.active,
    )
    db.add(user)
    await db.flush()
    own = FoodItem(
        source=FoodSource.custom,
        barcode="4600682015147",
        name="Моё молоко",
        kcal_100g=55,
        created_by=user.id,
    )
    db.add(own)
    await db.commit()

    values = foods._parse_row(_row("4600682015147", "Молоко 3,2%"))
    await foods._flush(db, {values["barcode"]: values})

    await db.refresh(own)
    assert own.name == "Моё молоко"
    assert own.kcal_100g == 55
    assert len(await _off_items(db)) == 1


async def test_import_survives_quotes_in_dump(db, tmp_path):
    """Дамп OFF — сырой TSV: кавычка в нём часть значения, а не разделитель.

    Опасна она в начале поля: с разбором по умолчанию csv тянет значение через
    перевод строки до следующей кавычки и съедает записи ниже. Импорт при этом
    отрабатывает без единой ошибки — отсюда и тест.
    """
    columns = [
        "code",
        "product_name",
        "brands",
        "categories_tags",
        "countries_en",
        "energy-kcal_100g",
        "proteins_100g",
        "fat_100g",
        "carbohydrates_100g",
        "fiber_100g",
        "serving_quantity",
    ]
    lines = ["\t".join(columns)]
    # Кавычка в начале поля — именно так ломается разбор: csv считает её открывающей
    # и тянет значение через перевод строки до следующей кавычки, съедая записи ниже
    lines.append('4600000000011\t"Особое молоко\tБренд\ten:dairies\tRussia\t60\t2.9\t3.2\t4.7\t\t250')
    lines.append("4600000000028\tТворог 5%\tБренд\ten:dairies\tRussia\t121\t17.2\t5\t1.8\t\t200")
    lines.append("4600000000035\tКефир 1%\tБренд\ten:dairies\tRussia\t40\t2.8\t1\t4\t\t250")
    dump = tmp_path / "off.csv"
    dump.write_text("\n".join(lines) + "\n", encoding="utf-8")

    seen = await foods.import_off(dump, limit=0, country="russia", batch_size=100)
    assert seen == 3

    items = await _off_items(db)
    assert {item.name for item in items} == {'"Особое молоко', "Творог 5%", "Кефир 1%"}


async def test_curated_set_is_fully_categorised():
    """Категория у выверенного набора проставлена всегда: иначе фильтр в UI
    показывает одну кучу `other`."""
    assert FoodCategory.other in foods.CURATED  # соусы и масла — им действительно некуда
    for category, rows in foods.CURATED.items():
        assert isinstance(category, FoodCategory)
        assert rows, f"пустая категория {category}"
    names = [row[0] for rows in foods.CURATED.values() for row in rows]
    assert len(names) == len(set(names)), "дубли названий в CURATED"
