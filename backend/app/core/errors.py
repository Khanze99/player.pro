"""Обработчик 422: тот же ответ, что у FastAPI по умолчанию ({"detail": [...]}),
но без падения на неконечных числах.

json.loads (Starlette) принимает NaN/Infinity в теле запроса, Pydantic эхом
кладёт их в "input" ошибки, а JSONResponse сериализует со строгим
allow_nan=False: вместо 422 клиент получал 500. Заменяем такие числа строкой.
"""

import math
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _finite(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {k: _finite(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_finite(v) for v in value]
    return value


async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _finite(jsonable_encoder(exc.errors()))})
