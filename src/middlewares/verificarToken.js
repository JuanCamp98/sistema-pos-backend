const { obtenerUsuarioDesdeToken } = require("../utils/autenticacion");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

async function verificarToken(req, res, next) {
    const encabezadoAuth = req.headers.authorization;

    if (!encabezadoAuth || !encabezadoAuth.startsWith("Bearer ")) {
        return next(new ErrorPersonalizado("Token no proporcionado", 401));
    }

    const token = encabezadoAuth.slice("Bearer ".length).trim();
    if (!token) {
        return next(new ErrorPersonalizado("Token no proporcionado", 401));
    }

    try {
        const usuario = await obtenerUsuarioDesdeToken(token);
        if (!usuario) {
            return next(new ErrorPersonalizado("Token invalido o expirado", 401));
        }
        req.usuario = usuario;
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = verificarToken;
