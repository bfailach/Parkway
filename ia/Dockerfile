# Servicio de IA: recalcula el pronóstico de ocupación (Prophet) contra la
# base del clúster. Corre al iniciar y luego cada INTERVALO_HORAS horas.
FROM python:3.12-slim
ENV TZ=America/Bogota PYTHONUNBUFFERED=1
WORKDIR /ia
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
CMD ["sh", "-c", "while true; do python pronostico_prophet.py || echo 'Pronóstico falló; se reintenta en el siguiente ciclo'; sleep $(( ${INTERVALO_HORAS:-24} * 3600 )); done"]
