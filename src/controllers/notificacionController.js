const notificacionService = require("../services/notificacionService");

async function listar(req, res, next) {
    try {
        const resultado = await notificacionService.listarNotificaciones(req.usuario.id);
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function marcarComoLeida(req, res, next) {
    try {
        const notificacion = await notificacionService.marcarComoLeida(req.params.id, req.usuario.id);
        res.status(200).json({ notificacion });
    } catch (error) { next(error); }
}

module.exports = { listar, marcarComoLeida };
