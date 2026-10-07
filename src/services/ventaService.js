const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");
const mailService = require("./mailService");
const mercadoPagoQrService = require("./mercadoPagoQrService");
const { calcularPaginacion, calcularTotalPaginas } = require("../utils/paginacion");

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
            include: {
                detalles: {
                    include: {
                        producto: {
                            select: { id: true, nombre: true, precio: true }
                        }
                    }
                }
            }
        });

        for (const detalle of detalles) {
            await tx.producto.update({
                where: { id: detalle.productoId },
                data: { stockReservado: { increment: detalle.cantidad } }
            });
        }

        return venta;
    });

    if (metodoPago && metodoPago.toLowerCase() === "mercadopago") {
        const ventaConStock = {
            ...resultado,
            detalles: resultado.detalles.map(function (detalle) {
                return {
                    ...detalle,
                    producto: detalle.producto || { nombre: "Producto" }
                };
            })
        };

        let qr;
        try {
            qr = await mercadoPagoQrService.crearQrDinamico(ventaConStock);

            const ventaConQr = await prisma.venta.update({
                where: { id: resultado.id },
                data: {
                    mpOrderId: qr.orderId,
                    mpOrderStatus: qr.status,
                    mpQrData: qr.qrData
                },
                include: {
                    detalles: {
                        include: {
                            producto: {
                                select: { id: true, nombre: true, precio: true }
                            }
                        }
                    }
                }
            });

            return {
                ...ventaConQr,
                pago: {
                    proveedor: "MercadoPago",
                    orderId: qr.orderId,
                    qrData: qr.qrData,
                    expiresAt: qr.expiresAt,
                    estado: qr.status
                }
            };
        } catch (error) {
            if (qr?.orderId) {
                await mercadoPagoQrService.cancelarOrden(qr.orderId, resultado.id).catch(function () {});
            }
            await cancelarVentaLocal(resultado.id, "canceled").catch(function () {});
            throw error;
        }
    }

    return resultado;
}

async function cobrarVenta(ventaId, metodoPago) {
    const resultado = await prisma.$transaction(async (tx) => {
        const venta = await tx.venta.findUnique({
            where: { id: ventaId },
            include: { detalles: true }
        });

        if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);
        if (venta.mpOrderId) {
            throw new ErrorPersonalizado(
                "Esta venta debe confirmarse con el estado de Mercado Pago",
                409
            );
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
            include: {
                detalles: { include: { producto: { select: { nombre: true } } } },
                usuario: { select: { email: true } }
            }
        });

        return ventaCobrada;
    });

    try {
        const correo = await mailService.enviarComprobanteVenta(resultado);
        const { usuario, ...venta } = resultado;
        return { venta, correo };
    } catch (error) {
        console.error("No se pudo enviar el comprobante de la venta " + resultado.id, error);
        const { usuario, ...venta } = resultado;
        return {
            venta,
            correo: { enviado: false, estado: "ERROR", motivo: "No se pudo enviar el comprobante" }
        };
    }
}

async function cancelarVenta(ventaId) {
    const venta = await prisma.venta.findUnique({ where: { id: ventaId } });
    if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);

    if (venta.mpOrderId) {
        const orden = await mercadoPagoQrService.obtenerOrden(venta.mpOrderId);
        validarOrdenQr(venta, orden);

        if (orden.status === "processed") {
            await sincronizarOrdenQr(orden);
            throw new ErrorPersonalizado("El pago ya fue acreditado y no se puede cancelar", 409);
        }

        if (orden.status === "created") {
            await mercadoPagoQrService.cancelarOrden(venta.mpOrderId, venta.id);
        } else if (orden.status !== "expired" && orden.status !== "canceled") {
            throw new ErrorPersonalizado("No se puede cancelar la orden en su estado actual", 409);
        }

        return cancelarVentaLocal(ventaId, orden.status === "expired" ? "expired" : "canceled");
    }

    return cancelarVentaLocal(ventaId, "canceled");
}

async function cancelarVentaLocal(ventaId, estadoOrden) {
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
            data: {
                estado: "CANCELADA",
                mpOrderStatus: estadoOrden,
                mpQrData: null
            },
            include: { detalles: true }
        });

        return ventaCancelada;
    });

    return resultado;
}

async function listarVentas(filtros) {
    const { skip, take, page, limit } = calcularPaginacion(filtros.pagina, filtros.limite);

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
            skip: skip,
            take: take
        }),
        prisma.venta.count({ where: where })
    ]);

    return {
        ventas: ventas,
        paginacion: {
            paginaActual: page,
            totalPaginas: calcularTotalPaginas(total, limit),
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
    const incluirComprobante = {
        detalles: { include: { producto: true } },
        usuario: { select: { id: true, nombre: true, apellido: true } }
    };
    let venta = await prisma.venta.findUnique({
        where: { codigoComprobante: codigo },
        include: incluirComprobante
    });
    if (!venta) throw new ErrorPersonalizado("Comprobante no encontrado", 404);

    if (venta.estado === "PENDIENTE" && venta.mpOrderId) {
        let orden;
        try {
            orden = await mercadoPagoQrService.obtenerOrden(venta.mpOrderId);
        } catch {
            // El comprobante sigue disponible aunque Mercado Pago no responda momentaneamente.
        }

        if (orden && orden.status !== "created") {
            await sincronizarOrdenQr(orden);
            venta = await prisma.venta.findUnique({
                where: { codigoComprobante: codigo },
                include: incluirComprobante
            });
        }
    }

    const { mpQrData, mpOrderId, mpOrderStatus, ...comprobante } = venta;
    return {
        ...comprobante,
        pagoQrData: venta.estado === "PENDIENTE" && mpOrderId && mpOrderStatus === "created"
            ? mpQrData
            : null
    };
}

async function registrarVentaDirecta(cajeroId, datos) {
    const venta = await registrarVenta(cajeroId, datos);

    if (datos.cobrar && datos.metodoPago === "MercadoPago") {
        let qr;
        try {
            qr = await mercadoPagoQrService.crearQrDinamico(venta);
            const ventaConQr = await prisma.venta.update({
                where: { id: venta.id },
                data: {
                    mpOrderId: qr.orderId,
                    mpOrderStatus: qr.status,
                    mpQrData: qr.qrData
                },
                include: {
                    detalles: { include: { producto: { select: { nombre: true } } } }
                }
            });

            return {
                venta: ventaConQr,
                pago: {
                    proveedor: "MercadoPago",
                    orderId: qr.orderId,
                    qrData: qr.qrData,
                    expiresAt: qr.expiresAt,
                    estado: qr.status
                },
                cobradaDirectamente: false
            };
        } catch (error) {
            if (qr?.orderId) {
                await mercadoPagoQrService.cancelarOrden(qr.orderId, venta.id).catch(function () {});
            }
            await cancelarVentaLocal(venta.id, "canceled").catch(function () {});
            throw error;
        }
    }

    if (datos.cobrar && datos.metodoPago) {
        const resultadoCobro = await cobrarVenta(venta.id, datos.metodoPago);
        return {
            venta: resultadoCobro.venta,
            correo: resultadoCobro.correo,
            cobradaDirectamente: true
        };
    }

    return {
        venta: venta,
        cobradaDirectamente: false
    };
}

function validarOrdenQr(venta, orden) {
    if (orden.external_reference !== venta.id) {
        throw new ErrorPersonalizado("La orden de Mercado Pago no corresponde a esta venta", 409);
    }
    if (venta.mpOrderId && orden.id !== venta.mpOrderId) {
        throw new ErrorPersonalizado("El identificador de la orden no coincide con la venta", 409);
    }
    if (orden.currency !== "ARS" || Number(orden.total_amount) !== Number(venta.total)) {
        throw new ErrorPersonalizado("El importe o la moneda de la orden no coincide con la venta", 409);
    }
}

async function sincronizarOrdenQr(orden) {
    const venta = await prisma.venta.findFirst({
        where: {
            OR: [
                { mpOrderId: orden.id },
                { id: orden.external_reference }
            ]
        },
        include: { detalles: true }
    });
    if (!venta) return null;

    validarOrdenQr(venta, orden);

    if (orden.status === "processed") {
        if (venta.estado === "COBRADA") return venta;
        if (venta.estado !== "PENDIENTE") {
            throw new ErrorPersonalizado("La orden se pagó pero la venta ya no está pendiente", 409);
        }

        const actualizada = await prisma.$transaction(async (tx) => {
            const actualizacion = await tx.venta.updateMany({
                where: { id: venta.id, estado: "PENDIENTE" },
                data: {
                    estado: "COBRADA",
                    metodoPago: "Mercado Pago QR",
                    mpOrderId: orden.id,
                    mpOrderStatus: orden.status,
                    mpQrData: null
                }
            });

            if (actualizacion.count === 0) {
                const existente = await tx.venta.findUnique({ where: { id: venta.id } });
                if (existente?.estado === "COBRADA") return { venta: existente, nueva: false };
                throw new ErrorPersonalizado("La venta dejó de estar pendiente", 409);
            }

            for (const detalle of venta.detalles) {
                const producto = await tx.producto.findUnique({ where: { id: detalle.productoId } });
                if (!producto || producto.stock < detalle.cantidad) {
                    throw new ErrorPersonalizado("Stock físico insuficiente para cobrar la venta", 409);
                }

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

            const ventaCobrada = await tx.venta.findUnique({
                where: { id: venta.id },
                include: {
                    detalles: { include: { producto: { select: { nombre: true } } } },
                    usuario: { select: { email: true } }
                }
            });
            return { venta: ventaCobrada, nueva: true };
        });

        if (!actualizada.nueva) return actualizada.venta;

        try {
            const correo = await mailService.enviarComprobanteVenta(actualizada.venta);
            return { ...actualizada.venta, correo: correo };
        } catch (error) {
            console.error("No se pudo enviar el comprobante de la venta " + venta.id, error);
            return actualizada.venta;
        }
    }

    if (orden.status === "expired" || orden.status === "canceled") {
        if (venta.estado === "PENDIENTE") {
            return cancelarVentaLocal(venta.id, orden.status);
        }
        return venta;
    }

    return prisma.venta.update({
        where: { id: venta.id },
        data: { mpOrderId: orden.id, mpOrderStatus: orden.status },
        include: { detalles: true }
    });
}

async function consultarEstadoQr(ventaId) {
    const venta = await prisma.venta.findUnique({ where: { id: ventaId } });
    if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);
    if (!venta.mpOrderId) throw new ErrorPersonalizado("La venta no tiene una orden QR", 404);

    const orden = await mercadoPagoQrService.obtenerOrden(venta.mpOrderId);
    const ventaActualizada = await sincronizarOrdenQr(orden);
    return {
        venta: ventaActualizada,
        pago: {
            proveedor: "MercadoPago",
            orderId: orden.id,
            estado: orden.status,
            qrData: orden.status === "created" ? venta.mpQrData : null,
            expiresAt: orden.expiration_time || null
        }
    };
}

async function procesarNotificacionQr(notificacion) {
    const orderId = notificacion?.data?.id;
    if (!orderId) return null;

    const orden = await mercadoPagoQrService.obtenerOrden(orderId);
    return sincronizarOrdenQr(orden);
}

module.exports = {
    registrarVenta,
    registrarVentaDirecta,
    cobrarVenta,
    cancelarVenta,
    listarVentas,
    obtenerVentaPorId,
    obtenerVentaPorCodigoComprobante,
    consultarEstadoQr,
    procesarNotificacionQr
};
