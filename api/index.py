"""API de la Picadita del Viernes — FastAPI sobre funciones serverless de Vercel.

Vercel detecta la variable `app` (ASGI) y la sirve. El `vercel.json` redirige
todas las rutas `/api/*` a este único fichero, así que definimos las rutas con
el prefijo `/api` para que funcionen igual en local y en producción.
"""

from datetime import date
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import get_conn
from logic import compute_standings, order_queue, pick_assigned

app = FastAPI(title="Picadita del Viernes")

# En Vercel el frontend se sirve del mismo dominio, pero permitimos CORS abierto
# para poder desarrollar el frontend en localhost:5173 contra la API desplegada.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Modelos de entrada
# --------------------------------------------------------------------------- #
class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class TurnAction(BaseModel):
    member_id: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _load_state(conn):
    """Recalcula el asignado, lo persiste en current_state y devuelve el estado.

    Devuelve un dict listo para serializar por GET /api/state.
    """
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

        # Persistimos la caché de asignación.
        cur.execute(
            "UPDATE current_state SET assigned_member_id = %s, "
            "declined_this_round = %s WHERE id = 1",
            (assigned_id, declined),
        )

        # Historial reciente (últimos 15 completados con nombre).
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
# Rutas
# --------------------------------------------------------------------------- #
@app.get("/api/state")
def get_state():
    with get_conn() as conn:
        return _load_state(conn)


@app.get("/api/members")
def list_members():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name FROM members WHERE active = true "
            "ORDER BY name"
        )
        return [{"id": str(m["id"]), "name": m["name"]} for m in cur.fetchall()]


@app.post("/api/members", status_code=201)
def create_member(body: MemberIn):
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
def deactivate_member(member_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE members SET active = false WHERE id = %s "
                "RETURNING id",
                (member_id,),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Ese miembro no existe.")
            # Lo quitamos también de la ronda de declinados si estuviera.
            cur.execute(
                "UPDATE current_state "
                "SET declined_this_round = array_remove(declined_this_round, %s) "
                "WHERE id = 1",
                (member_id,),
            )
        # Recalcula la asignación (por si era el asignado).
        return _load_state(conn)


@app.post("/api/turns/complete")
def complete_turn(body: TurnAction):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verificamos que quien marca es realmente el asignado actual.
            state = _load_state(conn)
            assigned = state["assigned"]
            if not assigned or assigned["id"] != str(body.member_id):
                raise HTTPException(
                    409,
                    "Ese turno ya no es tuyo. Refresca para ver a quién le toca.",
                )
            cur.execute(
                "INSERT INTO turns (member_id, date, status) "
                "VALUES (%s, %s, 'completado')",
                (body.member_id, date.today()),
            )
            # Comprar limpia la ronda de declinados.
            cur.execute(
                "UPDATE current_state SET declined_this_round = '{}' "
                "WHERE id = 1"
            )
        return _load_state(conn)


@app.post("/api/turns/decline")
def decline_turn(body: TurnAction):
    with get_conn() as conn:
        with conn.cursor() as cur:
            state = _load_state(conn)
            assigned = state["assigned"]
            if not assigned or assigned["id"] != str(body.member_id):
                raise HTTPException(
                    409,
                    "Ese turno ya no es tuyo. Refresca para ver a quién le toca.",
                )
            cur.execute(
                "UPDATE current_state "
                "SET declined_this_round = "
                "  array_append(declined_this_round, %s::uuid) "
                "WHERE id = 1 AND NOT (%s::uuid = ANY(declined_this_round))",
                (body.member_id, body.member_id),
            )
        return _load_state(conn)
