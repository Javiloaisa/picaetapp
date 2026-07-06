# 🫒 La Picadita del Viernes

App interna para que un equipo pequeño (7-9 personas) reparta de forma **justa**
quién compra la picadita cada viernes. Mobile-first, sin contraseñas, estado
compartido en (casi) tiempo real.

- **Frontend:** React + Vite + TypeScript + Tailwind v4 (PWA, "añadir a pantalla de inicio")
- **Backend:** FastAPI sobre funciones serverless de Vercel (Python)
- **Base de datos:** Postgres (Neon, vía Vercel Marketplace)

---

## Cómo funciona el reparto justo

- Cada quien tiene un contador de picaditas **completadas** en el año.
- Le toca a **quien menos lleve**; si hay empate, a quien **lleve más tiempo sin comprar** (o nunca lo haya hecho).
- **"Esta semana no puedo"** te aparta de la ronda actual (`declined_this_round`)
  pero **no** te cuenta el turno: solo te pospone. Se recalcula el siguiente elegible.
- Si _todos_ los activos dicen que no, la ronda se resetea para no bloquear.
- **"Ya compré"** registra el turno, limpia la ronda de declinados y recalcula al siguiente.

Todo se recalcula sobre el historial de `turns`, así que el estado nunca se
"desincroniza": `current_state.assigned_member_id` es solo una caché.

---

## Estructura

```
picadetApp/
├── api/                 # FastAPI (funciones Python en Vercel)
│   ├── index.py         # rutas /api/*
│   ├── logic.py         # algoritmo de reparto justo
│   ├── db.py            # conexión a Neon
│   └── requirements.txt
├── frontend/            # Vite + React + TS + Tailwind
├── schema.sql           # tablas de Postgres
└── vercel.json          # build del frontend + rewrites de /api
```

---

## Puesta en marcha (deploy en Vercel)

### 1. Base de datos en Neon

1. En el [dashboard de Vercel](https://vercel.com) → tu proyecto → **Storage** →
   **Marketplace** → añade **Neon** (Postgres). Esto crea la base de datos y
   expone la variable de entorno `DATABASE_URL` automáticamente.
   - Alternativa: crea la cuenta en [neon.tech](https://neon.tech), copia la
     _connection string_ (usa la que incluye `-pooler` para serverless) y añádela
     como `DATABASE_URL` en **Settings → Environment Variables**.
2. Abre el **SQL Editor** de Neon y ejecuta el contenido de [`schema.sql`](./schema.sql).
   Descomenta la sección de semilla para meter los nombres de tu equipo (o añádelos
   luego desde la propia app, en ⚙️).

### 2. Deploy

1. Sube el repo a GitHub e **importa el proyecto en Vercel** (o `vercel` con la CLI).
2. Vercel usa [`vercel.json`](./vercel.json):
   - construye el frontend (`frontend/dist`),
   - detecta `api/index.py` (FastAPI expone `app`) como función Python,
   - reescribe `/api/*` → esa función.
3. Comprueba que `DATABASE_URL` está en las variables de entorno del proyecto.
4. Deploy. Abre la URL en el móvil y **añade a pantalla de inicio**.

### Variables de entorno

| Variable       | Dónde        | Descripción                                   |
| -------------- | ------------ | --------------------------------------------- |
| `DATABASE_URL` | Vercel (API) | Connection string de Neon (mejor `-pooler`).  |

---

## Desarrollo local

Necesitas la misma `DATABASE_URL` (puedes apuntar a tu base de Neon).

**Backend** (FastAPI en `:8000`):

```bash
cd api
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt uvicorn
export DATABASE_URL="postgres://...neon.tech/...-pooler..."   # en PowerShell: $env:DATABASE_URL="..."
uvicorn index:app --reload --port 8000
```

**Frontend** (Vite en `:5173`, proxya `/api` a `:8000`):

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173.

---

## Endpoints

| Método   | Ruta                    | Qué hace                                                       |
| -------- | ----------------------- | ------------------------------------------------------------- |
| `GET`    | `/api/state`            | Asignado actual, cola ordenada, contadores e historial (15).  |
| `GET`    | `/api/members`          | Lista de miembros activos (para la pantalla de identificación).|
| `POST`   | `/api/members`          | Crear miembro `{ "name": "Ana" }`.                            |
| `DELETE` | `/api/members/{id}`     | Desactivar (soft delete) y recalcular.                        |
| `POST`   | `/api/turns/complete`   | "Ya compré" `{ "member_id": "…" }` (debe ser el asignado).    |
| `POST`   | `/api/turns/decline`    | "No puedo esta semana" `{ "member_id": "…" }`.                |

---

## Identificación (sin login)

No hay contraseñas. En la primera visita eliges tu nombre y se guarda en
`localStorage` (`picadita_member_id`). Sirve solo para saber quién pulsa qué,
no es seguridad. Puedes cambiar de usuario desde ⚙️ (útil si usas el móvil de otro).

---

## Fuera de alcance (por ahora)

- Login real / OAuth.
- Notificaciones push (se puede añadir con un cron + bot de WhatsApp/Telegram).
- Registro de cuánto se gastó cada vez (posible v2).
