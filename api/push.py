"""Notificaciones Web Push (VAPID) con pywebpush.

Claves en variables de entorno (ambas en base64url, una línea):
  - VAPID_PUBLIC_KEY  : clave pública (la usa el navegador como applicationServerKey).
  - VAPID_PRIVATE_KEY : clave privada en crudo (los 32 bytes en base64url).
  - VAPID_SUBJECT     : "mailto:tu@correo" (contacto para el servicio de push).

Genera un par con: python gen_vapid.py  (ver README).
"""

import json
import os
from typing import Any, Optional

from pywebpush import WebPushException, webpush


def public_key() -> str:
    return os.environ.get("VAPID_PUBLIC_KEY", "")


def _private_key() -> Optional[str]:
    return os.environ.get("VAPID_PRIVATE_KEY") or None


def _subject() -> str:
    return os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")


def configured() -> bool:
    return bool(public_key() and _private_key())


def send(subscription: dict[str, Any], title: str, body: str,
         url: str = "/") -> tuple[bool, int]:
    """Envía una notificación. Devuelve (enviada, http_status).

    status 404/410 significa que la suscripción caducó y hay que borrarla.
    """
    key = _private_key()
    if not key:
        return False, 0
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=key,
            vapid_claims={"sub": _subject()},
            timeout=10,
        )
        return True, 201
    except WebPushException as e:
        code = e.response.status_code if e.response is not None else 0
        return False, code
