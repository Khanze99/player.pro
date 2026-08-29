"""Каналы доставки сообщений (app/services/notify_service.py)."""

import logging

import pytest

from app.config import settings
from app.services.notify_service import (
    EmailNotifier,
    LogNotifier,
    NotifyError,
    SmsNotifier,
    get_notifier,
    reset_notifiers,
)


@pytest.fixture(autouse=True)
def restore_channels():
    """Каналы — глобальная настройка: возвращаем как было, иначе течёт в соседние тесты."""
    email, phone = settings.otp_email_channel, settings.otp_phone_channel
    yield
    settings.otp_email_channel, settings.otp_phone_channel = email, phone
    reset_notifiers()


def set_channels(email: str = "log", phone: str = "log") -> None:
    settings.otp_email_channel, settings.otp_phone_channel = email, phone
    reset_notifiers()


def test_channel_selected_per_identifier_kind():
    set_channels(email="email", phone="sms")
    assert isinstance(get_notifier("email"), EmailNotifier)
    assert isinstance(get_notifier("phone"), SmsNotifier)


def test_unknown_channel_rejected():
    set_channels(email="carrier-pigeon")
    with pytest.raises(NotifyError, match="Неизвестный канал"):
        get_notifier("email")


async def test_log_notifier_writes_code(caplog):
    with caplog.at_level(logging.INFO, logger="app.services.notify_service"):
        await LogNotifier().send_otp("player@example.com", "123456")
    assert "123456" in caplog.text


async def test_sms_channel_not_wired_yet():
    with pytest.raises(NotifyError, match="SMS-канал"):
        await SmsNotifier().send_otp("+79123456789", "123456")


async def test_email_requires_smtp_host():
    host = settings.smtp_host
    settings.smtp_host = ""
    try:
        with pytest.raises(NotifyError, match="SMTP не настроен"):
            await EmailNotifier().send_otp("player@example.com", "123456")
    finally:
        settings.smtp_host = host


def test_email_message_carries_code_and_ttl():
    notifier = EmailNotifier()
    message = notifier.build_message("player@example.com", "Код", notifier.otp_text("123456"))
    assert message["To"] == "player@example.com"
    assert message["From"] == settings.smtp_from
    body = message.get_content()
    assert "123456" in body
    assert f"{settings.otp_ttl_seconds // 60} мин" in body


def test_invite_text_names_org_and_login_address():
    """Письмо должно объяснять ровно одно: каким адресом входить."""
    text = LogNotifier().invite_text("player@example.com", "ФК Рубин")
    assert "ФК Рубин" in text
    assert "player@example.com" in text
    assert f"{settings.invite_ttl_days} дн" in text


async def test_send_invite_goes_through_channel(caplog):
    with caplog.at_level(logging.INFO, logger="app.services.notify_service"):
        await LogNotifier().send_invite("player@example.com", "ФК Рубин")
    assert "Приглашение" in caplog.text
    assert "player@example.com" in caplog.text


async def test_request_otp_reports_delivery_failure(client):
    """Канал недоступен → 503, а не молчаливое «код отправлен»."""
    set_channels(email="sms")  # sms-канал заведомо не подключён
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": "fail@example.com"})
    assert resp.status_code == 503
