const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

async function listarNotificaciones(usuarioId) {
    const [notificaciones, noLeidas] = await prisma.$transaction([
        prisma.notificacion.findMany({
            where: { usuarioId: usuarioId },
            include: {
                venta: { select: { id: true, codigoComprobante: true } }
            },
            orderBy: { creadaEn: "desc" }
        }),
        prisma.notificacion.count({
            where: { usuarioId: usuarioId, leidaEn: null }
        })
    ]);

    return { notificaciones: notificaciones, noLeidas: noLeidas };
}

async function marcarComoLeida(notificacionId, usuarioId) {
    await prisma.notificacion.updateMany({
        where: {
            id: notificacionId,
            usuarioId: usuarioId,
            leidaEn: null
        },
        data: { leidaEn: new Date() }
    });

    const notificacion = await prisma.notificacion.findFirst({
        where: { id: notificacionId, usuarioId: usuarioId },
        include: {
            venta: { select: { id: true, codigoComprobante: true } }
        }
    });
    if (!notificacion) {
        throw new ErrorPersonalizado("Notificación no encontrada", 404);
    }

    return notificacion;
}

module.exports = { listarNotificaciones, marcarComoLeida };
