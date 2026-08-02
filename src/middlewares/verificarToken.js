const jwt = require("jsonwebtoken");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

function verificarToken(req, res, next) {
    const encabezadoAuth = req.headers.authorization;

    if (!encabezadoAuth || !encabezadoAuth.startsWith("Bearer ")) {
        return next(new ErrorPersonalizado("Token no proporcionado", 401));
    }

    const token = encabezadoAuth.split(" ")[1];

    try {
        const datosToken = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = datosToken;
        next();
    } catch (error) {
        next(new ErrorPersonalizado("Token invalido o expirado", 401));
    }
}

module.exports = verificarToken;