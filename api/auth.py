"""Autenticación por PIN.

Cada miembro protege sus acciones con un PIN de 4-6 dígitos que guardamos
**hasheado con argon2** (nunca en claro). La sesión viaja en una cookie
HttpOnly firmada con `SECRET_KEY` (itsdangerous), así que el navegador no puede
manipularla y el JavaScript de la página no puede leerla.

El PIN tiene poca entropía por naturaleza, así que además:
  - argon2 hace lento cada intento,
  - bloqueamos la cuenta unos minutos tras varios fallos seguidos (ver index.py).
"""

import os
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

COOKIE_NAME = "picadita_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 90  # 90 días: que no haya que re-loguear cada vez
MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 5

_ph = PasswordHasher()


def _secret() -> str:
    s = os.environ.get("SECRET_KEY")
    if not s:
        raise RuntimeError(
            "Falta la variable de entorno SECRET_KEY "
            "(clave para firmar la cookie de sesión)."
        )
    return s


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_secret(), salt="picadita-session")


def hash_pin(pin: str) -> str:
    return _ph.hash(pin)


def verify_pin(pin_hash: str, pin: str) -> bool:
    try:
        _ph.verify(pin_hash, pin)
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False


def valid_pin_format(pin: str) -> bool:
    return pin.isdigit() and 4 <= len(pin) <= 6


def issue_cookie(response: Response, member_id: str) -> None:
    token = _serializer().dumps({"mid": str(member_id)})
    # En local sobre http hay que poner COOKIE_SECURE=0; en producción (HTTPS)
    # se deja en 1 para que la cookie solo viaje cifrada.
    secure = os.environ.get("COOKIE_SECURE", "1") != "0"
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def read_member_id(request: Request) -> Optional[str]:
    """Devuelve el member_id de la cookie si es válida y no ha caducado."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        data = _serializer().loads(token, max_age=COOKIE_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("mid")


def require_login(request: Request) -> str:
    """Dependencia de FastAPI: exige sesión válida y devuelve el member_id."""
    mid = read_member_id(request)
    if not mid:
        raise HTTPException(401, "Necesitas iniciar sesión.")
    return mid
