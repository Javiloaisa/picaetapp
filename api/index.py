"""API de la Picaeta del Divendres — FastAPI.

En Hetzner corre como proceso permanente (uvicorn) detrás del reverse proxy
compartido (Caddy). Las rutas llevan el prefijo `/api`.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import auth
import push
from db import get_conn
from logic import compute_standings, order_queue, pick_assigned

app = FastAPI(title="Picaeta del Divendres")

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


class VacationIn(BaseModel):
    on: bool


class SubscribeIn(BaseModel):
    subscription: dict[str, Any]


class UnsubscribeIn(BaseModel):
    endpoint: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _load_state(conn):
    """Recalcula el asignado (excluyendo vacaciones), lo cachea y devuelve todo."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, active, created_at, on_vacation FROM members "
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
        # Quien esté de vacaciones no entra en el reparto (ni asignado ni cola).
        assignable = [s for s in standings if not s["on_vacation"]]
        assigned_id, declined = pick_assigned(assignable, declined)
        queue = order_queue(assignable, declined)

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
            "on_vacation": e["on_vacation"],
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
            "SELECT id, name, on_vacation FROM members "
            "WHERE id = %s AND active = true",
            (mid,),
        )
        m = cur.fetchone()
    if not m:
        return {"member": None}
    return {"member": {"id": str(m["id"]), "name": m["name"],
                       "on_vacation": m["on_vacation"]}}


@app.post("/api/auth/set-pin")
def set_pin(body: SetPinIn, response: Response):
    """Reclama una cuenta poniéndole PIN por primera vez."""
    pin = body.pin.strip()
    if not auth.valid_pin_format(pin):
        raise HTTPException(400, "El PIN ha de tindre entre 4 i 6 xifres.")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, pin_hash, active FROM members WHERE id = %s",
            (body.member_id,),
        )
        m = cur.fetchone()
        if not m or not m["active"]:
            raise HTTPException(404, "Eixe usuari no existix.")
        if m["pin_hash"] is not None:
            raise HTTPException(409, "Este usuari ja té PIN. Entra amb ell.")
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
            raise HTTPException(404, "Eixe usuari no existix.")
        if m["pin_hash"] is None:
            raise HTTPException(409, "Este usuari encara no té PIN. Crea'l.")
        if m["locked_until"] and m["locked_until"] > now:
            raise HTTPException(429, "Massa intents. Prova d'ací a uns minuts.")

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
    if not ok:
        raise HTTPException(401, "PIN incorrecte.")
    auth.issue_cookie(response, body.member_id)
    return {"id": str(body.member_id)}


@app.post("/api/auth/logout")
def logout(response: Response):
    auth.clear_cookie(response)
    return {"ok": True}


@app.post("/api/auth/reset-pin")
def reset_pin(body: TargetIn, _actor: str = Depends(auth.require_login)):
    """Borra el PIN de alguien (para que vuelva a reclamarlo si lo olvidó)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE members SET pin_hash = NULL, failed_attempts = 0, "
            "locked_until = NULL WHERE id = %s AND active = true RETURNING id",
            (body.member_id,),
        )
        if cur.fetchone() is None:
            raise HTTPException(404, "Eixe usuari no existix.")
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
        raise HTTPException(400, "El nom no pot estar buit.")
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
                raise HTTPException(404, "Eixe membre no existix.")
            cur.execute(
                "UPDATE current_state "
                "SET declined_this_round = array_remove(declined_this_round, %s) "
                "WHERE id = 1",
                (member_id,),
            )
        return _load_state(conn)


@app.post("/api/members/vacation")
def set_vacation(body: VacationIn, actor: str = Depends(auth.require_login)):
    """El usuario activa/desactiva su propio modo vacaciones."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE members SET on_vacation = %s WHERE id = %s",
                (body.on, actor),
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
                "Eixe torn ja no és teu. Refresca per a vore a qui li toca.",
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
                "Eixe torn ja no és teu. Refresca per a vore a qui li toca.",
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


# --------------------------------------------------------------------------- #
# Notificaciones push (Web Push)
# --------------------------------------------------------------------------- #
@app.get("/api/push/public-key")
def push_public_key():
    return {"key": push.public_key()}


@app.post("/api/push/subscribe")
def push_subscribe(body: SubscribeIn, actor: str = Depends(auth.require_login)):
    sub = body.subscription
    endpoint = sub.get("endpoint")
    keys = sub.get("keys") or {}
    p256dh = keys.get("p256dh")
    authk = keys.get("auth")
    if not (endpoint and p256dh and authk):
        raise HTTPException(400, "Subscripció de push no vàlida.")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO push_subscriptions (member_id, endpoint, p256dh, auth) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (endpoint) DO UPDATE SET "
            "  member_id = EXCLUDED.member_id, p256dh = EXCLUDED.p256dh, "
            "  auth = EXCLUDED.auth",
            (actor, endpoint, p256dh, authk),
        )
    return {"ok": True}


@app.post("/api/push/unsubscribe")
def push_unsubscribe(body: UnsubscribeIn, actor: str = Depends(auth.require_login)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = %s AND member_id = %s",
            (body.endpoint, actor),
        )
    return {"ok": True}


@app.post("/api/push/remind")
def push_remind(body: TargetIn, actor: str = Depends(auth.require_login)):
    """Envía una notificación push a la persona a la que le toca."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT name FROM members WHERE id = %s", (actor,))
        me = cur.fetchone()
        cur.execute(
            "SELECT name FROM members WHERE id = %s AND active = true",
            (body.member_id,),
        )
        target = cur.fetchone()
        if not target:
            raise HTTPException(404, "Eixe membre no existix.")
        cur.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions "
            "WHERE member_id = %s",
            (body.member_id,),
        )
        subs = cur.fetchall()

    who = me["name"] if me else "algú"
    sent = 0
    dead: list[str] = []
    for s in subs:
        sub_info = {
            "endpoint": s["endpoint"],
            "keys": {"p256dh": s["p256dh"], "auth": s["auth"]},
        }
        ok, code = push.send(
            sub_info,
            "Et toca la picaeta! 🫒",
            f"{who} et recorda que este divendres la portes tu.",
            "/",
        )
        if ok:
            sent += 1
        elif code in (404, 410):
            dead.append(s["endpoint"])

    if dead:
        with get_conn() as conn, conn.cursor() as cur:
            for endpoint in dead:
                cur.execute(
                    "DELETE FROM push_subscriptions WHERE endpoint = %s",
                    (endpoint,),
                )

    return {"sent": sent, "has_subscription": len(subs) > 0}
