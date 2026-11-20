const { obtenerUsuarioDesdeToken } = require("../utils/autenticacion");

// Middleware que intenta autenticar si hay token, pero no falla si no hay.
// Usado en endpoints que aceptan tanto usuarios autenticados como anonimos
// (ej: POST /ventas donde el cliente puede no estar logueado).
async function intentarAutenticar(req, res, next) {
    const encabezadoAuth = req.headers.authorization;

    if (!encabezadoAuth || !encabezadoAuth.startsWith("Bearer ")) {
        return next();
    }

    const token = encabezadoAuth.slice("Bearer ".length).trim();
    if (!token) return next();

    try {
        const usuario = await obtenerUsuarioDesdeToken(token);
        if (usuario) req.usuario = usuario;
    } catch {
        // Un token invalido se trata como ausencia de sesion.
    }
    next();
}

module.exports = intentarAutenticar;
