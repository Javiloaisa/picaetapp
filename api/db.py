"""Conexión a Postgres (Neon) para las funciones serverless de Vercel.

Cada invocación serverless abre y cierra su propia conexión: en un entorno
sin estado no merece la pena mantener un pool de proceso. Neon ofrece un
endpoint de pooling (usa la connection string con `-pooler`) para que esto
escale sin problemas con un equipo pequeño.
"""

import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError(
            "Falta la variable de entorno DATABASE_URL "
            "(la connection string de Neon)."
        )
    return dsn


@contextmanager
def get_conn():
    """Abre una conexión con filas como diccionarios y la cierra al salir."""
    conn = psycopg.connect(_dsn(), row_factory=dict_row, autocommit=False)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
