"""
Pronóstico de ocupación para las próximas horas con Prophet (RF15, sección
13 del documento maestro).

Para cada sede:
1. Arma la serie de ocupación por hora de las últimas 12 semanas a partir de
   registro_estacionamiento: vehículos dentro al inicio de cada hora sobre
   los espacios en servicio.
2. Si la sede no tiene ocho semanas de registros (el mínimo de la ficha
   técnica), usa una serie simulada con el mismo patrón de la red neuronal
   y lo deja anotado como fuente SIMULADA.
3. Evalúa el modelo reservando las dos últimas semanas: MAPE, error medio en
   puntos porcentuales y qué parte de los valores reales cayó dentro del
   rango de confianza.
4. Reentrena con toda la serie y guarda en prediccion_ocupacion la
   ocupación estimada de las próximas 48 horas con su límite inferior y
   superior (modelo PROPHET). La API muestra las 24 siguientes a la hora de
   la consulta, así el pronóstico de las 2:00 a. m. sirve todo el día.

Uso:
    pip install -r ia/requirements.txt
    python ia/pronostico_prophet.py              # todas las sedes
    python ia/pronostico_prophet.py --sede 1     # una sede

Conexión: DATABASE_URL, o DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD
(si no están definidas se leen de backend/.env). En GitHub Actions corre cada
noche a las 2:00 a. m. (.github/workflows/pronostico.yml).

El script solo escribe en las tablas de predicción: si falla, los ingresos,
las salidas y las reservas siguen funcionando.
"""
import argparse
import datetime as dt
import logging
import os
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from entrenar_red import curva_base, festivos_colombia  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
ZONA = ZoneInfo("America/Bogota")
SEMANAS_SERIE = 12
SEMANAS_MINIMAS = 8          # ficha técnica: mínimo ocho semanas de histórico por sede
HORAS_PRUEBA = 14 * 24       # dos últimas semanas reservadas para la evaluación
HORIZONTE = 48               # horas que se guardan; la API muestra 24
INTERVALO = 0.80             # rango de confianza del 80 %
OCUPACION_MINIMA_MAPE = 0.10 # el MAPE no se calcula sobre horas casi vacías

logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
logging.getLogger("prophet").setLevel(logging.WARNING)


# -------------------------------------------------------------- conexión
def leer_env_backend() -> dict:
    archivo = RAIZ / "backend" / ".env"
    valores = {}
    if archivo.exists():
        for linea in archivo.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                valores[k.strip()] = v.strip()
    return valores


def conectar():
    import psycopg

    env = {**leer_env_backend(), **os.environ}
    opciones = "-c TimeZone=America/Bogota"
    ssl = {"sslmode": "require"} if env.get("DB_SSL") == "true" else {}
    if env.get("DATABASE_URL"):
        return psycopg.connect(env["DATABASE_URL"], options=opciones, **ssl)
    return psycopg.connect(
        host=env.get("DB_HOST", "localhost"), port=env.get("DB_PORT", "5432"),
        dbname=env.get("DB_NAME", "parkway"), user=env.get("DB_USER", "postgres"),
        password=env.get("DB_PASSWORD", "postgres"), options=opciones, **ssl,
    )


# ---------------------------------------------------------------- series
def hora_actual() -> dt.datetime:
    """Inicio de la hora en curso en Bogotá, sin zona (así se guardan las fechas)."""
    return dt.datetime.now(ZONA).replace(tzinfo=None, minute=0, second=0, microsecond=0)


def serie_real(cur, id_sede: int, desde: dt.datetime, hasta: dt.datetime) -> pd.DataFrame:
    cur.execute(
        """
        WITH capacidad AS (
            SELECT count(*) FILTER (WHERE estado <> 'FUERA_DE_SERVICIO')::float AS n
              FROM espacio WHERE id_parqueadero = %(sede)s
        )
        SELECT h AS ds,
               (SELECT count(*) FROM registro_estacionamiento re
                  JOIN espacio e ON e.id_espacio = re.id_espacio
                 WHERE e.id_parqueadero = %(sede)s
                   AND re.fecha_ingreso <= h
                   AND (re.fecha_salida IS NULL OR re.fecha_salida > h)) / NULLIF((SELECT n FROM capacidad), 0) AS y
          FROM generate_series(%(desde)s::timestamp, %(hasta)s::timestamp, interval '1 hour') AS h
        """,
        {"sede": id_sede, "desde": desde, "hasta": hasta},
    )
    df = pd.DataFrame(cur.fetchall(), columns=["ds", "y"])
    df["y"] = df["y"].astype(float).clip(0, 1)
    return df


def semanas_con_registros(cur, id_sede: int) -> float:
    cur.execute(
        """SELECT EXTRACT(EPOCH FROM now() - min(re.fecha_ingreso)) / 604800
             FROM registro_estacionamiento re JOIN espacio e ON e.id_espacio = re.id_espacio
            WHERE e.id_parqueadero = %s""",
        (id_sede,),
    )
    valor = cur.fetchone()[0]
    return float(valor or 0)


def serie_simulada(id_sede: int, desde: dt.datetime, horas: int) -> pd.DataFrame:
    """Mismo patrón de entrenar_red.py, con un nivel de demanda propio de cada sede."""
    rng = np.random.default_rng(1000 + id_sede)
    escala = 0.85 + 0.08 * (id_sede % 3)
    fechas = [desde + dt.timedelta(hours=h) for h in range(horas)]
    fest = festivos_colombia(desde.year) | festivos_colombia(desde.year + 1)
    efecto_dia = rng.normal(0, 0.04, horas // 24 + 2)
    y = np.zeros(horas)
    for i, f in enumerate(fechas):
        libre = f.weekday() >= 5 or f.date() in fest
        base = curva_base(f.hour, libre) * escala + efecto_dia[i // 24]
        previo = y[i - 1] if i else base
        y[i] = np.clip(0.7 * base + 0.3 * previo + rng.normal(0, 0.025), 0, 1)
    return pd.DataFrame({"ds": fechas, "y": y})


# ---------------------------------------------------------------- modelo
def festivos(desde: dt.datetime, hasta: dt.datetime) -> pd.DataFrame:
    dias = sorted(d for a in range(desde.year, hasta.year + 1) for d in festivos_colombia(a))
    return pd.DataFrame({"holiday": "festivo", "ds": pd.to_datetime(dias)})


def con_condiciones(df: pd.DataFrame, fest: set) -> pd.DataFrame:
    """Entre semana y fin de semana o festivo tienen curvas diarias distintas."""
    df = df.copy()
    libre = df["ds"].apply(lambda f: f.weekday() >= 5 or f.date() in fest)
    df["laboral"] = ~libre
    df["libre"] = libre
    return df


def ajustar(df: pd.DataFrame, fest_df: pd.DataFrame):
    from prophet import Prophet

    m = Prophet(
        daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False,
        holidays=fest_df, interval_width=INTERVALO, uncertainty_samples=300,
        # La ocupación de un parqueadero cambia poco de tendencia en 12 semanas.
        changepoint_prior_scale=0.01,
    )
    m.add_seasonality(name="diaria_laboral", period=1, fourier_order=8, condition_name="laboral")
    m.add_seasonality(name="diaria_libre", period=1, fourier_order=6, condition_name="libre")
    m.fit(df)
    return m


def pronosticar(m, fechas, fest: set) -> pd.DataFrame:
    futuro = con_condiciones(pd.DataFrame({"ds": fechas}), fest)
    p = m.predict(futuro)[["ds", "yhat", "yhat_lower", "yhat_upper"]]
    for c in ("yhat", "yhat_lower", "yhat_upper"):
        p[c] = p[c].clip(0, 1)
    return p


def evaluar(df: pd.DataFrame, fest: set, fest_df: pd.DataFrame) -> dict:
    entrenamiento, prueba = df.iloc[:-HORAS_PRUEBA], df.iloc[-HORAS_PRUEBA:]
    m = ajustar(entrenamiento, fest_df)
    p = pronosticar(m, prueba["ds"], fest)
    real = prueba["y"].to_numpy()
    estimada = p["yhat"].to_numpy()
    utiles = real >= OCUPACION_MINIMA_MAPE
    mape = float(np.mean(np.abs(estimada[utiles] - real[utiles]) / real[utiles]) * 100) if utiles.any() else None
    mae = float(np.mean(np.abs(estimada - real)) * 100)
    cobertura = float(np.mean((real >= p["yhat_lower"].to_numpy()) & (real <= p["yhat_upper"].to_numpy())) * 100)
    return {"mape": mape, "mae_pp": mae, "cobertura": cobertura}


# --------------------------------------------------------------- guardado
def asegurar_tablas(cur):
    cur.execute((RAIZ / "database" / "migracion_pronostico.sql").read_text(encoding="utf-8"))


def guardar(cur, id_sede: int, p: pd.DataFrame, meta: dict):
    desde = p["ds"].min()
    cur.execute(
        """DELETE FROM prediccion_ocupacion
            WHERE id_parqueadero = %s AND id_tipo IS NULL AND modelo = 'PROPHET' AND fecha_hora >= %s""",
        (id_sede, desde),
    )
    cur.executemany(
        """INSERT INTO prediccion_ocupacion
               (id_parqueadero, id_tipo, fecha_hora, ocupacion_estimada, limite_inferior, limite_superior, modelo)
           VALUES (%s, NULL, %s, %s, %s, %s, 'PROPHET')""",
        [(id_sede, f.to_pydatetime(), round(e, 4), round(i, 4), round(s, 4))
         for f, e, i, s in p[["ds", "yhat", "yhat_lower", "yhat_upper"]].itertuples(index=False)],
    )
    redondear = lambda v: None if v is None else round(v, 2)  # noqa: E731
    cur.execute(
        """INSERT INTO modelo_pronostico
               (id_parqueadero, modelo, entrenado, fuente, semanas, mape, mae_pp, cobertura, intervalo)
           VALUES (%s, 'PROPHET', now(), %s, %s, %s, %s, %s, %s)
           ON CONFLICT (id_parqueadero) DO UPDATE SET
               entrenado = EXCLUDED.entrenado, fuente = EXCLUDED.fuente, semanas = EXCLUDED.semanas,
               mape = EXCLUDED.mape, mae_pp = EXCLUDED.mae_pp, cobertura = EXCLUDED.cobertura,
               intervalo = EXCLUDED.intervalo""",
        (id_sede, meta["fuente"], SEMANAS_SERIE, redondear(meta["mape"]), redondear(meta["mae_pp"]),
         redondear(meta["cobertura"]), INTERVALO),
    )


# ------------------------------------------------------------------- main
def procesar(conn, id_sede: int, nombre: str) -> bool:
    ahora = hora_actual()
    desde = ahora - dt.timedelta(weeks=SEMANAS_SERIE)
    horas = SEMANAS_SERIE * 7 * 24
    with conn.cursor() as cur:
        semanas = semanas_con_registros(cur, id_sede)
        if semanas >= SEMANAS_MINIMAS:
            df, fuente = serie_real(cur, id_sede, desde, ahora - dt.timedelta(hours=1)), "REAL"
        else:
            df, fuente = serie_simulada(id_sede, desde, horas), "SIMULADA"
    df = df.dropna()
    fest = festivos_colombia(desde.year) | festivos_colombia(desde.year + 1)
    fest_df = festivos(desde, ahora + dt.timedelta(hours=HORIZONTE))
    df = con_condiciones(df, fest)

    meta = {"fuente": fuente, **evaluar(df, fest, fest_df)}
    m = ajustar(df, fest_df)
    fechas = [ahora + dt.timedelta(hours=h) for h in range(1, HORIZONTE + 1)]
    p = pronosticar(m, fechas, fest)

    with conn.transaction(), conn.cursor() as cur:
        guardar(cur, id_sede, p, meta)

    mape = "sin dato" if meta["mape"] is None else f"{meta['mape']:.1f} %"
    cumple = meta["mape"] is not None and meta["mape"] < 20
    origen = "reales" if fuente == "REAL" else f"simulados (solo {semanas:.1f} de {SEMANAS_MINIMAS} semanas reales)"
    print(f"{nombre}: datos {origen}, MAPE {mape}"
          f" {'(cumple < 20 %)' if cumple else '(no cumple < 20 %)'}, error medio {meta['mae_pp']:.1f} pp,"
          f" {meta['cobertura']:.0f} % de los valores reales dentro del rango del {INTERVALO:.0%}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sede", type=int, help="Número de la sede (por defecto, todas)")
    args = parser.parse_args()

    with conectar() as conn:
        with conn.transaction(), conn.cursor() as cur:
            asegurar_tablas(cur)
            cur.execute("SELECT id_parqueadero, nombre FROM parqueadero ORDER BY id_parqueadero")
            sedes = [s for s in cur.fetchall() if args.sede in (None, s[0])]
        if not sedes:
            print("No hay sedes para pronosticar.")
            return 1
        fallos = 0
        for id_sede, nombre in sedes:
            try:
                procesar(conn, id_sede, nombre)
            except Exception as e:  # una sede con problemas no detiene a las demás
                fallos += 1
                print(f"{nombre}: no se pudo pronosticar ({e})", file=sys.stderr)
        print(f"Pronóstico guardado para {len(sedes) - fallos} de {len(sedes)} sedes.")
        return 1 if fallos == len(sedes) else 0


if __name__ == "__main__":
    sys.exit(main())
