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
│   └── Dockerfile       # imagen de la API
├── frontend/            # Vite + React + TS + Tailwind
├── schema.sql           # tablas de Postgres (se aplica al iniciar la BD)
├── docker-compose.yml   # db + api + caddy
├── Dockerfile.web       # build del frontend + Caddy
├── Caddyfile            # reverse proxy + HTTPS
└── .env.example         # variables de entorno
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

## Despliegue en Hetzner (VPS) con Docker Compose

Todo el stack corre en un solo servidor con tres contenedores:

| Servicio | Qué es                                                                    |
| -------- | ------------------------------------------------------------------------- |
| `db`     | Postgres 16 (datos en el volumen `dbdata`).                               |
| `api`    | FastAPI con uvicorn.                                                       |
| `caddy`  | Reverse proxy + **HTTPS automático** + sirve el frontend estático.        |

Ficheros: [`docker-compose.yml`](./docker-compose.yml), [`Dockerfile.web`](./Dockerfile.web),
[`api/Dockerfile`](./api/Dockerfile), [`Caddyfile`](./Caddyfile), [`.env.example`](./.env.example).

### HTTPS sin dominio propio (sslip.io)

Aún sin dominio, tendrás **HTTPS de verdad**: `sslip.io` es un DNS que resuelve
`TU-IP.sslip.io` a tu IP, y Caddy le saca un certificado Let's Encrypt solo.
Cuando compres un dominio, solo cambias `SITE_ADDRESS` en el `.env` y reinicias.

### Pasos

1. **Crea el servidor** en Hetzner Cloud (una CX22 con Ubuntu sobra). Anota su IP.

2. **Abre el firewall** para SSH y web. Con el firewall de Hetzner o con `ufw`:
   ```bash
   ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
   ```

3. **Instala Docker** (incluye Compose v2):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

4. **Clona el repo** y entra:
   ```bash
   git clone https://github.com/Javiloaisa/picaetapp.git && cd picaetapp
   ```

5. **Siembra tu equipo**: edita [`schema.sql`](./schema.sql) y descomenta la
   sección de la semilla con los nombres reales (esto se ejecuta solo en el
   primer arranque de la base de datos).

6. **Configura el `.env`**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   - `DB_PASSWORD`: invéntate una larga.
   - `SECRET_KEY`: genera una con `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
   - `SITE_ADDRESS`: tu IP con guiones + `.sslip.io`, p. ej. `203-0-113-5.sslip.io`.
   - `COOKIE_SECURE`: déjalo en `1`.

7. **Arranca**:
   ```bash
   docker compose up -d --build
   ```
   La primera vez Caddy tarda unos segundos en emitir el certificado.

8. Abre `https://TU-IP.sslip.io` en el móvil → **añadir a pantalla de inicio**.
   Cada uno elige su nombre y crea su PIN.

### Operar

```bash
docker compose logs -f            # ver logs
docker compose pull && docker compose up -d --build   # actualizar tras git pull
docker compose down               # parar (los datos persisten en el volumen)
```

**Backup de la base de datos:**
```bash
docker compose exec db pg_dump -U picadita picadita > backup_$(date +%F).sql
```

> ⚠️ Si ya arrancaste una vez y luego editas la semilla de `schema.sql`, no se
> vuelve a aplicar (solo corre con la BD vacía). Añade la gente que falte desde
> ⚙️ en la app, o entra con `docker compose exec db psql -U picadita picadita`.

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
