# API FastAPI servida por uvicorn (proceso permanente en el VPS).
FROM python:3.12-slim

WORKDIR /app

# Dependencias primero (mejor cacheo de capas).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "uvicorn[standard]==0.34.0"

COPY . .

EXPOSE 8000

# Un par de workers sobran para un equipo de 7-9 personas.
CMD ["uvicorn", "index:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
