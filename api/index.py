"""API de la Picaeta del Divendres — FastAPI.

En Hetzner corre como proceso permanente (uvicorn) detrás del reverse proxy
compartido (Caddy). Las rutas llevan el prefijo `/api`.
"""

import threading
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import auth
import push
from db import get_conn
from logic import (
    compute_standings,
    current_friday,
    is_away,
    missing_fridays,
    order_queue,
    pick_assigned,
)

# La picaeta es en viernes: todo el cálculo de días va en hora de España, sin
# depender de la zona del contenedor (el paquete tzdata trae los datos).
TZ = ZoneInfo("Europe/Madrid")


def _today() -> date:
    return datetime.now(TZ).date()


app = FastAPI(title="PicaetApp")

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


class AwayIn(BaseModel):
    # Fecha de vuelta (ISO 'YYYY-MM-DD') o null para volver a estar disponible.
    until: Optional[str] = None
    # A quién se le pone (por si marcas a un compañero). None = uno mismo.
    member_id: Optional[str] = None


class DeclineIn(BaseModel):
    # A quién se le pasa el turno. None = uno mismo ("esta setmana no puc").
    # Con member_id marcas que el asignado "no està" (p. ej. no entra en la app).
    member_id: Optional[str] = None


class AttendanceIn(BaseModel):
    coming: bool
    # De quién es la respuesta. None = uno mismo.
    member_id: Optional[str] = None


class SubscribeIn(BaseModel):
    subscription: dict[str, Any]


class UnsubscribeIn(BaseModel):
    endpoint: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _standings_and_declined(conn, today: date):
    """Lee miembros activos, turnos y ronda; calcula standings y asignables."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, active, created_at, away_until FROM members "
            "WHERE active = true ORDER BY created_at"
        )
        members = cur.fetchall()
        cur.execute(
            "SELECT member_id, date, status FROM turns WHERE status = 'completado'"
        )
        completed = cur.fetchall()
        cur.execute("SELECT declined_this_round FROM current_state WHERE id = 1")
        row = cur.fetchone()
    declined = [str(x) for x in ((row and row["declined_this_round"]) or [])]
    standings = compute_standings(members, completed)
    # Quien esté de vacaciones (away_until >= hoy) no entra en el reparto.
    assignable = [s for s in standings if not is_away(s["away_until"], today)]
    return standings, assignable, declined


def _catch_up(conn, today: date) -> None:
    """Da por hecho cada viernes vencido: apunta el turno de quien tocara.

    'Si pasa el viernes, se da por hecho que la ha portado.' Nadie tiene que
    marcar nada: al cargar el estado (o desde la tarea semanal) se rellenan los
    viernes pasados sin picaeta con el asignado de ese momento y se avanza.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT date FROM turns WHERE status = 'completado'")
        dates = [r["date"] for r in cur.fetchall()]
    for friday in missing_fridays(dates, today):
        _, assignable, declined = _standings_and_declined(conn, today)
        assigned_id, _ = pick_assigned(assignable, declined)
        if not assigned_id:
            continue  # nadie disponible esa semana: se salta, sin cobrar a nadie
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO turns (member_id, date, status) "
                "VALUES (%s, %s, 'completado')",
                (assigned_id, friday),
            )
            cur.execute(
                "UPDATE current_state SET declined_this_round = '{}' WHERE id = 1"
            )


def _notify_assigned(conn, today: date) -> None:
    """Avisa por push al que le toca esta semana (una vez por persona/semana)."""
    if not push.configured():
        return
    _catch_up(conn, today)
    _, assignable, declined = _standings_and_declined(conn, today)
    assigned_id, _ = pick_assigned(assignable, declined)
    if not assigned_id:
        return

    friday = current_friday(today)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT last_notified_member, last_notified_friday "
            "FROM current_state WHERE id = 1 FOR UPDATE"
        )
        st = cur.fetchone() or {}
    if (st.get("last_notified_friday") == friday
            and str(st.get("last_notified_member") or "") == assigned_id):
        return  # ya avisado a esta persona para esta semana

    with conn.cursor() as cur:
        cur.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions "
            "WHERE member_id = %s",
            (assigned_id,),
        )
        subs = cur.fetchall()

    if not subs:
        # Aún no tiene notificaciones activadas: no lo marcamos como avisado,
        # así recibirá el push en cuanto suscriba un dispositivo.
        return

    dead: list[str] = []
    for s in subs:
        _, code = push.send(
            {"endpoint": s["endpoint"],
             "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
            "Et toca la picaeta! 🫒",
            "Esta setmana la portes tu. Si no pots o estàs de vacances, dis-ho ací.",
            "/",
            kind="turn",
        )
        if code in (404, 410):
            dead.append(s["endpoint"])

    with conn.cursor() as cur:
        for endpoint in dead:
            cur.execute(
                "DELETE FROM push_subscriptions WHERE endpoint = %s", (endpoint,)
            )
        cur.execute(
            "UPDATE current_state SET last_notified_member = %s, "
            "last_notified_friday = %s WHERE id = 1",
            (assigned_id, friday),
        )


def _load_state(conn):
    """Pone al día los viernes vencidos, recalcula el asignado y devuelve todo."""
    today = _today()
    _catch_up(conn, today)
    standings, assignable, declined = _standings_and_declined(conn, today)
    assigned_id, declined = pick_assigned(assignable, declined)
    queue = order_queue(assignable, declined)

    friday = current_friday(today)
    with conn.cursor() as cur:
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
        cur.execute(
            "SELECT member_id, coming FROM attendance WHERE friday = %s",
            (friday,),
        )
        attendance = cur.fetchall()

    by_id = {e["id"]: e for e in standings}
    assigned = by_id.get(assigned_id) if assigned_id else None

    def serialize_member(e):
        return {
            "id": e["id"],
            "name": e["name"],
            "count": e["count"],
            "last_turn": _iso(e["last_turn"]),
            "away_until": _iso(e["away_until"]),
        }

    return {
        "assigned": serialize_member(assigned) if assigned else None,
        "queue": [serialize_member(e) for e in queue],
        "members": [serialize_member(e) for e in sorted(
            standings, key=lambda x: (-x["count"], x["name"].lower()))],
        "declined_this_round": declined,
        "friday": _iso(friday),
        "attendance": [
            {"member_id": str(a["member_id"]), "coming": a["coming"]}
            for a in attendance
        ],
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
            "SELECT id, name, away_until FROM members "
            "WHERE id = %s AND active = true",
            (mid,),
        )
        m = cur.fetchone()
    if not m:
        return {"member": None}
    return {"member": {"id": str(m["id"]), "name": m["name"],
                       "away_until": _iso(m["away_until"])}}


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


@app.post("/api/members/away")
def set_away(body: AwayIn, actor: str = Depends(auth.require_login)):
    """Marca hasta cuándo alguien está de vacaciones (o null para volver ya).

    Por defecto te marcas tú, pero puedes pasar `member_id` para marcar a un
    compañero (equipo pequeño de confianza; útil si él no entra en la app).
    Con fecha de vuelta no hace falta acordarse de "volver": al pasar esa
    fecha, el reparto justo lo tiene en cuenta otra vez de forma automática.
    """
    target = body.member_id or actor
    until: Optional[date] = None
    if body.until:
        try:
            until = date.fromisoformat(body.until)
        except ValueError:
            raise HTTPException(400, "Data de tornada no vàlida.")
        if until < _today():
            raise HTTPException(400, "La data de tornada ha de ser futura.")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE members SET away_until = %s "
                "WHERE id = %s AND active = true RETURNING id",
                (until, target),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Eixe membre no existix.")
        return _load_state(conn)


# --------------------------------------------------------------------------- #
# Acciones sobre el turno (el actor sale de la sesión, no del cliente)
#
# Ya NO hay "ja l'he portada": si pasa el viernes, se da por hecho que la ha
# comprado el asignado (lo registra _catch_up). Solo queda declinar la semana.
# --------------------------------------------------------------------------- #
@app.post("/api/turns/decline")
def decline_turn(body: DeclineIn = DeclineIn(),
                 actor: str = Depends(auth.require_login)):
    """Pasa el turno de esta semana al siguiente.

    Sin `member_id`: declinas tú ("esta setmana no puc"). Con `member_id`:
    marcas que el asignado NO ESTÀ (p. ej. no entra en la app). En ambos casos
    solo se pospone, no cuenta como turno comprado.
    """
    target = body.member_id or actor
    with get_conn() as conn:
        state = _load_state(conn)
        assigned = state["assigned"]
        if not assigned or assigned["id"] != target:
            raise HTTPException(
                409,
                "Eixe torn ja no és seu. Refresca per a vore a qui li toca.",
            )
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE current_state "
                "SET declined_this_round = "
                "  array_append(declined_this_round, %s::uuid) "
                "WHERE id = 1 AND NOT (%s::uuid = ANY(declined_this_round))",
                (target, target),
            )
        # Le toca a otro: avísale por push (si tiene notificaciones).
        _notify_assigned(conn, _today())
        return _load_state(conn)


@app.post("/api/attendance")
def set_attendance(body: AttendanceIn, actor: str = Depends(auth.require_login)):
    """Confirma si alguien viene a la picaeta de este viernes (Vinc / No vinc).

    Por defecto respondes por ti; con `member_id` respondes por un compañero.
    Es SOLO informativo (cuenta cabezas): no cambia quién compra.
    """
    target = body.member_id or actor
    friday = current_friday(_today())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM members WHERE id = %s AND active = true",
                (target,),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Eixe membre no existix.")
            cur.execute(
                "INSERT INTO attendance (member_id, friday, coming) "
                "VALUES (%s, %s, %s) "
                "ON CONFLICT (member_id, friday) DO UPDATE SET "
                "  coming = EXCLUDED.coming, updated_at = now()",
                (target, friday, body.coming),
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
            kind="turn",
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


# --------------------------------------------------------------------------- #
# Tarea semanal: avisar sola a quien le toca (así nadie tiene que acordarse)
#
# Corre en el propio proceso de la API (por eso el Dockerfile usa 1 worker).
# El envío es idempotente: no repite el aviso a la misma persona/semana.
# --------------------------------------------------------------------------- #
# APScheduler 3.x solo admite timezones de pytz: se pasa como cadena (la
# resuelve él). El cálculo de días de la app va aparte, con ZoneInfo (_today).
scheduler = BackgroundScheduler(timezone="Europe/Madrid")


def _weekly_notify_job() -> None:
    try:
        with get_conn() as conn:
            _notify_assigned(conn, _today())
    except Exception:
        # Un fallo de red/push no debe tumbar el planificador.
        pass


@app.on_event("startup")
def _ensure_schema() -> None:
    """Crea la taula d'assistència si encara no existix (deploys ja engegats).

    schema.sql només corre amb la BD buida, així que en producció fem la DDL
    ací (idempotent) per a no haver d'entrar a psql després d'un git pull.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "CREATE TABLE IF NOT EXISTS attendance ("
                "  member_id uuid REFERENCES members(id) ON DELETE CASCADE,"
                "  friday date NOT NULL,"
                "  coming boolean NOT NULL,"
                "  updated_at timestamptz DEFAULT now(),"
                "  PRIMARY KEY (member_id, friday))"
            )
    except Exception:
        # Si la BD encara no està llesta, ja es crearà via schema.sql.
        pass


@app.on_event("startup")
def _start_scheduler() -> None:
    # Lunes por la mañana: pone al día el viernes pasado y avisa al de esta semana.
    scheduler.add_job(
        _weekly_notify_job, "cron", day_of_week="mon", hour=9, minute=0,
        id="weekly_notify", replace_existing=True,
    )
    scheduler.start()
    # Y un aviso al arrancar (por si se despliega a mitad de semana); idempotente.
    threading.Timer(15, _weekly_notify_job).start()


@app.on_event("shutdown")
def _stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
