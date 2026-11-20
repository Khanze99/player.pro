"""Independent medical/coaching restrictions. No persistence or HTTP concerns."""

from typing import Literal

Direction = Literal["medical", "coaching"]
Status = Literal["full", "modified", "unavailable"]
STATUSES: tuple[Status, ...] = ("full", "modified", "unavailable")
DIRECTIONS: tuple[Direction, ...] = ("medical", "coaching")


def effective_status(medical: str, coaching: str) -> Status:
    return STATUSES[max(STATUSES.index(medical), STATUSES.index(coaching))]


class AvailabilityError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)
