const ErrorPersonalizado = require("../utils/errorPersonalizado");

// Limitador en memoria, suficiente para una instancia. Si el backend se escala
// horizontalmente conviene reemplazarlo por un store compartido (Redis).
const registros = new Map();
const INTERVALO_LIMPIEZA_MS = 10 * 60 * 1000;

// Tope de claves para que un atacante no pueda agotar la memoria generando
// identificadores distintos (por ejemplo, emails aleatorios en el login).
const MAX_REGISTROS = 10000;
// Las claves se recortan para evitar guardar cadenas arbitrariamente largas.
const LONGITUD_MAXIMA_CLAVE = 512;

function limpiarVencidos(ahora) {
    for (const [clave, registro] of registros) {
        if (registro.reinicio <= ahora) registros.delete(clave);
    }
}

let insercionesDesdeLimpieza = 0;

function registrarClave(clave, reinicio) {
    if (registros.size >= MAX_REGISTROS) {
        // Recorrer todo el mapa en cada insercion seria costoso cuando esta
        // lleno, justo el escenario que busca un atacante. Se limpia cada
        // cierto numero de inserciones y mientras tanto se descarta la clave
        // mas antigua (Map conserva el orden de insercion).
        insercionesDesdeLimpieza += 1;
        if (insercionesDesdeLimpieza >= 100) {
            limpiarVencidos(Date.now());
            insercionesDesdeLimpieza = 0;
        }
        while (registros.size >= MAX_REGISTROS) {
            const masAntigua = registros.keys().next().value;
            if (masAntigua === undefined) break;
            registros.delete(masAntigua);
        }
    }
    registros.set(clave, { conteo: 1, reinicio });
}

const limpiador = setInterval(function () {
    limpiarVencidos(Date.now());
}, INTERVALO_LIMPIEZA_MS);
if (typeof limpiador.unref === "function") limpiador.unref();

function estaDeshabilitado() {
    // El interruptor existe para pruebas locales, nunca para produccion.
    return process.env.RATE_LIMIT_DISABLED === "true" && process.env.NODE_ENV !== "production";
}

function normalizarIdentificador(valor) {
    if (valor === null || valor === undefined) return "";
    return String(valor).slice(0, LONGITUD_MAXIMA_CLAVE);
}

function limitarPeticiones({ limite, ventanaMs, clave, mensaje }) {
    return function (req, res, next) {
        if (estaDeshabilitado()) return next();

        const identificador = normalizarIdentificador(
            typeof clave === "function" ? clave(req) : req.ip
        );
        // Las claves opcionales permiten omitir el limite cuando el dato no
        // aplica (por ejemplo, una venta sin email de destinatario).
        if (!identificador) return next();
        const ahora = Date.now();
        const registro = registros.get(identificador);

        if (!registro || registro.reinicio <= ahora) {
            registrarClave(identificador, ahora + ventanaMs);
            return next();
        }

        registro.conteo += 1;
        if (registro.conteo > limite) {
            const segundosRestantes = Math.max(1, Math.ceil((registro.reinicio - ahora) / 1000));
            res.set("Retry-After", String(segundosRestantes));
            return next(new ErrorPersonalizado(
                mensaje || "Demasiadas solicitudes. Intentá nuevamente más tarde.",
                429
            ));
        }

        next();
    };
}

function limpiarRegistros() {
    registros.clear();
    insercionesDesdeLimpieza = 0;
}

function cantidadRegistros() {
    return registros.size;
}

module.exports = { limitarPeticiones, limpiarRegistros, cantidadRegistros, MAX_REGISTROS };
