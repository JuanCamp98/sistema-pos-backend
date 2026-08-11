const ventaService = require("../services/ventaService");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

async function registrar(req, res, next) {
    try {
        const usuarioId = req.usuario ? req.usuario.id : null;
        const nuevaVenta = await ventaService.registrarVenta(usuarioId, req.body);
        res.status(201).json({
            mensaje: "Venta registrada correctamente",
            venta: nuevaVenta
        });
    } catch (error) { next(error); }
}

async function cobrar(req, res, next) {
    try {
        console.log("[cobrar] method=%s url=%s Authorization=%s body=", req.method, req.originalUrl || req.url, req.headers.authorization);
        console.log(req.body);
        const ventaId = req.params.id;
        const metodoPago = req.body.metodoPago;
        const codigoComprobante = req.body.codigoComprobante || req.query.codigo || req.headers["x-codigo-comprobante"];

        // Obtener la venta para validar permisos o codigo
        const venta = await ventaService.obtenerVentaPorId(ventaId);

        if (req.usuario) {
            // Usuario autenticado: chequear rol
            const rol = req.usuario.rol;
            if (!["Cajero", "Administrador"].includes(rol)) {
                return next(new ErrorPersonalizado("No autorizado", 403));
            }
        } else {
            // Usuario anonimo: permitir cobrar sin codigo SOLO si la venta fue creada
            // por un cliente anonimo (venta.usuarioId === null). Esto permite que
            // el frontend separado que usa el id pueda completar el pago.
            if (venta.usuarioId) {
                // Venta asociada a un usuario: exigir codigo para evitar cobros no autorizados
                if (!codigoComprobante) {
                    return next(new ErrorPersonalizado("Codigo de comprobante obligatorio", 400));
                }
                if (venta.codigoComprobante !== codigoComprobante) {
                    return next(new ErrorPersonalizado("Codigo de comprobante invalido", 403));
                }
            } else {
                // Venta creada por cliente anonimo: permitimos cobrar usando solo el id
            }
        }

        const ventaCobrada = await ventaService.cobrarVenta(ventaId, metodoPago);
        res.status(200).json({
            mensaje: "Venta cobrada correctamente",
            venta: ventaCobrada
        });
    } catch (error) { next(error); }
}

async function cancelar(req, res, next) {
    try {
        const ventaCancelada = await ventaService.cancelarVenta(req.params.id);
        res.status(200).json({
            mensaje: "Venta cancelada correctamente",
            venta: ventaCancelada
        });
    } catch (error) { next(error); }
}

async function listar(req, res, next) {
    try {
        const filtros = {
            pagina: req.query.pagina ? parseInt(req.query.pagina) : undefined,
            limite: req.query.limite ? parseInt(req.query.limite) : undefined,
            estado: req.query.estado || undefined
        };
        const resultado = await ventaService.listarVentas(filtros);
        res.status(200).json(resultado);
    } catch (error) { next(error); }
}

async function obtenerPorId(req, res, next) {
    try {
        const venta = await ventaService.obtenerVentaPorId(req.params.id);
        res.status(200).json({ venta: venta });
    } catch (error) { next(error); }
}

async function buscarPorComprobante(req, res, next) {
    try {
        const venta = await ventaService.obtenerVentaPorCodigoComprobante(req.params.codigo);
        res.status(200).json({ venta: venta });
    } catch (error) { next(error); }
}

async function pagarPorComprobante(req, res, next) {
    try {
        const codigo = req.params.codigo;
        const metodoPago = req.body.metodoPago;

        const venta = await ventaService.obtenerVentaPorCodigoComprobante(codigo);
        const ventaCobrada = await ventaService.cobrarVenta(venta.id, metodoPago);

        res.status(200).json({
            mensaje: "Venta cobrada correctamente",
            venta: ventaCobrada
        });
    } catch (error) { next(error); }
}

module.exports = {
    registrar,
    cobrar,
    cancelar,
    listar,
    obtenerPorId,
    buscarPorComprobante
    ,
    pagarPorComprobante
};