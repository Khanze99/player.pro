"""Мост sync→async для Celery-задач (docs/plan-celery-recalc.md).

Celery-задача синхронна, а сервисный слой (`analytics_service`) асинхронный и завязан
на asyncpg. Корутины гоняются в выделенном потоке с собственным event loop — один и
тот же механизм в проде (prefork-воркер) и в тестах (`task_always_eager` внутри
работающего цикла pytest-asyncio, где `asyncio.run` бросил бы RuntimeError).

Движок SQLAlchemy для задач отдельный, на `NullPool`: он не переживает fork воркера и
не должен делить пул с процессом API.
"""

import asyncio
import logging
import threading
from collections.abc import Coroutine
from contextlib import contextmanager
from typing import Any

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_loop: asyncio.AbstractEventLoop | None = None
_thread: threading.Thread | None = None
_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker | None = None


def reset() -> None:
    """Сбросить унаследованное после fork состояние, ничего не закрывая: объекты
    родительского процесса в дочернем нерабочие."""
    global _loop, _thread, _engine, _sessionmaker
    _loop = None
    _thread = None
    _engine = None
    _sessionmaker = None


def ensure_loop() -> asyncio.AbstractEventLoop:
    global _loop, _thread
    with _lock:
        if _loop is not None and _loop.is_running():
            return _loop
        _loop = asyncio.new_event_loop()
        _thread = threading.Thread(target=_loop.run_forever, name="celery-async-runtime", daemon=True)
        _thread.start()
        return _loop


def run_async(coro: Coroutine[Any, Any, Any]) -> Any:
    """Выполнить корутину в потоке-мосте и дождаться результата."""
    loop = ensure_loop()
    return asyncio.run_coroutine_threadsafe(coro, loop).result()


def session_factory() -> async_sessionmaker:
    global _engine, _sessionmaker
    if _sessionmaker is None:
        _engine = create_async_engine(settings.database_url, echo=False, poolclass=NullPool)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _sessionmaker


def shutdown() -> None:
    global _loop, _thread
    if _loop is not None and _loop.is_running():
        if _engine is not None:
            try:
                run_async(_engine.dispose())
            except Exception:  # noqa: BLE001 — teardown, гасим
                logger.exception("Ошибка при закрытии async-движка Celery")
        _loop.call_soon_threadsafe(_loop.stop)
        if _thread is not None:
            _thread.join(timeout=5)
    reset()


@contextmanager
def redis_lock(name: str, timeout: int):
    """Взаимоисключение пересчётов одного ряда. В eager-режиме (тесты) — no-op:
    `.delay()` исполняется синхронно, конкуренции нет, Redis не поднимается."""
    if settings.celery_task_always_eager:
        yield True
        return

    import redis

    client = redis.from_url(settings.celery_broker_url)
    lock = client.lock(f"recalc:lock:{name}", timeout=timeout)
    acquired = lock.acquire(blocking=False)
    try:
        yield acquired
    finally:
        if acquired:
            try:
                lock.release()
            except redis.exceptions.LockError:
                pass
        client.close()
