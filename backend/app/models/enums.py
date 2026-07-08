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
