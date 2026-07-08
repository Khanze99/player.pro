"""OTP-челленджи — эфемерное хранилище (Redis в проде, память в тестах).

В Postgres OTP не хранится. Ключ — идентификатор (телефон/email).
"""

import time
from typing import Protocol

import redis.asyncio as aioredis

from app.config import settings
from app.core.security import hash_token


class OtpStore(Protocol):
    async def save_challenge(self, identifier: str, code: str) -> None: ...

    async def verify(self, identifier: str, code: str) -> bool:
        """Проверяет код; при успехе удаляет челлендж, при неудаче тратит попытку."""
        ...

    async def check_rate_limit(self, identifier: str) -> bool:
        """True — можно выслать ещё один код, False — лимит исчерпан."""
        ...


class MemoryOtpStore:
    """Для тестов и локальной отладки без Redis."""

    def __init__(self) -> None:
        self._challenges: dict[str, tuple[str, float, int]] = {}  # code_hash, expires, attempts
        self._requests: dict[str, list[float]] = {}

    async def save_challenge(self, identifier: str, code: str) -> None:
        expires = time.monotonic() + settings.otp_ttl_seconds
        self._challenges[identifier] = (hash_token(code), expires, 0)

    async def verify(self, identifier: str, code: str) -> bool:
        entry = self._challenges.get(identifier)
        if entry is None:
            return False
        code_hash, expires, attempts = entry
        if time.monotonic() > expires or attempts >= settings.otp_max_attempts:
            self._challenges.pop(identifier, None)
            return False
        if hash_token(code) == code_hash:
            self._challenges.pop(identifier, None)
            return True
        self._challenges[identifier] = (code_hash, expires, attempts + 1)
        return False

    async def check_rate_limit(self, identifier: str) -> bool:
        now = time.monotonic()
        window = [t for t in self._requests.get(identifier, []) if now - t < 3600]
        if len(window) >= settings.otp_requests_per_hour:
            self._requests[identifier] = window
            return False
        window.append(now)
        self._requests[identifier] = window
        return True


class RedisOtpStore:
    def __init__(self, url: str) -> None:
        self._redis = aioredis.from_url(url, decode_responses=True)

    def _key(self, identifier: str) -> str:
        return f"otp:challenge:{identifier}"

    async def save_challenge(self, identifier: str, code: str) -> None:
        key = self._key(identifier)
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hset(key, mapping={"code_hash": hash_token(code), "attempts": 0})
            pipe.expire(key, settings.otp_ttl_seconds)
            await pipe.execute()

    async def verify(self, identifier: str, code: str) -> bool:
        key = self._key(identifier)
        data = await self._redis.hgetall(key)
        if not data:
            return False
        if int(data.get("attempts", 0)) >= settings.otp_max_attempts:
            await self._redis.delete(key)
            return False
        if hash_token(code) == data.get("code_hash"):
            await self._redis.delete(key)
            return True
        await self._redis.hincrby(key, "attempts", 1)
        return False

    async def check_rate_limit(self, identifier: str) -> bool:
        key = f"otp:rate:{identifier}"
        count = await self._redis.incr(key)
        if count == 1:
            await self._redis.expire(key, 3600)
        return count <= settings.otp_requests_per_hour


_store: OtpStore | None = None


def get_otp_store() -> OtpStore:
    global _store
    if _store is None:
        _store = MemoryOtpStore() if settings.otp_store == "memory" else RedisOtpStore(settings.redis_url)
    return _store
