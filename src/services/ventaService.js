const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const ErrorPersonalizado = require("../utils/errorPersonalizado");
const mailService = require("./mailService");
const mercadoPagoQrService = require("./mercadoPagoQrService");
const { calcularPaginacion, calcularTotalPaginas } = require("../utils/paginacion");
const { calcularPrecioPromocional, calcularPromocionesCombo } = require("./promocionService");
const { validarHorarioRetiro } = require("./retiroService");

function generarCodigoComprobante() {
    const fecha = new Date();
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `V-${anio}${mes}${dia}-${random}`;
}

async function notificarCompraListaParaPreparar(tx, venta) {
    if (venta.origen !== "AUTOGESTION") return;

    const destinatarios = await tx.usuario.findMany({
        where: { rol: { nombre: { in: ["Administrador", "Cajero"] } } },
        select: { id: true }
    });
    if (destinatarios.length === 0) return;

    await tx.notificacion.createMany({
        data: destinatarios.map(function (destinatario) {
            return {
                usuarioId: destinatario.id,
                ventaId: venta.id,
                mensaje: "La compra " + venta.codigoComprobante + " está pagada y lista para comenzar a preparar."
            };
        }),
        skipDuplicates: true
    });
}

function normalizarNombrePersonalizado(nombre) {
    if (typeof nombre !== "string") return nombre;
    return nombre.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

async function registrarVenta(usuarioId, datos, origen = "AUTOGESTION") {
    const { items, cliente, metodoPago, retiro, nombrePersonalizado } = datos;

    if (!items || items.length === 0) {
        throw new ErrorPersonalizado("La venta debe tener al menos un producto", 400);
    }
    if (origen === "AUTOGESTION" && !retiro) {
        throw new ErrorPersonalizado("La fecha y el horario de retiro son obligatorios", 400);
    }

    const cantidadesPorProducto = new Map();
    for (const item of items) {
        cantidadesPorProducto.set(item.productoId, (cantidadesPorProducto.get(item.productoId) || 0) + item.cantidad);
    }
    const itemsAgrupados = Array.from(cantidadesPorProducto, ([productoId, cantidad]) => ({ productoId, cantidad }));

    const resultado = await prisma.$transaction(async (tx) => {
        const fechaRetiro = origen === "AUTOGESTION"
            ? await validarHorarioRetiro(tx, retiro)
            : null;
        let totalCentavos = 0;
        const productosCalculados = [];

        for (const item of itemsAgrupados) {
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

            const precio = await calcularPrecioPromocional(tx, {
                ...producto,
                categoria: (await tx.categoria.findUnique({ where: { id: producto.categoriaId }, select: { nombre: true } })).nombre,
                cantidad: item.cantidad
            });
            if (precio.promocionNoAplicable) {
                throw new ErrorPersonalizado(precio.promocionNoAplicable.mensaje, 409);
            }
            productosCalculados.push({
                producto,
                cantidad: item.cantidad,
                precio
            });
        }

        const calculosCombo = calcularPromocionesCombo(productosCalculados);
        const detalles = productosCalculados.map((item) => {
            const calculoCombo = calculosCombo.get(item.producto.id);
            const precioUnitarioCentavos = Math.round(item.precio.precioOriginal * 100);
            const subtotalCentavos = calculoCombo.subtotalCentavos;
            totalCentavos += subtotalCentavos;

            return {
                productoId: item.producto.id,
                cantidad: item.cantidad,
                precioUnitario: precioUnitarioCentavos / 100,
                subtotal: subtotalCentavos / 100,
                descuentoTotal: calculoCombo.descuentoTotalCentavos / 100,
                unidadesBonificadas: calculoCombo.unidadesBonificadas,
                combosAplicados: calculoCombo.combosAplicados,
                promocionTitulo: calculoCombo.promocionTitulo
            };
        });

        const nombrePersonalizadoNormalizado = normalizarNombrePersonalizado(nombrePersonalizado);

        const venta = await tx.venta.create({
            data: {
                usuarioId: usuarioId || null,
                ...(fechaRetiro && {
                    fechaRetiro,
                    horarioRetiroInicio: retiro.horaInicio,
                    horarioRetiroFin: retiro.horaFin
                }),
                clienteNombre: cliente?.nombre || null,
                clienteApellido: cliente?.apellido || null,
                clienteDni: cliente?.dni || null,
                clienteEmail: cliente?.email || null,
                nombrePersonalizado: nombrePersonalizadoNormalizado || null,
                codigoComprobante: generarCodigoComprobante(),
                estado: "PENDIENTE",
                origen: origen,
                metodoPago: metodoPago || null,
                total: totalCentavos / 100,
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
                    mpOrderStatusDetail: qr.statusDetail,
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
                    estado: qr.status,
                    detalleEstado: qr.statusDetail
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

async function cobrarVenta(ventaId, metodoPago, efectivoRecibido) {
    let cambio;
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

        if (metodoPago === "Efectivo") {
            if (typeof efectivoRecibido !== "number" || !Number.isFinite(efectivoRecibido) || efectivoRecibido <= 0) {
                throw new ErrorPersonalizado("El efectivo recibido debe ser un numero mayor a 0", 400);
            }

            const efectivoDecimal = new Prisma.Decimal(String(efectivoRecibido));
            const totalDecimal = new Prisma.Decimal(venta.total.toString());
            if (efectivoDecimal.lessThan(totalDecimal)) {
                throw new ErrorPersonalizado("El efectivo recibido es insuficiente", 400);
            }
            cambio = efectivoDecimal.minus(totalDecimal).toNumber();
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

        const actualizacionVenta = await tx.venta.updateMany({
            where: { id: ventaId, estado: "PENDIENTE" },
            data: {
                estado: "COBRADA",
                metodoPago: metodoPago
            }
        });
        if (actualizacionVenta.count !== 1) {
            throw new ErrorPersonalizado("La venta cambió mientras se procesaba el cobro", 409);
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

        const ventaCobrada = await tx.venta.findUnique({
            where: { id: ventaId },
            include: {
                detalles: { include: { producto: { select: { nombre: true } } } },
                usuario: { select: { email: true } }
            }
        });

        await notificarCompraListaParaPreparar(tx, ventaCobrada);
        return ventaCobrada;
    });

    try {
        const correo = await mailService.enviarComprobanteVenta(resultado);
        const { usuario, ...venta } = resultado;
        return { venta, correo, ...(metodoPago === "Efectivo" ? { cambio } : {}) };
    } catch (error) {
        console.error("No se pudo enviar el comprobante de la venta " + resultado.id, error);
        const { usuario, ...venta } = resultado;
        return {
            venta,
            correo: { enviado: false, estado: "ERROR", motivo: "No se pudo enviar el comprobante" },
            ...(metodoPago === "Efectivo" ? { cambio } : {})
        };
    }
}

async function cambiarEstadoRetiro(ventaId, estadoNuevo, estadosPermitidos) {
    return prisma.$transaction(async (tx) => {
        const venta = await tx.venta.findUnique({ where: { id: ventaId } });
        if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);
        if (venta.origen !== "AUTOGESTION") {
            throw new ErrorPersonalizado("Las ventas rápidas se entregan en el momento y no requieren preparación para retiro", 400);
        }
        if (!estadosPermitidos.includes(venta.estado)) {
            throw new ErrorPersonalizado("La venta debe estar en " + estadosPermitidos.join(" o ") + " para avanzar a " + estadoNuevo, 400);
        }

        const actualizacion = await tx.venta.updateMany({
            where: {
                id: ventaId,
                origen: "AUTOGESTION",
                estado: venta.estado
            },
            data: { estado: estadoNuevo }
        });
        if (actualizacion.count !== 1) {
            throw new ErrorPersonalizado("La venta cambió mientras se procesaba la operación. Actualizá e intentá nuevamente.", 409);
        }

        const ventaActualizada = await tx.venta.findUnique({
            where: { id: ventaId },
            include: {
                detalles: { include: { producto: { select: { nombre: true } } } },
                usuario: { select: { email: true } }
            }
        });

        return ventaActualizada;
    });
}

async function marcarVentaEnPreparacion(ventaId) {
    return cambiarEstadoRetiro(ventaId, "EN_PREPARACION", ["COBRADA"]);
}

async function marcarVentaListaParaRetirar(ventaId) {
    const venta = await cambiarEstadoRetiro(ventaId, "LISTA_PARA_RETIRAR", ["COBRADA", "EN_PREPARACION"]);
    try {
        const correo = await mailService.enviarAvisoPedidoListo(venta);
        return { venta, correo };
    } catch (error) {
        console.error("No se pudo enviar el aviso de retiro de la venta " + venta.id, error);
        return { venta, correo: { enviado: false, estado: "ERROR", motivo: "No se pudo enviar el aviso de retiro" } };
    }
}

async function marcarVentaRetirada(ventaId) {
    return cambiarEstadoRetiro(ventaId, "RETIRADA", ["LISTA_PARA_RETIRAR"]);
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
            const ordenCancelada = await mercadoPagoQrService.cancelarOrden(venta.mpOrderId, venta.id);
            if (ordenCancelada.status === "processed") {
                await sincronizarOrdenQr(ordenCancelada);
                throw new ErrorPersonalizado("El pago ya fue acreditado y no se puede cancelar", 409);
            }
            if (!["canceled", "expired"].includes(ordenCancelada.status)) {
                throw new ErrorPersonalizado("Mercado Pago no confirmó la cancelación de la orden", 409);
            }
            return cancelarVentaLocal(ventaId, ordenCancelada.status, ordenCancelada.status_detail);
        } else if (orden.status !== "expired" && orden.status !== "canceled") {
            throw new ErrorPersonalizado("No se puede cancelar la orden en su estado actual", 409);
        }

        return cancelarVentaLocal(ventaId, orden.status, orden.status_detail);
    }

    return cancelarVentaLocal(ventaId, "canceled");
}

async function cancelarVentaCliente(ventaId, usuarioId) {
    const venta = await prisma.venta.findFirst({
        where: { id: ventaId, usuarioId },
        select: { id: true, estado: true }
    });
    if (!venta) throw new ErrorPersonalizado("Compra no encontrada", 404);
    if (venta.estado !== "PENDIENTE") {
        throw new ErrorPersonalizado("Solo se pueden cancelar compras pendientes", 409);
    }

    return cancelarVenta(venta.id);
}

async function cancelarVentaLocal(ventaId, estadoOrden, detalleEstadoOrden = null) {
    const resultado = await prisma.$transaction(async (tx) => {
        const venta = await tx.venta.findUnique({
            where: { id: ventaId },
            include: { detalles: true }
        });

        if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);
        const actualizacionVenta = await tx.venta.updateMany({
            where: { id: ventaId, estado: "PENDIENTE" },
            data: {
                estado: "CANCELADA",
                mpOrderStatus: estadoOrden,
                mpOrderStatusDetail: detalleEstadoOrden,
                mpQrData: null
            }
        });
        if (actualizacionVenta.count !== 1) {
            throw new ErrorPersonalizado("La venta ya no está pendiente y no se puede cancelar", 409);
        }

        for (const detalle of venta.detalles) {
            await tx.producto.update({
                where: { id: detalle.productoId },
                data: { stockReservado: { decrement: detalle.cantidad } }
            });
        }

        const ventaCancelada = await tx.venta.findUnique({
            where: { id: ventaId },
            include: { detalles: true }
        });

        return ventaCancelada;
    });

    return resultado;
}

function crearFiltrosVentas(filtros) {
    return {
        ...(filtros.estado && { estado: filtros.estado }),
        ...(filtros.clienteId && { usuarioId: filtros.clienteId }),
        ...(filtros.buscar && {
            codigoComprobante: { contains: filtros.buscar, mode: "insensitive" }
        }),
        ...((filtros.fechaDesde || filtros.fechaHasta) && {
            fecha: {
                ...(filtros.fechaDesde && { gte: filtros.fechaDesde }),
                ...(filtros.fechaHasta && { lte: filtros.fechaHasta })
            }
        })
    };
}

async function listarVentas(filtros) {
    const { skip, take, page, limit } = calcularPaginacion(filtros.pagina, filtros.limite);
    const where = crearFiltrosVentas(filtros);

    const [ventas, total] = await prisma.$transaction([
        prisma.venta.findMany({
            where: where,
            include: {
                detalles: {
                    include: {
                        producto: true
                    }
                },
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
        total: total,
        paginacion: {
            paginaActual: page,
            totalPaginas: calcularTotalPaginas(total, limit),
            totalRegistros: total
        }
    };
}

async function listarVentasParaReporte(filtros) {
    return prisma.venta.findMany({
        where: crearFiltrosVentas(filtros),
        select: {
            codigoComprobante: true,
            fecha: true,
            clienteNombre: true,
            clienteApellido: true,
            estado: true,
            metodoPago: true,
            total: true,
            usuario: {
                select: { nombre: true, apellido: true }
            }
        },
        orderBy: { fecha: "desc" }
    });
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

async function renombrarVenta(id, usuarioId, nombrePersonalizado) {
    const venta = await prisma.venta.findUnique({
        where: { id },
        select: { id: true, usuarioId: true }
    });
    if (!venta) throw new ErrorPersonalizado("Venta no encontrada", 404);
    if (venta.usuarioId !== usuarioId) {
        throw new ErrorPersonalizado("No tenes permisos para realizar esta accion", 403);
    }

    return prisma.venta.update({
        where: { id },
        data: { nombrePersonalizado }
    });
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

    let verificacionPagoPendiente = false;
    if (venta.estado === "PENDIENTE" && venta.mpOrderId) {
        let orden;
        try {
            orden = await mercadoPagoQrService.obtenerOrden(venta.mpOrderId);
        } catch {
            verificacionPagoPendiente = true;
        }

        if (orden && orden.status !== "created") {
            await sincronizarOrdenQr(orden);
            venta = await prisma.venta.findUnique({
                where: { codigoComprobante: codigo },
                include: incluirComprobante
            });
        }
    }

    const { mpQrData, mpOrderId, mpOrderStatus, mpOrderStatusDetail, ...comprobante } = venta;
    return {
        ...comprobante,
        estadoPago: mpOrderStatus,
        detalleEstadoPago: mpOrderStatusDetail,
        verificacionPagoPendiente,
        pagoQrData: venta.estado === "PENDIENTE" && mpOrderId && mpOrderStatus === "created"
            ? mpQrData
            : null
    };
}

async function registrarVentaDirecta(cajeroId, datos) {
    const registro = await registrarVenta(cajeroId, datos, "RAPIDA");
    const { pago, ...venta } = registro;

    if (pago) {
        return {
            venta,
            pago,
            cobradaDirectamente: false
        };
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
    if (orden.id !== venta.mpOrderId || orden.type !== "qr") {
        throw new ErrorPersonalizado("La orden de Mercado Pago no corresponde a esta venta", 409);
    }
    if (orden.external_reference !== venta.id) {
        throw new ErrorPersonalizado("La orden de Mercado Pago no corresponde a esta venta", 409);
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
        if (["COBRADA", "EN_PREPARACION", "LISTA_PARA_RETIRAR", "RETIRADA"].includes(venta.estado)) return venta;
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
                    mpOrderStatusDetail: orden.status_detail || null,
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
            await notificarCompraListaParaPreparar(tx, ventaCobrada);
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
            return cancelarVentaLocal(venta.id, orden.status, orden.status_detail);
        }
        return venta;
    }

    if (orden.status === "refunded") {
        if (venta.estado === "REEMBOLSADA") return venta;

        return prisma.$transaction(async (tx) => {
            const actual = await tx.venta.findUnique({
                where: { id: venta.id },
                include: { detalles: true }
            });
            if (!actual) throw new ErrorPersonalizado("Venta no encontrada", 404);
            if (actual.estado === "REEMBOLSADA") return actual;

            if (actual.estado === "PENDIENTE") {
                for (const detalle of actual.detalles) {
                    await tx.producto.update({
                        where: { id: detalle.productoId },
                        data: { stockReservado: { decrement: detalle.cantidad } }
                    });
                }
            }

            return tx.venta.update({
                where: { id: actual.id },
                data: {
                    estado: "REEMBOLSADA",
                    mpOrderStatus: orden.status,
                    mpOrderStatusDetail: orden.status_detail || null,
                    mpQrData: null
                },
                include: { detalles: true }
            });
        });
    }

    return prisma.venta.update({
        where: { id: venta.id },
        data: {
            mpOrderId: orden.id,
            mpOrderStatus: orden.status,
            mpOrderStatusDetail: orden.status_detail || null
        },
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
            detalleEstado: orden.status_detail || null,
            qrData: orden.status === "created" ? venta.mpQrData : null,
            expiresAt: orden.expiration_time || null
        }
    };
}

async function procesarNotificacionQr(orderId) {
    const venta = await prisma.venta.findUnique({
        where: { mpOrderId: orderId },
        select: { id: true }
    });
    if (!venta) return null;

    const orden = await mercadoPagoQrService.obtenerOrden(orderId);
    if (orden.id !== orderId || orden.type !== "qr") {
        throw new ErrorPersonalizado("La orden notificada no corresponde a una compra QR local", 409);
    }
    return sincronizarOrdenQr(orden);
}

module.exports = {
    registrarVenta,
    registrarVentaDirecta,
    cobrarVenta,
    marcarVentaEnPreparacion,
    marcarVentaListaParaRetirar,
    marcarVentaRetirada,
    cancelarVenta,
    cancelarVentaCliente,
    listarVentas,
    listarVentasParaReporte,
    obtenerVentaPorId,
    renombrarVenta,
    obtenerVentaPorCodigoComprobante,
    consultarEstadoQr,
    procesarNotificacionQr
};
