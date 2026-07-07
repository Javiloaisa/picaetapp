# API FastAPI servida por uvicorn (proceso permanente en el VPS).
FROM python:3.12-slim

WORKDIR /app

# Dependencias primero (mejor cacheo de capas).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "uvicorn[standard]==0.34.0"

COPY . .

# La picaeta va por días/viernes; fija la zona horaria del contenedor.
ENV TZ=Europe/Madrid

EXPOSE 8000

# 1 worker: el aviso semanal corre en el propio proceso (APScheduler) y con
# varios workers se dispararía varias veces. Para 7-9 personas sobra con uno.
CMD ["uvicorn", "index:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
