const retiroService = require("../services/retiroService");
const {
    disponibilidadRetiroQuerySchema
} = require("../schemas/retiroSchema");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

async function disponibilidad(req, res, next) {
    try {
        const resultado = disponibilidadRetiroQuerySchema.safeParse(req.query);
        if (!resultado.success) {
            throw new ErrorPersonalizado("La cantidad de días consultada no es válida", 400);
        }
        res.status(200).json(await retiroService.obtenerDisponibilidad(resultado.data.dias));
    } catch (error) { next(error); }
}

async function obtenerConfiguracion(req, res, next) {
    try {
        res.status(200).json({
            configuracion: await retiroService.obtenerConfiguracionAdministrativa()
        });
    } catch (error) { next(error); }
}

async function guardarConfiguracion(req, res, next) {
    try {
        res.status(200).json({
            mensaje: "La configuración de retiro se guardó correctamente",
            configuracion: await retiroService.guardarConfiguracion(req.body)
        });
    } catch (error) { next(error); }
}

module.exports = { disponibilidad, obtenerConfiguracion, guardarConfiguracion };
