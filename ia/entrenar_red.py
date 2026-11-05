"""
Red neuronal de Parkway: perceptrón multicapa 6-8-1 que estima la ocupación
de una sede dentro de una hora (sección 14 del documento maestro).

Uso:
    python ia/entrenar_red.py            # entrena, evalúa y exporta los pesos
    python ia/entrenar_red.py --grafica  # además guarda ia/validacion.png

Solo necesita numpy (matplotlib es opcional, para la gráfica).

Mientras no existan ocho semanas de operación real, el conjunto de datos se
simula con el mismo patrón de los datos de prueba del proyecto: picos entre
semana en horario de oficina, menos demanda el fin de semana y los festivos,
y reservas que anticipan la llegada de vehículos.

El resultado se guarda en backend/src/ia/pesos_red.json. La API lee ese
archivo y hace el cálculo hacia adelante en Node.js, sin depender de Python.
"""
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "backend" / "src" / "ia" / "pesos_red.json"
SEMILLA = 7
SEMANAS = 12
OCULTAS = 8
EPOCAS = 400
LOTE = 64
TASA = 0.01


# ------------------------------------------------------------------ festivos
def pascua(anio: int) -> dt.date:
    """Domingo de Pascua (algoritmo de Butcher)."""
    a, b, c = anio % 19, anio // 100, anio % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = ((h + l - 7 * m + 114) % 31) + 1
    return dt.date(anio, mes, dia)


def al_lunes(f: dt.date) -> dt.date:
    """Ley 51 de 1983 (Ley Emiliani): el festivo pasa al lunes siguiente."""
    return f + dt.timedelta(days=(7 - f.weekday()) % 7)


def festivos_colombia(anio: int) -> set:
    p = pascua(anio)
    fijos = [(1, 1), (5, 1), (7, 20), (8, 7), (12, 8), (12, 25)]
    trasladables = [(1, 6), (3, 19), (6, 29), (8, 15), (10, 12), (11, 1), (11, 11)]
    fs = {dt.date(anio, m, d) for m, d in fijos}
    fs |= {al_lunes(dt.date(anio, m, d)) for m, d in trasladables}
    fs |= {p - dt.timedelta(days=3), p - dt.timedelta(days=2)}  # jueves y viernes santo
    fs |= {al_lunes(p + dt.timedelta(days=n)) for n in (39, 60, 68)}  # Ascensión, Corpus, Sagrado Corazón
    return fs


# ------------------------------------------------------------ datos simulados
def curva_base(hora: int, finde_o_festivo: bool) -> float:
    """Ocupación típica (0 a 1) de una sede de oficinas en Bogotá."""
    if finde_o_festivo:
        return 0.08 + 0.42 * np.exp(-((hora - 14) ** 2) / 18)
    manana = 0.80 * (1 / (1 + np.exp(-(hora - 7.5) * 1.6)))
    tarde = 0.80 * (1 / (1 + np.exp((hora - 18.5) * 1.3)))
    almuerzo = 0.08 * np.exp(-((hora - 13) ** 2) / 1.5)
    return 0.06 + min(manana, tarde) + almuerzo


def simular(semanas: int, rng: np.random.Generator):
    inicio = dt.datetime(2026, 8, 3)  # lunes
    horas = semanas * 7 * 24
    fechas = [inicio + dt.timedelta(hours=h) for h in range(horas)]
    fest = festivos_colombia(2026)
    efecto_dia = rng.normal(0, 0.04, semanas * 7)  # días más o menos movidos
    ocup = np.zeros(horas)
    for i, f in enumerate(fechas):
        libre = f.weekday() >= 5 or f.date() in fest
        base = curva_base(f.hour, libre) + efecto_dia[i // 24]
        previo = ocup[i - 1] if i else base
        ocup[i] = np.clip(0.7 * base + 0.3 * previo + rng.normal(0, 0.025), 0, 1)
    # Reservas activas para la próxima hora: crecen cuando la ocupación va a subir.
    sube = np.clip(np.r_[ocup[1:] - ocup[:-1], 0], 0, None)
    reservas = np.clip(0.5 * sube + 0.02 * ocup + rng.normal(0, 0.008, horas), 0, 0.2)
    return fechas, fest, ocup, reservas


def armar_dataset(fechas, fest, ocup, reservas):
    """Una fila por hora: x = (hora, día, festivo, ocupación, hace 7 días, reservas); y = ocupación t+1."""
    X, y = [], []
    for t in range(168, len(ocup) - 1):
        f = fechas[t]
        X.append([f.hour / 23, f.weekday() / 6, 1.0 if f.date() in fest else 0.0,
                  ocup[t], ocup[t - 168], reservas[t]])
        y.append(ocup[t + 1])
    return np.array(X), np.array(y).reshape(-1, 1)


# ------------------------------------------------------------------- la red
def relu(z): return np.maximum(z, 0)
def sigmoide(z): return 1 / (1 + np.exp(-z))


def adelante(p, X):
    z1 = X @ p["W1"] + p["b1"]
    h = relu(z1)
    yhat = sigmoide(h @ p["w2"] + p["b2"])
    return z1, h, yhat


def entrenar(Xtr, ytr, rng):
    # Inicialización de He para la capa ReLU.
    p = {"W1": rng.normal(0, np.sqrt(2 / 6), (6, OCULTAS)), "b1": np.zeros(OCULTAS),
         "w2": rng.normal(0, np.sqrt(1 / OCULTAS), (OCULTAS, 1)), "b2": np.zeros(1)}
    m = {k: np.zeros_like(v) for k, v in p.items()}
    v = {k: np.zeros_like(v) for k, v in p.items()}
    b1, b2, eps, paso = 0.9, 0.999, 1e-8, 0
    for _ in range(EPOCAS):
        orden = rng.permutation(len(Xtr))
        for i in range(0, len(orden), LOTE):
            idx = orden[i:i + LOTE]
            X, y = Xtr[idx], ytr[idx]
            z1, h, yhat = adelante(p, X)
            # Retropropagación del error cuadrático medio.
            d_out = 2 * (yhat - y) / len(X) * yhat * (1 - yhat)
            g = {"w2": h.T @ d_out, "b2": d_out.sum(0)}
            d_h = (d_out @ p["w2"].T) * (z1 > 0)
            g["W1"], g["b1"] = X.T @ d_h, d_h.sum(0)
            paso += 1
            for k in p:  # optimizador Adam
                m[k] = b1 * m[k] + (1 - b1) * g[k]
                v[k] = b2 * v[k] + (1 - b2) * g[k] ** 2
                mh, vh = m[k] / (1 - b1 ** paso), v[k] / (1 - b2 ** paso)
                p[k] -= TASA * mh / (np.sqrt(vh) + eps)
    return p


def main():
    rng = np.random.default_rng(SEMILLA)
    fechas, fest, ocup, reservas = simular(SEMANAS, rng)
    X, y = armar_dataset(fechas, fest, ocup, reservas)

    corte = int(len(X) * 0.8)  # división temporal: no se mezclan semanas
    Xtr, ytr, Xva, yva = X[:corte], y[:corte], X[corte:], y[corte:]
    p = entrenar(Xtr, ytr, rng)

    pred = adelante(p, Xva)[2]
    mae = float(np.mean(np.abs(pred - yva)) * 100)
    ingenuo = float(np.mean(np.abs(Xva[:, 4:5] - yva)) * 100)       # repetir hace 7 días
    persistencia = float(np.mean(np.abs(Xva[:, 3:4] - yva)) * 100)  # repetir la hora actual
    params = sum(a.size for a in p.values())

    print(f"Filas: {len(X)} (entrenamiento {len(Xtr)}, validación {len(Xva)})")
    print(f"Parámetros de la red: {params}")
    print(f"MAE red neuronal         : {mae:5.2f} puntos porcentuales")
    print(f"MAE ingenuo (hace 7 días): {ingenuo:5.2f} pp")
    print(f"MAE persistencia (ahora) : {persistencia:5.2f} pp")
    aprobado = mae <= 8 and mae < ingenuo
    print("Métrica de aceptación (MAE <= 8 pp y mejor que el ingenuo):", "CUMPLE" if aprobado else "NO CUMPLE")

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps({
        "modelo": "MLP 6-8-1",
        "entradas": ["hora/23", "dia_semana/6 (lunes=0)", "festivo", "ocupacion_actual",
                     "ocupacion_hace_7_dias", "reservas_en_camino/capacidad"],
        "activaciones": {"oculta": "relu", "salida": "sigmoide"},
        "W1": np.round(p["W1"], 6).tolist(), "b1": np.round(p["b1"], 6).tolist(),
        "w2": np.round(p["w2"][:, 0], 6).tolist(), "b2": float(np.round(p["b2"][0], 6)),
        "metricas": {"mae_pp": round(mae, 2), "mae_ingenuo_pp": round(ingenuo, 2),
                     "mae_persistencia_pp": round(persistencia, 2), "parametros": params,
                     "filas_entrenamiento": len(Xtr), "filas_validacion": len(Xva)},
        "datos": f"simulados, {SEMANAS} semanas, semilla {SEMILLA}",
        "entrenado": dt.date.today().isoformat(),
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Pesos guardados en {SALIDA.relative_to(RAIZ)}")

    if "--grafica" in sys.argv:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            print("Instale matplotlib para generar la gráfica: pip install matplotlib")
            return
        n = 7 * 24
        fig, ax = plt.subplots(figsize=(11, 4))
        ax.plot(yva[-n:, 0] * 100, label="Ocupación real", color="#1f4e79", lw=1.6)
        ax.plot(pred[-n:, 0] * 100, label="Predicción de la red", color="#e07b00", lw=1.3, ls="--")
        ax.axhline(90, color="#c00000", lw=0.8, ls=":", label="Umbral de alerta (90 %)")
        ax.set_ylabel("Ocupación (%)"); ax.set_xlabel("Horas de la última semana de validación")
        ax.set_ylim(0, 100); ax.legend(loc="upper right", fontsize=8); ax.grid(alpha=0.25)
        ax.set_title(f"Red 6-8-1: MAE {mae:.1f} pp frente a {ingenuo:.1f} pp del modelo ingenuo")
        fig.tight_layout()
        destino = RAIZ / "ia" / "validacion.png"
        fig.savefig(destino, dpi=150)
        print(f"Gráfica guardada en {destino.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
