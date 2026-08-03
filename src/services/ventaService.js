const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

async function registrarVenta(usuarioId, items) {
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
            if (producto.stock < item.cantidad) {
                throw new ErrorPersonalizado("Stock insuficiente para: " + producto.nombre, 400);
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
                usuarioId: usuarioId,
                total: total,
                detalles: { create: detalles }
            },
            include: { detalles: true }
        });

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
                data: { stock: { decrement: detalle.cantidad } }
            });
        }

        return venta;
    });

    return resultado;
}

async function listarVentas(pagina, limite) {
    const paginaActual = pagina || 1;
    const limiteActual = limite || 10;
    const saltar = (paginaActual - 1) * limiteActual;

    const [ventas, total] = await prisma.$transaction([
        prisma.venta.findMany({
            include: {
                detalles: true,
                usuario: { select: { id: true, nombre: true, apellido: true } }
            },
            orderBy: { fecha: "desc" },
            skip: saltar,
            take: limiteActual
        }),
        prisma.venta.count()
    ]);

    return {
        ventas: ventas,
        paginacion: {
            paginaActual: paginaActual,
            totalPaginas: Math.ceil(total / limiteActual),
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

module.exports = { registrarVenta, listarVentas, obtenerVentaPorId };