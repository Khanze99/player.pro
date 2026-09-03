import enum


class GlobalRole(str, enum.Enum):
    admin = "admin"
    staff = "staff"
    player = "player"


class TeamRole(str, enum.Enum):
    head_coach = "head_coach"
    coach = "coach"
    medic = "medic"
    athlete = "athlete"


COACH_ROLES = {TeamRole.head_coach, TeamRole.coach}
STAFF_ROLES = {TeamRole.head_coach, TeamRole.coach, TeamRole.medic}


class Sex(str, enum.Enum):
    """Самодекларация. Нужна как входной параметр (цикл-трекинг), не как обязательное поле."""

    female = "female"
    male = "male"
    not_specified = "not_specified"


class ConsentScope(str, enum.Enum):
    """Гранулярность согласия: питание не открывает цикл и наоборот."""

    cycle = "cycle"
    nutrition = "nutrition"
    body_metrics = "body_metrics"


class ConsentAudience(str, enum.Enum):
    """Кому игрок открыл данные. Уровни вложены: coach видит всё, что видит medic."""

    none = "none"
    medic = "medic"
    coach = "coach"


class PolicyConsentKind(str, enum.Enum):
    """Юридический гейт при регистрации (152-ФЗ): бинарное принял/не принял,
    без audience-лестницы — не путать с ConsentScope/ConsentAudience (DataConsent)."""

    terms = "terms"
    health_data = "health_data"


class CyclePhase(str, enum.Enum):
    """Фаза цикла. suppressed — гормональная контрацепция подавляет естественный цикл,
    фазы в привычном смысле нет; unknown — данных недостаточно для расчёта."""

    menstrual = "menstrual"
    follicular = "follicular"
    ovulation = "ovulation"
    luteal = "luteal"
    suppressed = "suppressed"
    unknown = "unknown"


class FlowIntensity(str, enum.Enum):
    spotting = "spotting"
    light = "light"
    medium = "medium"
    heavy = "heavy"


class CycleSymptom(str, enum.Enum):
    cramps = "cramps"
    headache = "headache"
    back_pain = "back_pain"
    bloating = "bloating"
    fatigue = "fatigue"
    mood_swings = "mood_swings"
    nausea = "nausea"
    breast_tenderness = "breast_tenderness"
    insomnia = "insomnia"
    other = "other"


# Симптомы, из-за которых тренеру имеет смысл знать об ограничении. Тренер видит
# только сам факт, без расшифровки — какой именно симптом, знает лишь medic.
TRAINING_AFFECTING_SYMPTOMS = {
    CycleSymptom.cramps,
    CycleSymptom.back_pain,
    CycleSymptom.fatigue,
    CycleSymptom.nausea,
    CycleSymptom.headache,
    CycleSymptom.insomnia,
}


class Contraception(str, enum.Enum):
    """Принципиально меняет трактовку цикла, поэтому спрашивается явно."""

    none = "none"
    combined_oc = "combined_oc"
    progestin_only = "progestin_only"
    hormonal_iud = "hormonal_iud"
    copper_iud = "copper_iud"
    implant = "implant"
    injection = "injection"
    other = "other"
    not_specified = "not_specified"


# Методы, подавляющие овуляцию: расчёт фаз для них не имеет смысла
OVULATION_SUPPRESSING = {
    Contraception.combined_oc,
    Contraception.progestin_only,
    Contraception.implant,
    Contraception.injection,
}


class MealType(str, enum.Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snack = "snack"


class FoodSource(str, enum.Enum):
    """Откуда продукт. custom виден только автору, остальное — всем."""

    curated = "curated"  # собственный выверенный справочник
    open_food_facts = "open_food_facts"  # импорт из открытого дампа (ODbL)
    custom = "custom"  # добавлен пользователем


class FoodCategory(str, enum.Enum):
    meat = "meat"
    fish = "fish"
    dairy = "dairy"
    eggs = "eggs"
    grain = "grain"
    vegetable = "vegetable"
    fruit = "fruit"
    nuts = "nuts"
    sweets = "sweets"
    drinks = "drinks"
    supplements = "supplements"
    dish = "dish"  # готовое блюдо
    other = "other"


class CustomFoodKind(str, enum.Enum):
    """Почему продукта нет в справочнике — это подсказка для будущей модерации:
    домашнюю еду в общий каталог не переносят, а новинку с рынка стоит проверить."""

    homemade = "homemade"  # домашняя еда, рецепт
    new_product = "new_product"  # новый продукт на рынке
    restaurant = "restaurant"  # блюдо из заведения/столовой
    other = "other"


class UserStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    blocked = "blocked"


class EventType(str, enum.Enum):
    training = "training"
    match = "match"
    individual = "individual"
    other = "other"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    excused = "excused"


class AvailabilityStatus(str, enum.Enum):
    full = "full"
    modified = "modified"
    unavailable = "unavailable"


class InjurySeverity(str, enum.Enum):
    minor = "minor"
    moderate = "moderate"
    severe = "severe"


class InjuryStatus(str, enum.Enum):
    active = "active"
    recovering = "recovering"
    closed = "closed"


class StreakType(str, enum.Enum):
    wellness = "wellness"
    rpe = "rpe"


class InvitationStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    revoked = "revoked"
    expired = "expired"


class BodyRegion(str, enum.Enum):
    """Фиксированный набор зон тела для карты боли и структурированной травмы/симптома."""

    head = "head"
    neck = "neck"
    shoulder = "shoulder"
    upper_back = "upper_back"
    lower_back = "lower_back"
    chest = "chest"
    abdomen = "abdomen"
    elbow = "elbow"
    forearm = "forearm"
    wrist = "wrist"
    hand = "hand"
    hip = "hip"
    glute = "glute"
    groin = "groin"
    quad = "quad"
    hamstring = "hamstring"
    knee = "knee"
    calf = "calf"
    shin = "shin"
    ankle = "ankle"
    foot = "foot"


class BodySide(str, enum.Enum):
    left = "left"
    right = "right"
    center = "center"


class InjuryType(str, enum.Enum):
    muscle = "muscle"
    joint = "joint"
    ligament = "ligament"
    tendon = "tendon"
    bone = "bone"
    bruise = "bruise"
    other = "other"


class SymptomType(str, enum.Enum):
    illness = "illness"
    fever = "fever"
    cough = "cough"
    sore_throat = "sore_throat"
    headache = "headache"
    gastro = "gastro"
    fatigue = "fatigue"
    other = "other"
