"""Справочник продуктов.

Два режима:

  make foods            — базовый выверенный набор, работает сразу
  make foods-off f=…    — импорт дампа Open Food Facts (ODbL), потоково

Почему не FatSecret API: коммерческий, хостится в США, данные о питании уходили бы
за контур — конфликт со 152-ФЗ и с требованием собственной инфраструктуры из ТЗ.
Open Food Facts отдаётся дампом и поднимается у себя (docs/plan-women-health-nutrition.md).

Дамп: https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz

Оба режима идемпотентны: повторный прогон обновляет карточки, а не плодит дубли.
Для импорта это держится на частичном уникальном индексе `uq_food_items_off_barcode`
(`barcode` при `source='open_food_facts'`) — глобальный UNIQUE тут не годится,
пользователь вправе завести свой продукт с тем же штрихкодом.

ODbL требует атрибуции: упоминание Open Food Facts должно быть в приложении
(этап 6 в docs/plan-food-catalog.md).
"""

import argparse
import asyncio
import csv
import gzip
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select, text  # noqa: E402
from sqlalchemy.dialects.postgresql import insert  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import FoodCategory, FoodSource  # noqa: E402
from app.models.nutrition import FoodItem  # noqa: E402

# Дамп OFF на гигабайты, csv по умолчанию режет поля на 128 КБ — в описаниях бывает больше
csv.field_size_limit(10 * 1024 * 1024)

# Базовый набор: то, что реально едят каждый день. На 100 г.
# (название, бренд, ккал, белки, жиры, углеводы, клетчатка, порция г, имя порции)
CURATED: dict[FoodCategory, list[tuple]] = {
    FoodCategory.meat: [
        ("Куриная грудка, отварная", None, 137, 29.8, 1.8, 0.5, None, 150, "порция"),
        ("Куриное бедро, запечённое", None, 185, 21.0, 11.0, 0.0, None, 120, "порция"),
        ("Говядина, отварная", None, 254, 25.8, 16.8, 0.0, None, 120, "порция"),
        ("Свинина, запечённая", None, 270, 22.0, 20.0, 0.0, None, 120, "порция"),
        ("Индейка, филе", None, 130, 24.0, 3.5, 0.0, None, 150, "порция"),
        ("Куриная грудка, жареная", None, 197, 30.0, 8.0, 0.0, None, 150, "порция"),
        ("Куриная печень", None, 137, 20.4, 5.9, 0.7, None, 100, "порция"),
        ("Говяжий фарш, жареный", None, 254, 26.0, 17.0, 0.0, None, 120, "порция"),
        ("Телятина, тушёная", None, 131, 27.0, 2.0, 0.0, None, 120, "порция"),
        ("Баранина, тушёная", None, 268, 22.0, 20.0, 0.0, None, 120, "порция"),
        ("Свиная вырезка, запечённая", None, 143, 22.0, 6.0, 0.0, None, 120, "порция"),
        ("Ветчина", None, 145, 17.0, 8.5, 1.0, None, 30, "ломтик"),
        ("Колбаса варёная «Докторская»", None, 257, 12.8, 22.2, 1.5, None, 30, "ломтик"),
        ("Сосиски", None, 266, 10.4, 24.0, 1.6, None, 50, "шт."),
        ("Бекон", None, 500, 12.0, 50.0, 0.0, None, 20, "полоска"),
    ],
    FoodCategory.fish: [
        ("Лосось, слабосолёный", None, 202, 21.0, 13.0, 0.0, None, 100, "порция"),
        ("Треска, отварная", None, 78, 17.8, 0.7, 0.0, None, 150, "порция"),
        ("Тунец консервированный в воде", None, 96, 21.0, 1.0, 0.0, None, 100, "банка"),
        ("Сельдь солёная", None, 217, 17.0, 16.4, 0.0, None, 80, "порция"),
        ("Скумбрия запечённая", None, 191, 18.0, 13.2, 0.0, None, 120, "порция"),
        ("Минтай отварной", None, 79, 17.6, 1.0, 0.0, None, 150, "порция"),
        ("Форель запечённая", None, 168, 21.0, 9.0, 0.0, None, 120, "порция"),
        ("Креветки отварные", None, 95, 20.5, 1.0, 0.0, None, 100, "порция"),
        ("Кальмар отварной", None, 110, 18.0, 2.2, 3.0, None, 100, "порция"),
        ("Икра красная", None, 250, 24.6, 17.9, 0.0, None, 20, "ст. ложка"),
    ],
    FoodCategory.dairy: [
        ("Творог 5%", None, 121, 17.2, 5.0, 1.8, None, 200, "пачка"),
        ("Творог 9%", None, 159, 16.7, 9.0, 2.0, None, 200, "пачка"),
        ("Молоко 2.5%", None, 52, 2.9, 2.5, 4.7, None, 250, "стакан"),
        ("Кефир 1%", None, 40, 2.8, 1.0, 4.0, None, 250, "стакан"),
        ("Йогурт греческий 2%", None, 66, 9.0, 2.0, 3.6, None, 150, "баночка"),
        ("Сыр российский", None, 363, 24.1, 29.5, 0.3, None, 30, "ломтик"),
        ("Масло сливочное 82%", None, 748, 0.5, 82.5, 0.8, None, 10, "кусочек"),
        ("Творог 0%", None, 71, 16.5, 0.0, 1.3, None, 200, "пачка"),
        ("Творог зернёный", None, 105, 13.0, 5.0, 2.0, None, 150, "упаковка"),
        ("Молоко 3.2%", None, 60, 2.9, 3.2, 4.7, None, 250, "стакан"),
        ("Ряженка 4%", None, 67, 2.9, 4.0, 4.2, None, 250, "стакан"),
        ("Сметана 20%", None, 206, 2.8, 20.0, 3.2, None, 25, "ст. ложка"),
        ("Йогурт питьевой", None, 68, 3.0, 1.5, 11.0, None, 250, "бутылка"),
        ("Сыр моцарелла", None, 280, 22.0, 21.0, 2.2, None, 30, "ломтик"),
        ("Сыр пармезан", None, 392, 36.0, 26.0, 3.2, None, 20, "порция"),
        ("Сыр плавленый", None, 290, 12.0, 25.0, 3.0, None, 25, "порция"),
        ("Творожный сыр", None, 240, 6.0, 22.0, 4.0, None, 30, "порция"),
    ],
    FoodCategory.eggs: [
        ("Яйцо куриное", None, 157, 12.7, 11.5, 0.7, None, 55, "шт."),
        ("Яичный белок", None, 52, 11.1, 0.2, 0.7, None, 33, "шт."),
        ("Омлет из 2 яиц", None, 184, 12.0, 14.0, 2.0, None, 150, "порция"),
    ],
    FoodCategory.grain: [
        ("Гречка, варёная", None, 110, 4.2, 1.1, 21.3, 2.7, 200, "порция"),
        ("Рис белый, варёный", None, 116, 2.2, 0.5, 24.9, 0.4, 200, "порция"),
        ("Рис бурый, варёный", None, 111, 2.6, 0.9, 23.0, 1.8, 200, "порция"),
        ("Овсянка на воде", None, 88, 3.0, 1.7, 15.0, 1.7, 250, "порция"),
        ("Макароны, варёные", None, 131, 5.0, 1.1, 25.0, 1.2, 200, "порция"),
        ("Хлеб белый", None, 265, 8.0, 3.2, 49.0, 2.7, 30, "ломтик"),
        ("Хлеб ржаной", None, 210, 6.6, 1.2, 41.0, 5.8, 30, "ломтик"),
        ("Булгур, варёный", None, 83, 3.1, 0.2, 18.6, 4.5, 200, "порция"),
        ("Киноа, варёная", None, 120, 4.4, 1.9, 21.3, 2.8, 180, "порция"),
        ("Перловка, варёная", None, 106, 3.1, 0.4, 22.2, 2.5, 200, "порция"),
        ("Пшено, варёное", None, 90, 3.0, 0.7, 17.0, 1.3, 200, "порция"),
        ("Кускус, варёный", None, 112, 3.8, 0.2, 23.2, 1.4, 200, "порция"),
        ("Овсянка на молоке", None, 102, 3.2, 4.1, 14.2, 1.6, 250, "порция"),
        ("Мюсли с фруктами", None, 352, 9.0, 5.0, 65.0, 7.0, 50, "порция"),
        ("Гранола", None, 471, 10.0, 20.0, 60.0, 7.0, 45, "порция"),
        ("Хлебцы цельнозерновые", None, 310, 11.0, 3.0, 57.0, 15.0, 10, "шт."),
        ("Лаваш тонкий", None, 236, 7.9, 1.0, 47.6, 2.0, 60, "лист"),
        ("Батон нарезной", None, 264, 7.5, 2.9, 50.9, 2.3, 30, "ломтик"),
        ("Хлеб цельнозерновой", None, 229, 9.0, 3.0, 40.0, 6.5, 35, "ломтик"),
    ],
    FoodCategory.vegetable: [
        ("Картофель отварной", None, 82, 2.0, 0.4, 16.7, 1.4, 200, "порция"),
        ("Картофель жареный", None, 192, 2.8, 9.5, 23.4, 1.8, 200, "порция"),
        ("Чечевица, варёная", None, 116, 9.0, 0.4, 20.1, 7.9, 180, "порция"),
        ("Фасоль красная, варёная", None, 123, 8.7, 0.5, 22.8, 6.4, 180, "порция"),
        ("Огурец", None, 15, 0.7, 0.1, 3.6, 0.5, 100, "шт."),
        ("Помидор", None, 18, 0.9, 0.2, 3.9, 1.2, 120, "шт."),
        ("Брокколи, варёная", None, 35, 2.4, 0.4, 7.2, 3.3, 150, "порция"),
        ("Салат листовой", None, 15, 1.4, 0.2, 2.9, 1.3, 50, "порция"),
        ("Картофельное пюре", None, 106, 2.5, 4.2, 15.0, 1.3, 200, "порция"),
        ("Картофель фри", None, 312, 3.4, 15.0, 41.0, 3.8, 150, "порция"),
        ("Нут, варёный", None, 164, 8.9, 2.6, 27.4, 7.6, 180, "порция"),
        ("Горошек зелёный", None, 81, 5.4, 0.4, 14.5, 5.1, 100, "порция"),
        ("Кукуруза консервированная", None, 119, 3.2, 1.3, 22.7, 2.7, 100, "порция"),
        ("Фасоль стручковая", None, 31, 1.8, 0.1, 7.1, 3.4, 150, "порция"),
        ("Капуста белокочанная", None, 25, 1.3, 0.1, 5.8, 2.5, 150, "порция"),
        ("Капуста цветная, варёная", None, 23, 1.8, 0.5, 4.1, 2.3, 150, "порция"),
        ("Морковь", None, 41, 0.9, 0.2, 9.6, 2.8, 100, "шт."),
        ("Свёкла варёная", None, 44, 1.7, 0.2, 10.0, 2.8, 100, "порция"),
        ("Лук репчатый", None, 40, 1.1, 0.1, 9.3, 1.7, 50, "шт."),
        ("Перец болгарский", None, 27, 1.3, 0.1, 5.3, 2.1, 120, "шт."),
        ("Кабачок тушёный", None, 24, 1.2, 0.3, 4.6, 1.0, 150, "порция"),
        ("Баклажан запечённый", None, 35, 1.0, 0.2, 8.7, 3.0, 150, "порция"),
        ("Шампиньоны жареные", None, 60, 3.5, 4.0, 3.0, 1.5, 150, "порция"),
        ("Квашеная капуста", None, 19, 1.8, 0.1, 4.4, 4.1, 100, "порция"),
    ],
    FoodCategory.fruit: [
        ("Банан", None, 89, 1.1, 0.3, 22.8, 2.6, 120, "шт."),
        ("Яблоко", None, 52, 0.3, 0.2, 13.8, 2.4, 180, "шт."),
        ("Апельсин", None, 47, 0.9, 0.1, 11.8, 2.4, 150, "шт."),
        ("Виноград", None, 69, 0.7, 0.2, 18.1, 0.9, 100, "горсть"),
        ("Черника", None, 57, 0.7, 0.3, 14.5, 2.4, 100, "горсть"),
        ("Авокадо", None, 160, 2.0, 14.7, 8.5, 6.7, 150, "шт."),
        ("Груша", None, 57, 0.4, 0.1, 15.2, 3.1, 170, "шт."),
        ("Мандарин", None, 53, 0.8, 0.3, 13.3, 1.8, 90, "шт."),
        ("Киви", None, 61, 1.1, 0.5, 14.7, 3.0, 80, "шт."),
        ("Персик", None, 39, 0.9, 0.3, 9.5, 1.5, 150, "шт."),
        ("Ананас", None, 50, 0.5, 0.1, 13.1, 1.4, 100, "порция"),
        ("Арбуз", None, 30, 0.6, 0.2, 7.6, 0.4, 300, "порция"),
        ("Клубника", None, 33, 0.7, 0.3, 7.7, 2.0, 150, "порция"),
        ("Малина", None, 52, 1.2, 0.7, 11.9, 6.5, 100, "горсть"),
        ("Изюм", None, 299, 3.1, 0.5, 79.2, 3.7, 30, "горсть"),
        ("Курага", None, 241, 3.4, 0.5, 62.6, 7.3, 30, "горсть"),
        ("Финики", None, 277, 1.8, 0.2, 75.0, 6.7, 25, "3 шт."),
        ("Чернослив", None, 240, 2.2, 0.4, 63.9, 7.1, 30, "горсть"),
    ],
    FoodCategory.nuts: [
        ("Орехи грецкие", None, 654, 15.2, 65.2, 13.7, 6.7, 30, "горсть"),
        ("Миндаль", None, 579, 21.2, 49.9, 21.6, 12.5, 30, "горсть"),
        ("Арахисовая паста", None, 588, 25.1, 50.4, 20.0, 6.0, 20, "ст. ложка"),
        ("Фундук", None, 628, 15.0, 61.0, 16.7, 9.7, 30, "горсть"),
        ("Кешью", None, 553, 18.2, 43.9, 30.2, 3.3, 30, "горсть"),
        ("Арахис", None, 567, 25.8, 49.2, 16.1, 8.5, 30, "горсть"),
        ("Семечки подсолнечника", None, 584, 20.8, 51.5, 20.0, 8.6, 30, "горсть"),
        ("Семена чиа", None, 486, 16.5, 30.7, 42.1, 34.4, 15, "ст. ложка"),
    ],
    FoodCategory.sweets: [
        ("Мёд", None, 304, 0.3, 0.0, 82.4, None, 20, "ст. ложка"),
        ("Шоколад тёмный 70%", None, 546, 7.8, 42.6, 45.9, 11.0, 25, "долька"),
        ("Сахар", None, 399, 0.0, 0.0, 99.7, None, 5, "ч. ложка"),
        ("Молочный шоколад", None, 535, 7.7, 29.7, 59.4, 2.2, 25, "долька"),
        ("Печенье овсяное", None, 437, 6.5, 14.2, 71.0, 2.5, 25, "шт."),
        ("Мороженое пломбир", None, 227, 3.5, 15.0, 20.4, None, 100, "порция"),
        ("Халва подсолнечная", None, 523, 11.6, 29.7, 54.0, 4.0, 30, "порция"),
        ("Зефир", None, 326, 0.8, 0.1, 79.8, None, 30, "шт."),
    ],
    FoodCategory.drinks: [
        ("Кофе чёрный без сахара", None, 2, 0.2, 0.0, 0.0, None, 200, "чашка"),
        ("Кофе с молоком", None, 37, 1.8, 1.4, 4.3, None, 200, "чашка"),
        ("Чай без сахара", None, 1, 0.0, 0.0, 0.2, None, 200, "чашка"),
        ("Сок апельсиновый", None, 45, 0.7, 0.2, 10.4, 0.2, 250, "стакан"),
        ("Кола", None, 42, 0.0, 0.0, 10.6, None, 330, "банка"),
        ("Морс ягодный", None, 41, 0.1, 0.0, 10.0, None, 250, "стакан"),
        ("Пиво светлое 4.5%", None, 43, 0.5, 0.0, 3.6, None, 500, "бутылка"),
    ],
    FoodCategory.supplements: [
        ("Протеин сывороточный", None, 400, 80.0, 5.0, 8.0, None, 30, "мерная ложка"),
        ("Гейнер", None, 380, 20.0, 4.0, 68.0, None, 100, "порция"),
        ("Изотоник, готовый", None, 26, 0.0, 0.0, 6.4, None, 500, "бутылка"),
        ("Батончик протеиновый", None, 350, 30.0, 10.0, 35.0, 3.0, 60, "шт."),
        ("Протеин казеиновый", None, 360, 78.0, 3.0, 6.0, None, 30, "мерная ложка"),
        ("BCAA порошок", None, 380, 95.0, 0.0, 0.0, None, 10, "порция"),
        ("Креатин моногидрат", None, 0, 0.0, 0.0, 0.0, None, 5, "порция"),
        ("Энергетический гель", None, 250, 0.0, 0.0, 62.0, None, 40, "саше"),
    ],
    FoodCategory.dish: [
        ("Борщ", None, 49, 1.5, 2.7, 5.0, 1.4, 300, "тарелка"),
        ("Куриный суп с лапшой", None, 45, 3.0, 1.5, 5.0, 0.5, 300, "тарелка"),
        ("Сырники", None, 220, 17.0, 8.0, 20.0, None, 150, "порция"),
        ("Блины", None, 233, 6.1, 12.3, 26.0, None, 80, "шт."),
        ("Плов с курицей", None, 187, 9.0, 7.0, 22.0, 1.0, 300, "порция"),
        ("Гречка с курицей", None, 130, 10.0, 3.0, 16.0, 2.0, 300, "порция"),
        ("Паста болоньезе", None, 165, 8.0, 6.0, 19.0, 1.5, 300, "порция"),
        ("Пельмени варёные", None, 252, 11.9, 12.4, 24.0, 1.0, 250, "порция"),
        ("Плов вегетарианский", None, 155, 3.5, 5.0, 25.0, 2.0, 300, "порция"),
        ("Салат овощной с маслом", None, 78, 1.3, 5.6, 5.5, 1.8, 200, "порция"),
        ("Салат «Цезарь» с курицей", None, 190, 12.0, 13.0, 6.0, 1.0, 250, "порция"),
        ("Оливье", None, 198, 5.5, 15.0, 9.0, 1.5, 200, "порция"),
        ("Щи из свежей капусты", None, 32, 1.0, 1.7, 3.4, 1.0, 300, "тарелка"),
        ("Уха", None, 46, 5.0, 2.0, 2.0, 0.3, 300, "тарелка"),
        ("Овсяноблин", None, 172, 11.0, 8.0, 14.0, 1.6, 150, "порция"),
        ("Бутерброд с сыром", None, 300, 12.0, 15.0, 30.0, 1.5, 60, "шт."),
        ("Пицца «Маргарита»", None, 266, 11.0, 10.0, 33.0, 2.3, 150, "кусок"),
        ("Бургер с говядиной", None, 260, 13.0, 12.0, 25.0, 1.5, 220, "шт."),
        ("Роллы «Филадельфия»", None, 195, 7.0, 9.0, 21.0, 0.8, 200, "порция"),
    ],
    FoodCategory.other: [
        ("Масло оливковое", None, 884, 0.0, 100.0, 0.0, None, 10, "ст. ложка"),
        ("Масло подсолнечное", None, 899, 0.0, 99.9, 0.0, None, 10, "ст. ложка"),
        ("Майонез", None, 680, 1.0, 75.0, 1.6, None, 15, "ст. ложка"),
        ("Кетчуп", None, 93, 1.8, 0.2, 22.2, 0.5, 15, "ст. ложка"),
        ("Соевый соус", None, 53, 6.0, 0.1, 6.6, None, 10, "ст. ложка"),
        ("Горчица", None, 143, 9.9, 12.7, 5.3, None, 10, "ч. ложка"),
    ],
}

# Маппинг categories_tags OFF на FoodCategory. Правила проверяются по порядку,
# сверху вниз — от частного к общему: тег `cereals-and-potatoes` должен уйти
# в grain, а не в vegetable по подстроке `potatoes`.
#
# Русские подстроки — не блажь: часть российских карточек размечена тегами
# вида `ru:мясной-продукт` вместо англоязычных `en:`.
OFF_CATEGORY_RULES: list[tuple[FoodCategory, tuple[str, ...]]] = [
    (
        FoodCategory.supplements,
        ("dietary-supplements", "sports-nutrition", "protein-powder", "whey", "протеинов"),
    ),
    (FoodCategory.eggs, ("eggs", "яйц")),
    (FoodCategory.fish, ("fishes", "seafood", "fish", "shellfish", "crustaceans", "molluscs", "рыб")),
    (
        FoodCategory.meat,
        ("meats", "poultry", "hams", "sausages", "charcuterie", "chicken", "beef", "pork", "мясн", "колбас"),
    ),
    (
        FoodCategory.dairy,
        (
            "dairies",
            "cheese",
            "yogurt",
            "milks",
            "creams",
            "fermented-milk",
            "butters",
            "сыр",
            "творог",
            "молок",
        ),
    ),
    (FoodCategory.nuts, ("nuts", "seeds", "nut-butters")),
    (
        FoodCategory.sweets,
        (
            "sweet-snacks",
            "confectioneries",
            "chocolates",
            "biscuits",
            "desserts",
            "candies",
            "ice-cream",
            "jams",
            "sugars",
            "cocoa",
            "пастила",
        ),
    ),
    (FoodCategory.drinks, ("beverages", "waters", "juices", "sodas", "teas", "coffees")),
    (FoodCategory.dish, ("meals", "prepared-", "sandwiches", "pizzas", "soups", "salads")),
    (
        FoodCategory.grain,
        ("cereals", "breads", "pastas", "rice", "flours", "breakfast", "хлебобулочн", "выпечка"),
    ),
    (FoodCategory.fruit, ("fruits", "berries")),
    (FoodCategory.vegetable, ("vegetables", "legumes", "potatoes", "mushrooms")),
]

# Поля, которые перезаливка обновляет. Всё остальное — `created_by`, `verified`,
# `custom_kind` — трогать нельзя: иначе повторный прогон сбросит ручную разметку.
OFF_UPDATABLE = (
    "name",
    "brand",
    "category",
    "kcal_100g",
    "protein_100g",
    "fat_100g",
    "carbs_100g",
    "fiber_100g",
    "serving_size_g",
)


# Одна строка upsert — 12 параметров, а asyncpg не отправляет больше 32767
# параметров в запросе; батч крупнее этого потолка упадёт уже на проде
MAX_BATCH = 2000


def _batch_size(value: str) -> int:
    size = int(value)
    if not 1 <= size <= MAX_BATCH:
        raise argparse.ArgumentTypeError(f"размер батча должен быть от 1 до {MAX_BATCH}")
    return size


def map_off_category(tags: str) -> FoodCategory:
    lowered = tags.lower()
    for category, keywords in OFF_CATEGORY_RULES:
        if any(keyword in lowered for keyword in keywords):
            return category
    return FoodCategory.other


async def load_curated() -> tuple[int, int]:
    """Базовый справочник. Обновляет уже загруженные позиции: он источник истины
    по нутриентам и категориям, а не разовый сид."""
    added = updated = 0
    async with AsyncSessionLocal() as db:
        for category, rows in CURATED.items():
            for name, brand, kcal, protein, fat, carbs, fiber, serving, serving_name in rows:
                existing = await db.execute(
                    select(FoodItem).where(FoodItem.name == name, FoodItem.source == FoodSource.curated)
                )
                item = existing.scalar_one_or_none()
                values = dict(
                    name=name,
                    brand=brand,
                    category=category,
                    kcal_100g=kcal,
                    protein_100g=protein,
                    fat_100g=fat,
                    carbs_100g=carbs,
                    fiber_100g=fiber,
                    serving_size_g=serving,
                    serving_name=serving_name,
                    verified=True,
                )
                if item is None:
                    db.add(FoodItem(source=FoodSource.curated, **values))
                    added += 1
                else:
                    changed = False
                    for field, value in values.items():
                        if getattr(item, field) != value:
                            setattr(item, field, value)
                            changed = True
                    updated += changed
        await db.commit()
    return added, updated


CYRILLIC = re.compile(r"[А-Яа-яЁё]")


def _in_market(row: dict, country: str, cyrillic: bool) -> bool:
    """Относится ли строка к целевому рынку. Без обоих признаков фильтра нет.

    Кириллица — только доводка на случай непроставленной страны, и не более того.
    Считать её признаком российского товара нельзя: в дампе кириллицей подписаны
    болгарские (самая крупная группа), украинские и сербские позиции, и отбор
    «любая кириллица» затаскивает в каталог вчетверо больше чужого, чем нашего.
    В `countries_en` при этом пусто всего у 24 годных записей — тег заполняют.
    """
    if not country and not cyrillic:
        return True
    countries = (row.get("countries_en") or "").strip()
    if country and country.lower() in countries.lower():
        return True
    if cyrillic and not countries:
        return bool(CYRILLIC.search(row.get("product_name") or ""))
    return False


def _to_float(value: str) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None


def _parse_row(row: dict) -> dict | None:
    """Строка дампа → значения FoodItem. None — строку берём мимо.

    Отбрасываем записи без осмысленной энергетики (в OFF таких много: карточка
    заполнена одним фото) и без штрихкода — в сканере они бесполезны, а развести
    их по дублям нечем.
    """
    barcode = (row.get("code") or "").strip()[:32]
    # Названия в дампе приезжают HTML-экранированными («Творог &quot;Мягкий&quot;»),
    # и в дневнике игрок увидел бы ровно эти сущности
    name = html.unescape(row.get("product_name") or "").strip()
    kcal = _to_float(row.get("energy-kcal_100g", ""))
    if not barcode or not name or len(name) > 255 or kcal is None or kcal == 0 or kcal > 900:
        return None
    return dict(
        source=FoodSource.open_food_facts,
        barcode=barcode,
        name=name,
        brand=html.unescape(row.get("brands") or "").strip()[:128] or None,
        category=map_off_category(row.get("categories_tags") or ""),
        kcal_100g=kcal,
        protein_100g=_to_float(row.get("proteins_100g", "")) or 0,
        fat_100g=_to_float(row.get("fat_100g", "")) or 0,
        carbs_100g=_to_float(row.get("carbohydrates_100g", "")) or 0,
        fiber_100g=_to_float(row.get("fiber_100g", "")),
        serving_size_g=_to_float(row.get("serving_quantity", "")),
    )


async def _flush(db, batch: dict[str, dict]) -> None:
    """Upsert батча по штрихкоду.

    Дедуп внутри батча обязателен: один штрихкод встречается в дампе не раз, а
    ON CONFLICT DO UPDATE не умеет задеть одну строку дважды в рамках команды —
    PostgreSQL ответит `cannot affect row a second time`. Ключ словаря и есть
    дедуп: побеждает последняя запись в файле.
    """
    if not batch:
        return
    stmt = insert(FoodItem).values(list(batch.values()))
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=["barcode"],
            index_where=text("source = 'open_food_facts' AND barcode IS NOT NULL"),
            set_={field: getattr(stmt.excluded, field) for field in OFF_UPDATABLE},
        )
    )
    await db.commit()


async def import_off(path: Path, limit: int, country: str, batch_size: int, cyrillic: bool = False) -> int:
    """Потоковый импорт дампа: файл на гигабайты, в память он не влезет."""
    opener = gzip.open if path.suffix == ".gz" else open
    seen = 0
    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(func.count()).select_from(FoodItem).where(FoodItem.source == FoodSource.open_food_facts)
        )
        print(f"  Уже импортировано ранее: {existing.scalar()}")

        with opener(path, "rt", encoding="utf-8", errors="replace", newline="") as handle:
            # QUOTE_NONE: дамп — сырой TSV, кавычки в нём не разделители, а часть
            # значения. С разбором по умолчанию поле, начинающееся с `"`, тянется
            # через перевод строки до следующей кавычки и съедает записи ниже.
            # На российской выборке таких строк не нашлось, но в дампе они есть.
            reader = csv.DictReader(handle, delimiter="\t", quoting=csv.QUOTE_NONE)
            batch: dict[str, dict] = {}
            for row in reader:
                if limit and seen >= limit:
                    break
                if not _in_market(row, country, cyrillic):
                    continue
                values = _parse_row(row)
                if values is None:
                    continue
                batch[values["barcode"]] = values
                seen += 1
                if len(batch) >= batch_size:
                    await _flush(db, batch)
                    batch = {}
                    print(f"    …{seen}")
            await _flush(db, batch)

        total = await db.execute(
            select(func.count()).select_from(FoodItem).where(FoodItem.source == FoodSource.open_food_facts)
        )
        print(f"  Всего в импортированном слое: {total.scalar()}")
    return seen


def main() -> None:
    parser = argparse.ArgumentParser(description="Справочник продуктов PlayerPro")
    parser.add_argument("--off", type=Path, help="путь к дампу Open Food Facts (.csv или .csv.gz)")
    parser.add_argument("--limit", type=int, default=0, help="максимум записей из дампа; 0 — без ограничения")
    parser.add_argument("--country", default="russia", help="фильтр по стране; пусто — без фильтра")
    parser.add_argument(
        "--cyrillic",
        action="store_true",
        help="добирать товары с кириллицей в названии, у которых страна не проставлена",
    )
    parser.add_argument(
        "--batch", type=_batch_size, default=1000, help=f"размер батча upsert, 1..{MAX_BATCH}"
    )
    args = parser.parse_args()

    if args.off:
        cap = args.limit or "без ограничения"
        market = args.country or "все страны"
        if args.cyrillic:
            market += " + кириллица без пометки страны"
        print(f"Импорт Open Food Facts из {args.off} (лимит {cap}, отбор: {market})")
        seen = asyncio.run(import_off(args.off, args.limit, args.country, args.batch, args.cyrillic))
        print(f"Готово. Обработано строк: {seen}")
    else:
        total = sum(len(rows) for rows in CURATED.values())
        print("Загрузка базового выверенного справочника")
        added, updated = asyncio.run(load_curated())
        print(f"Готово. Добавлено: {added}, обновлено: {updated} (всего в наборе {total})")


if __name__ == "__main__":
    main()
