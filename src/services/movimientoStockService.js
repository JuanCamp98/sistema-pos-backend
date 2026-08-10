const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

const MOTIVOS_PERMITIDOS_MANUAL = ["AJUSTE_MANUAL", "DEVOLUCION"];

async function registrarMovimiento(datos) {
    const { productoId, tipo, motivo, cantidad, referenciaId } = datos;

    if (!MOTIVOS_PERMITIDOS_MANUAL.includes(motivo)) {
        throw new ErrorPersonalizado("Motivo no permitido para carga manual de stock", 400);
    }
    if (cantidad <= 0) {
        throw new ErrorPersonalizado("La cantidad debe ser mayor a cero", 400);
    }

    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto || !producto.activo) throw new ErrorPersonalizado("Producto no encontrado", 404);

    const stockDisponible = producto.stock - producto.stockReservado;
    if (tipo === "SALIDA" && stockDisponible < cantidad) {
        throw new ErrorPersonalizado(
            "Stock insuficiente para realizar la salida (disponible: " + stockDisponible + ")",
            400
        );
    }

    const nuevoStock = tipo === "ENTRADA"
        ? producto.stock + cantidad
        : producto.stock - cantidad;

    const resultado = await prisma.$transaction(async (tx) => {
        const movimiento = await tx.movimientoStock.create({
            data: { productoId, tipo, motivo, cantidad, referenciaId }
        });
        await tx.producto.update({
            where: { id: productoId },
            data: { stock: nuevoStock }
        });
        return movimiento;
    });

    return resultado;
}

async function listarMovimientos(pagina, limite) {
    const paginaActual = pagina || 1;
    const limiteActual = limite || 10;
    const saltar = (paginaActual - 1) * limiteActual;

    const [movimientos, total] = await prisma.$transaction([
        prisma.movimientoStock.findMany({
            include: { producto: true },
            orderBy: { creadoEn: "desc" },
            skip: saltar,
            take: limiteActual
        }),
        prisma.movimientoStock.count()
    ]);

    return {
        movimientos: movimientos,
        paginacion: {
            paginaActual: paginaActual,
            totalPaginas: Math.ceil(total / limiteActual),
            totalRegistros: total
        }
    };
}

async function listarMovimientosPorProducto(productoId) {
    const movimientos = await prisma.movimientoStock.findMany({
        where: { productoId: productoId },
        orderBy: { creadoEn: "desc" }
    });
    return movimientos;
}

module.exports = { registrarMovimiento, listarMovimientos, listarMovimientosPorProducto };