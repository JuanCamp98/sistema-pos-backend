const clasificacionService = require("../services/clasificacionService");

function crearControlador(tipo) {
    return {
        listar: async function (req, res, next) { try { res.json({ data: await clasificacionService.listar(tipo) }); } catch (error) { next(error); } },
        crear: async function (req, res, next) { try { res.status(201).json({ mensaje: "Creado correctamente", dato: await clasificacionService.crear(tipo, req.body.nombre) }); } catch (error) { next(error); } },
        actualizar: async function (req, res, next) { try { res.json({ mensaje: "Actualizado correctamente", dato: await clasificacionService.actualizar(tipo, req.params.id, req.body.nombre) }); } catch (error) { next(error); } },
        desactivar: async function (req, res, next) { try { await clasificacionService.desactivar(tipo, req.params.id); res.status(204).send(); } catch (error) { next(error); } }
    };
}

module.exports = { crearControlador };
