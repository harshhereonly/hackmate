"""Outgoing email over SMTP.

When SMTP is not configured nothing is sent and callers are told so
("not_configured"). In development only, the action link is written to the
server console so the flow can be completed locally. The link is never
returned by the API, because that would let anyone reset anyone's password.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Literal

from app.core.config import Settings

logger = logging.getLogger("hackmate.email")

Delivery = Literal["sent", "not_configured", "failed"]


def mask_email(address: str) -> str:
    local, _, domain = address.partition("@")
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}***@{domain}" if domain else "***"


class EmailSender:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return self.settings.email_enabled

    def send(self, to: str, subject: str, body: str, *, purpose: str, dev_link: str | None = None) -> Delivery:
        settings = self.settings
        if not self.enabled:
            if dev_link and not settings.is_production:
                logger.warning(
                    "[DEV EMAIL NOT SENT] SMTP is not configured. %s link for %s: %s",
                    purpose, mask_email(to), dev_link,
                )
            else:
                logger.warning("Email delivery is not configured; %s email to %s was not sent.",
                               purpose, mask_email(to))
            return "not_configured"

        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        try:
            context = ssl.create_default_context()
            if settings.smtp_ssl:
                smtp: smtplib.SMTP = smtplib.SMTP_SSL(
                    settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds, context=context
                )
            else:
                smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds)
            with smtp:
                if not settings.smtp_ssl and settings.smtp_starttls:
                    smtp.starttls(context=context)
                if settings.smtp_username and settings.smtp_password:
                    smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
                smtp.send_message(message)
        except (smtplib.SMTPException, OSError) as exc:
            logger.error("Sending %s email to %s failed: %s", purpose, mask_email(to), exc.__class__.__name__)
            return "failed"
        return "sent"


def verification_email(name: str, link: str, hours: int) -> tuple[str, str]:
    return (
        "Verify your HackMate email",
        f"Hi {name},\n\nConfirm your email address for HackMate by opening this link:\n\n{link}\n\n"
        f"The link expires in {hours} hours. If you did not create an account, you can ignore this email.\n",
    )


def password_reset_email(name: str, link: str, minutes: int) -> tuple[str, str]:
    return (
        "Reset your HackMate password",
        f"Hi {name},\n\nSomeone (hopefully you) asked to reset your HackMate password. Open this link to "
        f"choose a new one:\n\n{link}\n\nThe link expires in {minutes} minutes and can be used once. "
        "If you did not request this, you can ignore this email; your password will not change.\n",
    )
