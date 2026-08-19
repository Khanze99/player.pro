"""Доставка OTP: базовый канал и его реализации (лог, почта, SMS).

Канал выбирается конфигом отдельно для email и для телефона: на UAT-стенде обоим
хватает лога, в проде почта уходит по SMTP, а SMS включатся, когда появится
договор с провайдером. Сервисный слой знает только про `Notifier.send_otp` —
смена канала не трогает ни auth-логику, ни роуты.
"""

import logging
import smtplib
from abc import ABC, abstractmethod
from asyncio import to_thread
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


class NotifyError(RuntimeError):
    """Канал не смог доставить сообщение."""


class Notifier(ABC):
    """Базовый канал. Наследник умеет одно — доставить код получателю."""

    @abstractmethod
    async def send_otp(self, recipient: str, code: str) -> None: ...

    def otp_text(self, code: str) -> str:
        minutes = max(1, settings.otp_ttl_seconds // 60)
        return f"Код для входа в PlayerPro: {code}\nДействует {minutes} мин. Никому не сообщайте этот код."


class LogNotifier(Notifier):
    """Пишет код в лог — дев и UAT-стенд, где шлюзов ещё нет."""

    async def send_otp(self, recipient: str, code: str) -> None:
        logger.info("OTP for %s: %s", recipient, code)


class EmailNotifier(Notifier):
    """SMTP. smtplib синхронный, поэтому отправка уходит в поток: воркер uvicorn
    один (см. docs/deploy.md), и блокировка event loop подвесила бы весь API."""

    def build_message(self, recipient: str, code: str) -> EmailMessage:
        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = recipient
        message["Subject"] = "Код для входа в PlayerPro"
        message.set_content(self.otp_text(code))
        return message

    async def send_otp(self, recipient: str, code: str) -> None:
        if not settings.smtp_host:
            raise NotifyError("SMTP не настроен: задайте SMTP_HOST")
        await to_thread(self._send, self.build_message(recipient, code))

    def _send(self, message: EmailMessage) -> None:
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                if settings.smtp_starttls:
                    smtp.starttls()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
        except (smtplib.SMTPException, OSError) as exc:
            # Наружу отдаём нейтральную ошибку: детали SMTP — только в лог.
            logger.warning("SMTP send failed: %s", exc)
            raise NotifyError("Не удалось отправить письмо") from exc


class SmsNotifier(Notifier):
    """Каркас под SMS: провайдер не подключён.

    В России это договор с юрлицом и регистрация буквенной подписи отправителя у
    операторов (SMSC, МТС Exolve, Yandex Cloud Notification Service) — до этого
    канал включать нельзя. Когда провайдер появится, вся отправка живёт здесь,
    остальной код не меняется.
    """

    async def send_otp(self, recipient: str, code: str) -> None:
        raise NotifyError("SMS-канал не подключён: выберите провайдера")


_CHANNELS: dict[str, type[Notifier]] = {
    "log": LogNotifier,
    "email": EmailNotifier,
    "sms": SmsNotifier,
}

_cache: dict[str, Notifier] = {}


def get_notifier(kind: str) -> Notifier:
    """Канал для идентификатора: kind — "email" или "phone" (см. normalize_identifier)."""
    channel = settings.otp_email_channel if kind == "email" else settings.otp_phone_channel
    if channel not in _CHANNELS:
        raise NotifyError(f"Неизвестный канал {channel!r}, допустимы: {', '.join(sorted(_CHANNELS))}")
    if channel not in _cache:
        _cache[channel] = _CHANNELS[channel]()
    return _cache[channel]


def reset_notifiers() -> None:
    """Сбрасывает кэш каналов — нужен тестам, меняющим настройки на лету."""
    _cache.clear()
