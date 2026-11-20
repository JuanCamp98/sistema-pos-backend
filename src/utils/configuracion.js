// Validaciones de configuracion que solo aplican en produccion. Se separan del
// arranque del servidor para poder testearlas sin levantar la aplicacion.
const LONGITUD_MINIMA_JWT_SECRET = 32;

function obtenerErroresConfiguracion(env = process.env) {
    if (env.NODE_ENV !== "production") return [];

    const errores = [];
    const secreto = env.JWT_SECRET;

    // Un secreto corto o ausente permite forjar tokens validos (incluidos los
    // de administrador), por eso el servidor no debe arrancar asi.
    if (!secreto) {
        errores.push("JWT_SECRET es obligatorio en produccion.");
    } else if (secreto.length < LONGITUD_MINIMA_JWT_SECRET) {
        errores.push(
            "JWT_SECRET debe tener al menos " + LONGITUD_MINIMA_JWT_SECRET + " caracteres en produccion."
        );
    }

    return errores;
}

function obtenerAdvertenciasConfiguracion(env = process.env) {
    if (env.NODE_ENV !== "production") return [];

    const advertencias = [];

    if (!env.MP_WEBHOOK_SECRET) {
        advertencias.push(
            "MP_WEBHOOK_SECRET no esta configurado: los webhooks de Mercado Pago no verifican firma."
        );
    }

    if (!env.CORS_ORIGINS && !env.FRONTEND_URL) {
        advertencias.push(
            "No hay CORS_ORIGINS ni FRONTEND_URL configurados: el navegador no podra llamar a la API."
        );
    }

    return advertencias;
}

module.exports = {
    obtenerErroresConfiguracion,
    obtenerAdvertenciasConfiguracion,
    LONGITUD_MINIMA_JWT_SECRET
};
