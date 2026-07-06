# 🫒 La Picadita del Viernes

App interna para que un equipo pequeño (7-9 personas) reparta de forma **justa**
quién compra la picadita cada viernes. Mobile-first, login por **PIN**, estado
compartido en (casi) tiempo real.

- **Frontend:** React + Vite + TypeScript + Tailwind v4 (PWA, "añadir a pantalla de inicio")
- **Backend:** FastAPI (proceso permanente con uvicorn) + Postgres
- **Pensado para desplegar en un VPS** (Hetzner) detrás de un reverse proxy con HTTPS.

---

## Cómo funciona el reparto justo

- Cada quien tiene un contador de picaditas **completadas** en el año.
- Le toca a **quien menos lleve**; si hay empate, a quien **lleve más tiempo sin comprar** (o nunca lo haya hecho); último desempate por orden alfabético.
- **"Esta semana no puedo"** te aparta de la ronda actual (`declined_this_round`)
  pero **no** te cuenta el turno: solo te pospone. Se recalcula el siguiente elegible.
- Si _todos_ los activos dicen que no, la ronda se resetea para no bloquear.
- **"Ya compré"** registra el turno, limpia la ronda de declinados y recalcula al siguiente.

Todo se recalcula sobre el historial de `turns`, así que el estado nunca se
"desincroniza": `current_state.assigned_member_id` es solo una caché.

---

## Login por PIN

No hay usuarios/emails: el **roster del equipo** hace de lista de cuentas.

1. Se siembra la lista de nombres en la base de datos (ver [`schema.sql`](./schema.sql)).
2. Cada persona abre la app, elige su nombre y, la **primera vez**, crea un
   **PIN de 4-6 dígitos** (reclama su cuenta). Las siguientes veces entra con ese PIN.
3. La sesión vive en una **cookie HttpOnly firmada** (no en localStorage): el
   servidor sabe quién eres y nadie puede marcar acciones en nombre de otro.

Seguridad razonable para el caso de uso:

- Los PIN se guardan **hasheados con argon2**, nunca en claro.
- Tras **5 intentos fallidos** la cuenta se bloquea unos minutos.
- ¿PIN olvidado? Cualquier miembro puede **resetearlo** desde ⚙️ (es un equipo
  pequeño y de confianza); la persona vuelve a crear uno al entrar.

---

## Estructura

```
picadetApp/
├── api/                 # FastAPI
│   ├── index.py         # rutas /api/*
│   ├── auth.py          # PIN (argon2) + cookies de sesión
│   ├── logic.py         # algoritmo de reparto justo
│   ├── db.py            # conexión a Postgres
│   └── requirements.txt
├── frontend/            # Vite + React + TS + Tailwind
├── schema.sql           # tablas de Postgres
└── vercel.json          # (heredado; el despliegue objetivo es un VPS)
```

---

## Variables de entorno (backend)

| Variable        | Requerida | Descripción                                                              |
| --------------- | --------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`  | Sí        | Connection string de Postgres.                                           |
| `SECRET_KEY`    | Sí        | Clave para firmar la cookie de sesión. Genera una larga y aleatoria.     |
| `COOKIE_SECURE` | No        | `1` por defecto (cookie solo por HTTPS). Ponlo a `0` para probar en local sobre http. |

Genera un `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Desarrollo local

Necesitas un Postgres accesible (local o remoto) y su `DATABASE_URL`.

**Backend** (FastAPI en `:8000`):

```bash
cd api
python -m venv .venv && source .venv/Scripts/activate        # Windows Git Bash
pip install -r requirements.txt uvicorn
# PowerShell: $env:DATABASE_URL="..."; $env:SECRET_KEY="..."; $env:COOKIE_SECURE="0"
export DATABASE_URL="postgres://user:pass@localhost:5432/picadita"
export SECRET_KEY="una-clave-larga-y-aleatoria"
export COOKIE_SECURE=0
uvicorn index:app --reload --port 8000
```

Aplica el esquema una vez y siembra tu equipo (descomenta la semilla de `schema.sql`):

```bash
psql "$DATABASE_URL" -f ../schema.sql
```

**Frontend** (Vite en `:5173`, proxya `/api` a `:8000`):

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173.

---

## Despliegue en Hetzner (VPS)

A diferencia de una plataforma serverless, aquí corres FastAPI como **proceso
permanente** (uvicorn/gunicorn) y sirves el frontend estático, todo detrás de un
**reverse proxy con HTTPS** (recomendado: Caddy, que gestiona el certificado
Let's Encrypt solo — importante para que la PWA se instale bien en el móvil).

> ⚙️ Los ficheros de despliegue (Docker Compose con `postgres` + `api` + `caddy`,
> Dockerfiles y `Caddyfile`) se añaden en el siguiente paso, una vez decididas
> dos cosas: si el Postgres va en el mismo servidor o gestionado, y el dominio
> para el HTTPS.

Pasos generales:

1. Crear el VPS en Hetzner (Ubuntu), instalar Docker + Docker Compose.
2. Apuntar un dominio (registro A) a la IP del servidor.
3. `git clone` del repo, crear un `.env` con `DATABASE_URL`, `SECRET_KEY`, `COOKIE_SECURE=1`.
4. Aplicar `schema.sql` (sembrando el roster del equipo).
5. `docker compose up -d` y abrir el dominio en el móvil → "añadir a pantalla de inicio".

---

## Endpoints

| Método   | Ruta                    | Sesión | Qué hace                                                     |
| -------- | ----------------------- | :----: | ------------------------------------------------------------ |
| `GET`    | `/api/auth/me`          |   —    | Miembro de la sesión actual (o `null`).                      |
| `POST`   | `/api/auth/set-pin`     |   —    | Reclama cuenta creando PIN `{member_id, pin}`.               |
| `POST`   | `/api/auth/login`       |   —    | Entrar `{member_id, pin}`. Bloqueo tras varios fallos.       |
| `POST`   | `/api/auth/logout`      |   —    | Cierra sesión.                                               |
| `POST`   | `/api/auth/reset-pin`   |   ✔    | Resetea el PIN de alguien `{member_id}`.                     |
| `GET`    | `/api/state`            |   —    | Asignado, cola, contadores e historial (15).                |
| `GET`    | `/api/members`          |   —    | Miembros activos (para el login; incluye `has_pin`).         |
| `POST`   | `/api/members`          |   ✔    | Añadir miembro `{name}`.                                     |
| `DELETE` | `/api/members/{id}`     |   ✔    | Desactivar (soft delete) y recalcular.                       |
| `POST`   | `/api/turns/complete`   |   ✔    | "Ya compré" (el actor es el de la sesión; debe ser el asignado). |
| `POST`   | `/api/turns/decline`    |   ✔    | "No puedo esta semana".                                      |

---

## Fuera de alcance (por ahora)

- OAuth / login social.
- Notificaciones push (se puede añadir con un cron + bot de WhatsApp/Telegram).
- Registro de cuánto se gastó cada vez (posible v2).
