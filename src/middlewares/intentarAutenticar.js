const jwt = require("jsonwebtoken");

// Middleware que intenta autenticar si hay token, pero no falla si no hay.
// Usado en endpoints que aceptan tanto usuarios autenticados como anonimos
// (ej: POST /ventas donde el cliente puede no estar logueado).
function intentarAutenticar(req, res, next) {
    const encabezadoAuth = req.headers.authorization;

    if (!encabezadoAuth || !encabezadoAuth.startsWith("Bearer ")) {
        return next();
    }

    const token = encabezadoAuth.split(" ")[1];

    try {
        const datosToken = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = datosToken;
        next();
    } catch (error) {
        next();
    }
}

module.exports = intentarAutenticar;