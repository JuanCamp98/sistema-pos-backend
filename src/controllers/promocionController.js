const promocionService = require("../services/promocionService");

async function listar(req, res, next) {
    try { res.status(200).json({ promociones: await promocionService.listarPromociones() }); } catch (error) { next(error); }
}

async function obtenerPorId(req, res, next) {
    try { res.status(200).json({ promocion: await promocionService.obtenerPromocion(req.params.id) }); } catch (error) { next(error); }
}

async function crear(req, res, next) {
    try { res.status(201).json({ mensaje: "Promocion creada correctamente", promocion: await promocionService.crearPromocion(req.body) }); } catch (error) { next(error); }
}

async function actualizar(req, res, next) {
    try { res.status(200).json({ mensaje: "Promocion actualizada correctamente", promocion: await promocionService.actualizarPromocion(req.params.id, req.body) }); } catch (error) { next(error); }
}

async function eliminar(req, res, next) {
    try { await promocionService.eliminarPromocion(req.params.id); res.status(204).send(); } catch (error) { next(error); }
}

async function listarVigentes(req, res, next) {
    try { res.status(200).json({ promociones: await promocionService.listarPromocionesVigentes() }); } catch (error) { next(error); }
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar, listarVigentes };
