"""API de la Picadita del Viernes — FastAPI.

En Hetzner corre como proceso permanente (uvicorn) detrás de un reverse proxy.
Las rutas llevan el prefijo `/api` para que coincidan con lo que el proxy
reenvía y con el proxy de Vite en desarrollo.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import auth
from db import get_conn
from logic import compute_standings, order_queue, pick_assigned

app = FastAPI(title="Picadita del Viernes")

# El frontend se sirve del mismo origen (proxy en dev, mismo dominio en prod),
# así que las cookies viajan sin líos de CORS. Dejamos CORS restringido a same
# origin: no hace falta abrir a otros dominios.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Modelos de entrada
# --------------------------------------------------------------------------- #
class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class SetPinIn(BaseModel):
    member_id: str
    pin: str


class LoginIn(BaseModel):
    member_id: str
    pin: str


class TargetIn(BaseModel):
    member_id: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _load_state(conn):
    """Recalcula el asignado, lo persiste en current_state y devuelve el estado."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, active, created_at FROM members "
            "WHERE active = true ORDER BY created_at"
        )
        members = cur.fetchall()

        cur.execute(
            "SELECT member_id, date, status FROM turns "
            "WHERE status = 'completado'"
        )
        completed = cur.fetchall()

        cur.execute(
            "SELECT assigned_member_id, declined_this_round "
            "FROM current_state WHERE id = 1"
        )
        state_row = cur.fetchone() or {
            "assigned_member_id": None,
            "declined_this_round": [],
        }
        declined = [str(x) for x in (state_row["declined_this_round"] or [])]

        standings = compute_standings(members, completed)
        assigned_id, declined = pick_assigned(standings, declined)
        queue = order_queue(standings, declined)

        cur.execute(
            "UPDATE current_state SET assigned_member_id = %s, "
            "declined_this_round = %s WHERE id = 1",
            (assigned_id, declined),
        )

        cur.execute(
            "SELECT t.id, t.date, m.id AS member_id, m.name "
            "FROM turns t JOIN members m ON m.id = t.member_id "
            "WHERE t.status = 'completado' "
            "ORDER BY t.date DESC, t.created_at DESC LIMIT 15"
        )
        history = cur.fetchall()

    by_id = {e["id"]: e for e in standings}
    assigned = by_id.get(assigned_id) if assigned_id else None

    def serialize_member(e):
        return {
            "id": e["id"],
            "name": e["name"],
            "count": e["count"],
            "last_turn": _iso(e["last_turn"]),
        }

    return {
        "assigned": serialize_member(assigned) if assigned else None,
        "queue": [serialize_member(e) for e in queue],
        "members": [serialize_member(e) for e in sorted(
            standings, key=lambda x: (-x["count"], x["name"].lower()))],
        "declined_this_round": declined,
        "history": [
            {
                "id": str(h["id"]),
                "date": _iso(h["date"]),
                "member_id": str(h["member_id"]),
                "name": h["name"],
            }
            for h in history
        ],
    }


# --------------------------------------------------------------------------- #
# Autenticación
# --------------------------------------------------------------------------- #
@app.get("/api/auth/me")
def whoami(request: Request):
    mid = auth.read_member_id(request)
    if not mid:
        return {"member": None}
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name FROM members WHERE id = %s AND active = true",
            (mid,),
        )
        m = cur.fetchone()
    if not m:
        return {"member": None}
    return {"member": {"id": str(m["id"]), "name": m["name"]}}


@app.post("/api/auth/set-pin")
def set_pin(body: SetPinIn, response: Response):
    """Reclama una cuenta poniéndole PIN por primera vez."""
    pin = body.pin.strip()
    if not auth.valid_pin_format(pin):
        raise HTTPException(400, "El PIN deben ser entre 4 y 6 dígitos.")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, pin_hash, active FROM members WHERE id = %s",
            (body.member_id,),
        )
        m = cur.fetchone()
        if not m or not m["active"]:
            raise HTTPException(404, "Ese usuario no existe.")
        if m["pin_hash"] is not None:
            raise HTTPException(409, "Este usuario ya tiene PIN. Entra con él.")
        cur.execute(
            "UPDATE members SET pin_hash = %s, failed_attempts = 0, "
            "locked_until = NULL WHERE id = %s",
            (auth.hash_pin(pin), body.member_id),
        )
    auth.issue_cookie(response, body.member_id)
    return {"id": str(body.member_id)}


@app.post("/api/auth/login")
def login(body: LoginIn, response: Response):
    pin = body.pin.strip()
    now = datetime.now(timezone.utc)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, pin_hash, active, failed_attempts, locked_until "
            "FROM members WHERE id = %s",
            (body.member_id,),
        )
        m = cur.fetchone()
        if not m or not m["active"]:
            raise HTTPException(404, "Ese usuario no existe.")
        if m["pin_hash"] is None:
            raise HTTPException(409, "Este usuario aún no tiene PIN. Créalo.")
        if m["locked_until"] and m["locked_until"] > now:
            raise HTTPException(429, "Demasiados intentos. Prueba en unos minutos.")

        ok = auth.verify_pin(m["pin_hash"], pin)
        if ok:
            cur.execute(
                "UPDATE members SET failed_attempts = 0, locked_until = NULL "
                "WHERE id = %s",
                (m["id"],),
            )
        else:
            attempts = m["failed_attempts"] + 1
            locked = (
                now + timedelta(minutes=auth.LOCK_MINUTES)
                if attempts >= auth.MAX_FAILED_ATTEMPTS
                else None
            )
            cur.execute(
                "UPDATE members SET failed_attempts = %s, locked_until = %s "
                "WHERE id = %s",
                (0 if locked else attempts, locked, m["id"]),
            )
    # Fuera del `with` para que el contador de fallos SÍ se guarde antes de fallar.
    if not ok:
        raise HTTPException(401, "PIN incorrecto.")
    auth.issue_cookie(response, body.member_id)
    return {"id": str(body.member_id)}


@app.post("/api/auth/logout")
def logout(response: Response):
    auth.clear_cookie(response)
    return {"ok": True}


@app.post("/api/auth/reset-pin")
def reset_pin(body: TargetIn, _actor: str = Depends(auth.require_login)):
    """Borra el PIN de alguien (para que vuelva a reclamarlo si lo olvidó).

    Accesible para cualquier miembro logueado: es un equipo pequeño y de confianza.
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE members SET pin_hash = NULL, failed_attempts = 0, "
            "locked_until = NULL WHERE id = %s AND active = true RETURNING id",
            (body.member_id,),
        )
        if cur.fetchone() is None:
            raise HTTPException(404, "Ese usuario no existe.")
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Estado y miembros
# --------------------------------------------------------------------------- #
@app.get("/api/state")
def get_state():
    with get_conn() as conn:
        return _load_state(conn)


@app.get("/api/members")
def list_members():
    """Lista pública para la pantalla de login (incluye si ya tienen PIN)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, pin_hash IS NOT NULL AS has_pin FROM members "
            "WHERE active = true ORDER BY name"
        )
        return [
            {"id": str(m["id"]), "name": m["name"], "has_pin": m["has_pin"]}
            for m in cur.fetchall()
        ]


@app.post("/api/members", status_code=201)
def create_member(body: MemberIn, _actor: str = Depends(auth.require_login)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "El nombre no puede estar vacío.")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO members (name) VALUES (%s) RETURNING id, name",
            (name,),
        )
        row = cur.fetchone()
        return {"id": str(row["id"]), "name": row["name"]}


@app.delete("/api/members/{member_id}")
def deactivate_member(member_id: str, _actor: str = Depends(auth.require_login)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE members SET active = false WHERE id = %s RETURNING id",
                (member_id,),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Ese miembro no existe.")
            cur.execute(
                "UPDATE current_state "
                "SET declined_this_round = array_remove(declined_this_round, %s) "
                "WHERE id = 1",
                (member_id,),
            )
        return _load_state(conn)


# --------------------------------------------------------------------------- #
# Acciones sobre el turno (el actor sale de la sesión, no del cliente)
# --------------------------------------------------------------------------- #
@app.post("/api/turns/complete")
def complete_turn(actor: str = Depends(auth.require_login)):
    with get_conn() as conn:
        state = _load_state(conn)
        assigned = state["assigned"]
        if not assigned or assigned["id"] != actor:
            raise HTTPException(
                409,
                "Ese turno ya no es tuyo. Refresca para ver a quién le toca.",
            )
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO turns (member_id, date, status) "
                "VALUES (%s, %s, 'completado')",
                (actor, date.today()),
            )
            cur.execute(
                "UPDATE current_state SET declined_this_round = '{}' WHERE id = 1"
            )
        return _load_state(conn)


@app.post("/api/turns/decline")
def decline_turn(actor: str = Depends(auth.require_login)):
    with get_conn() as conn:
        state = _load_state(conn)
        assigned = state["assigned"]
        if not assigned or assigned["id"] != actor:
            raise HTTPException(
                409,
                "Ese turno ya no es tuyo. Refresca para ver a quién le toca.",
            )
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE current_state "
                "SET declined_this_round = "
                "  array_append(declined_this_round, %s::uuid) "
                "WHERE id = 1 AND NOT (%s::uuid = ANY(declined_this_round))",
                (actor, actor),
            )
        return _load_state(conn)
