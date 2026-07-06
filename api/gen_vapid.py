"""Genera un par de claves VAPID para las notificaciones push.

Uso:  python gen_vapid.py
Copia las dos líneas resultantes en tu .env.
"""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def main() -> None:
    pk = ec.generate_private_key(ec.SECP256R1())
    priv_raw = pk.private_numbers().private_value.to_bytes(32, "big")
    pub_raw = pk.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    print("VAPID_PUBLIC_KEY=" + _b64url(pub_raw))
    print("VAPID_PRIVATE_KEY=" + _b64url(priv_raw))


if __name__ == "__main__":
    main()
