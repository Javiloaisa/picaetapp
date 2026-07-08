"""Lógica de reparto justo de la picadita.

El objetivo es que a lo largo del año todo el mundo compre un número parecido
de veces. La regla es sencilla:

  1. Le toca a quien menos veces haya comprado (`completado`).
  2. Si hay empate, a quien lleve más tiempo sin comprar (o nunca lo haya
     hecho).
  3. Se excluye a quien ya dijo "no puedo esta semana" en la ronda actual
     (`declined_this_round`). Declinar NO cuenta como turno: solo te pospone.
  4. Si todos los activos han declinado, se resetea la ronda para no bloquear.

Todo se recalcula sobre la marcha a partir del historial de `turns`, así que
`current_state.assigned_member_id` es solo una caché del resultado.
"""

from datetime import date, timedelta
from typing import Any, Optional


def friday_of_week(d: date) -> date:
    """La fecha del viernes de la semana de `d` (la picaeta es en viernes).

    Lunes(0)..Domingo(6); viernes = 4. Para un sábado/domingo devuelve el
    viernes que acaba de pasar; para lunes-viernes, el de esa misma semana.
    """
    return d + timedelta(days=(4 - d.weekday()))


def current_friday(today: date) -> date:
    """El divendres de referència per a l'assistència d'esta setmana.

    Si el de la setmana ja va passar (cap de setmana), apunta al pròxim, que és
    el que la gent vol confirmar.
    """
    f = friday_of_week(today)
    return f if f >= today else f + timedelta(days=7)


def missing_fridays(turn_dates: list[date], today: date,
                    max_weeks: int = 520) -> list[date]:
    """Viernes ya pasados (anteriores a hoy) sin picaeta registrada.

    Se arranca desde la semana siguiente al último turno conocido y se avanza
    semana a semana hasta el último viernes estrictamente anterior a `today`.
    Así, "si pasa el viernes, se da por hecho": cada viernes vencido que no
    tenga turno se rellenará con quien estuviera asignado.
    """
    if not turn_dates:
        return []
    done_weeks = {friday_of_week(d) for d in turn_dates}
    f = friday_of_week(max(turn_dates))
    out: list[date] = []
    for _ in range(max_weeks):
        f = f + timedelta(days=7)
        if f >= today:          # el viernes de esta semana aún no ha pasado
            break
        if f not in done_weeks:
            out.append(f)
    return out


def is_away(away_until: Optional[date], today: date) -> bool:
    """Está de vacaciones si tiene fecha de vuelta y aún no ha llegado."""
    return away_until is not None and away_until >= today


def compute_standings(members: list[dict[str, Any]],
                      turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Devuelve, por cada miembro activo, su contador y su último turno.

    `members` son los miembros activos. `turns` son todas las filas de turnos
    con status 'completado' (ordenadas o no, da igual).
    """
    completed_count: dict[str, int] = {}
    last_completed: dict[str, Optional[date]] = {}

    for t in turns:
        if t["status"] != "completado":
            continue
        mid = str(t["member_id"])
        completed_count[mid] = completed_count.get(mid, 0) + 1
        d = t["date"]
        prev = last_completed.get(mid)
        if prev is None or d > prev:
            last_completed[mid] = d

    standings = []
    for m in members:
        mid = str(m["id"])
        standings.append({
            "id": mid,
            "name": m["name"],
            "count": completed_count.get(mid, 0),
            "last_turn": last_completed.get(mid),
            "created_at": m["created_at"],
            "away_until": m.get("away_until"),
        })
    return standings


def _sort_key(entry: dict[str, Any]):
    """Menor contador primero; luego el que lleva más tiempo sin comprar.

    `last_turn` None (nunca compró) debe ir el primero => usamos date.min.
    Desempate final estable por fecha de alta y nombre.
    """
    last = entry["last_turn"] or date.min
    return (entry["count"], last, entry["created_at"], entry["name"].lower())


def order_queue(standings: list[dict[str, Any]],
                declined: list[str]) -> list[dict[str, Any]]:
    """Cola ordenada de quién compra antes, ignorando la ronda de declinados."""
    declined_set = {str(d) for d in declined}
    ordered = sorted(standings, key=_sort_key)
    # Los que han declinado esta ronda van al final, manteniendo su orden justo.
    eligibles = [e for e in ordered if e["id"] not in declined_set]
    postponed = [e for e in ordered if e["id"] in declined_set]
    return eligibles + postponed


def pick_assigned(standings: list[dict[str, Any]],
                  declined: list[str]) -> tuple[Optional[str], list[str]]:
    """Elige al asignado actual y devuelve (member_id, declined_normalizado).

    Si todos los activos han declinado, resetea la ronda (declined vacío).
    """
    if not standings:
        return None, []

    active_ids = {e["id"] for e in standings}
    declined = [str(d) for d in declined if str(d) in active_ids]

    eligibles = [e for e in standings if e["id"] not in set(declined)]
    if not eligibles:
        # Todos declinaron: reseteamos la ronda.
        declined = []
        eligibles = standings

    assigned = min(eligibles, key=_sort_key)
    return assigned["id"], declined
