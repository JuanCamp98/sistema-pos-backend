const ErrorPersonalizado = require("../utils/errorPersonalizado");

function verificarRol(rolesPermitidos) {
    return function (req, res, next) {
        if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
            return next(new ErrorPersonalizado("No tenes permisos para realizar esta accion", 403));
        }
        next();
    };
}

module.exports = verificarRol;