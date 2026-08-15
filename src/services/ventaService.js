const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

function generarCodigoComprobante() {
    const fecha = new Date();
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `V-${anio}${mes}${dia}-${random}`;
}

async function registrarVenta(usuarioId, datos) {
    const { items, cliente, metodoPago } = datos;

    if (!items || items.length === 0) {
        throw new ErrorPersonalizado("La venta debe tener al menos un producto", 400);
    }

    const resultado = await prisma.$transaction(async (tx) => {
        let total = 0;
        const detalles = [];

        for (const item of items) {
            const producto = await tx.producto.findUnique({ where: { id: item.productoId } });
            if (!producto || !producto.activo) {
                throw new ErrorPersonalizado("Producto no encontrado: " + item.productoId, 404);
            }
            if (item.cantidad <= 0) {
                throw new ErrorPersonalizado("La cantidad debe ser mayor a cero", 400);
            }

            const stockDisponible = producto.stock - producto.stockReservado;
            if (stockDisponible < item.cantidad) {
                throw new ErrorPersonalizado(
                    "Stock insuficiente para: " + producto.nombre +
                    " (disponible: " + stockDisponible + ")",
                    400
                );
            }

            const subtotal = Number(producto.precio) * item.cantidad;
            total += subtotal;

            detalles.push({
                productoId: producto.id,
                cantidad: item.cantidad,
                precioUnitario: producto.precio,
                subtotal: subtotal
            });
        }

        const venta = await tx.venta.create({
            data: {
                usuarioId: usuarioId || null,
                clienteNombre: cliente?.nombre || null,
                clienteApellido: cliente?.apellido || null,
                clienteDni: cliente?.dni || null,
                clienteEmail: cliente?.email || null,
                codigoComprobante: generarCodigoComprobante(),
                estado: "PENDIENTE",
                metodoPago: metodoPago || null,
                total: total,
                detalles: { create: detalles }
            },
            include: { detalles: true }
        });

        for (const detalle of detalles) {
            await tx.producto.update({
                where: { id: detalle.productoId },
                data: { stockReservado: { increment: detalle.cantidad } }
            });
        }

        return venta;
    });

    return resultado;
}

async function cobrarVenta(ventaId, metodoPago, codigoComprobanteCliente) {
    const resultado = await prisma.$transaction(async (tx) => {
        const venta = await tx.venta.findUnique({
            where: { id: ventaId },
            include: { detalles: true }
        });

        if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);

        // Si se pasa codigoComprobante, validar que coincida con la venta.
        // Esto permite que el cliente anonimo cobre su propia venta sin login
        // (porque es el unico que conoce el codigo).
        if (codigoComprobanteCliente && codigoComprobanteCliente !== venta.codigoComprobante) {
            throw new ErrorPersonalizado("El codigo de comprobante no coincide", 403);
        }

        if (venta.estado !== "PENDIENTE") {
            throw new ErrorPersonalizado(
                "Solo se pueden cobrar ventas en estado PENDIENTE (estado actual: " + venta.estado + ")",
                400
            );
        }

        for (const detalle of venta.detalles) {
            const producto = await tx.producto.findUnique({ where: { id: detalle.productoId } });
            if (producto.stock < detalle.cantidad) {
                throw new ErrorPersonalizado(
                    "Stock fisico insuficiente para cobrar: " + producto.nombre,
                    400
                );
            }
        }

        for (const detalle of venta.detalles) {
            await tx.movimientoStock.create({
                data: {
                    productoId: detalle.productoId,
                    tipo: "SALIDA",
                    motivo: "VENTA",
                    cantidad: detalle.cantidad,
                    referenciaId: venta.id
                }
            });
            await tx.producto.update({
                where: { id: detalle.productoId },
                data: {
                    stock: { decrement: detalle.cantidad },
                    stockReservado: { decrement: detalle.cantidad }
                }
            });
        }

        const ventaCobrada = await tx.venta.update({
            where: { id: ventaId },
            data: {
                estado: "COBRADA",
                metodoPago: metodoPago
            },
            include: { detalles: true }
        });

        return ventaCobrada;
    });

    return resultado;
}

async function cancelarVenta(ventaId) {
    const resultado = await prisma.$transaction(async (tx) => {
        const venta = await tx.venta.findUnique({
            where: { id: ventaId },
            include: { detalles: true }
        });

        if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);
        if (venta.estado !== "PENDIENTE") {
            throw new ErrorPersonalizado(
                "Solo se pueden cancelar ventas en estado PENDIENTE (estado actual: " + venta.estado + ")",
                400
            );
        }

        for (const detalle of venta.detalles) {
            await tx.producto.update({
                where: { id: detalle.productoId },
                data: { stockReservado: { decrement: detalle.cantidad } }
            });
        }

        const ventaCancelada = await tx.venta.update({
            where: { id: ventaId },
            data: { estado: "CANCELADA" },
            include: { detalles: true }
        });

        return ventaCancelada;
    });

    return resultado;
}

async function listarVentas(filtros) {
    const pagina = filtros.pagina || 1;
    const limite = filtros.limite || 10;
    const saltar = (pagina - 1) * limite;

    const where = {
        ...(filtros.estado && { estado: filtros.estado }),
        ...(filtros.clienteId && { usuarioId: filtros.clienteId }),
        ...((filtros.fechaDesde || filtros.fechaHasta) && {
            fecha: {
                ...(filtros.fechaDesde && { gte: filtros.fechaDesde }),
                ...(filtros.fechaHasta && { lte: filtros.fechaHasta })
            }
        })
    };

    const [ventas, total] = await prisma.$transaction([
        prisma.venta.findMany({
            where: where,
            include: {
                detalles: true,
                usuario: { select: { id: true, nombre: true, apellido: true } }
            },
            orderBy: { creadoEn: "desc" },
            skip: saltar,
            take: limite
        }),
        prisma.venta.count({ where: where })
    ]);

    return {
        ventas: ventas,
        paginacion: {
            paginaActual: pagina,
            totalPaginas: Math.ceil(total / limite),
            totalRegistros: total
        }
    };
}

async function obtenerVentaPorId(id) {
    const venta = await prisma.venta.findUnique({
        where: { id: id },
        include: {
            detalles: { include: { producto: true } },
            usuario: { select: { id: true, nombre: true, apellido: true } }
        }
    });
    if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);
    return venta;
}

async function obtenerVentaPorCodigoComprobante(codigo) {
    const venta = await prisma.venta.findUnique({
        where: { codigoComprobante: codigo },
        include: {
            detalles: { include: { producto: true } },
            usuario: { select: { id: true, nombre: true, apellido: true } }
        }
    });
    if (!venta) throw new ErrorPersonalizado("Comprobante no encontrado", 404);
    return venta;
}

module.exports = {
    registrarVenta,
    cobrarVenta,
    cancelarVenta,
    listarVentas,
    obtenerVentaPorId,
    obtenerVentaPorCodigoComprobante
};
