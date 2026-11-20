const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");
const { calcularPaginacion } = require("../utils/paginacion");
const configuracionStockService = require("./configuracionStockService");

const MOTIVOS_PERMITIDOS_MANUAL = ["AJUSTE_MANUAL", "DEVOLUCION"];

const CAMPOS_STOCK = {
    id: true,
    nombre: true,
    imagen: true,
    precio: true,
    categoriaRelacion: { select: { nombre: true } },
    stock: true,
    stockReservado: true
};

function calcularStockDisponible(producto) {
    return producto.stock - producto.stockReservado;
}

function presentarProductoStock(producto, umbralStockBajo) {
    const stockDisponible = calcularStockDisponible(producto);
    return {
        ...producto,
        categoria: producto.categoriaRelacion?.nombre,
        stockDisponible,
        stockBajo: stockDisponible <= umbralStockBajo
    };
}

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

    const resultado = await prisma.$transaction(async (tx) => {
        // Actualizacion atomica: evita perder ajustes concurrentes y valida el
        // disponible real en la misma sentencia para las salidas.
        const filasAfectadas = tipo === "ENTRADA"
            ? await tx.$executeRaw`
                UPDATE "productos"
                SET "stock" = "stock" + ${cantidad}
                WHERE "id" = ${productoId} AND "activo" = true
            `
            : await tx.$executeRaw`
                UPDATE "productos"
                SET "stock" = "stock" - ${cantidad}
                WHERE "id" = ${productoId}
                  AND "activo" = true
                  AND ("stock" - "stock_reservado") >= ${cantidad}
            `;

        if (filasAfectadas !== 1) {
            const actual = await tx.producto.findUnique({
                where: { id: productoId },
                select: { activo: true, stock: true, stockReservado: true }
            });
            if (!actual || !actual.activo) {
                throw new ErrorPersonalizado("Producto no encontrado", 404);
            }
            throw new ErrorPersonalizado(
                "Stock insuficiente para realizar la salida (disponible: " +
                Math.max(0, actual.stock - actual.stockReservado) + ")",
                400
            );
        }

        return tx.movimientoStock.create({
            data: { productoId, tipo, motivo, cantidad, referenciaId }
        });
    });

    return resultado;
}

async function listarMovimientos(pagina, limite) {
    return listarHistorialMovimientos({ page: pagina, limit: limite });
}

function coincideEstadoStock(producto, estado, umbralStockBajo) {
    if (!estado || estado === "todos") return true;
    if (estado === "sin-stock") return producto.stockDisponible <= 0;
    if (estado === "stock-bajo") {
        return producto.stockDisponible > 0 && producto.stockDisponible <= umbralStockBajo;
    }
    if (estado === "en-stock") return producto.stockDisponible > umbralStockBajo;
    return true;
}

async function listarStock(pagina, limite, filtros = {}) {
    // Compatibilidad con la firma anterior listarStock(page, limit, soloStockBajo).
    const opciones = typeof filtros === "boolean" ? { bajo: filtros } : (filtros || {});
    const { bajo = false, buscar, categoria, estado } = opciones;
    const { skip, take, page, limit } = calcularPaginacion(pagina, limite);
    const umbralStockBajo = await configuracionStockService.obtenerUmbralStockBajo();

    const where = {
        activo: true,
        ...(buscar ? { nombre: { contains: buscar, mode: "insensitive" } } : {}),
        ...(categoria ? {
            categoriaRelacion: { nombre: { equals: categoria, mode: "insensitive" } }
        } : {})
    };

    // `bajo` y `estado` dependen del stock disponible (dos columnas), por lo que
    // se resuelven en memoria antes de paginar para no romper el total.
    const requiereFiltroEnMemoria = Boolean(bajo) || Boolean(estado && estado !== "todos");
    if (requiereFiltroEnMemoria) {
        const productos = await prisma.producto.findMany({
            where,
            select: CAMPOS_STOCK,
            orderBy: { nombre: "asc" }
        });
        const filtrados = productos
            .map((producto) => presentarProductoStock(producto, umbralStockBajo))
            .filter((producto) => !bajo || producto.stockBajo)
            .filter((producto) => coincideEstadoStock(producto, estado, umbralStockBajo));
        return paginarProductosStock(filtrados, skip, take, page, limit);
    }

    const [productos, total] = await prisma.$transaction([
        prisma.producto.findMany({
            where,
            select: CAMPOS_STOCK,
            orderBy: { nombre: "asc" },
            skip: skip,
            take: take
        }),
        prisma.producto.count({ where })
    ]);

    return {
        data: productos.map((producto) => presentarProductoStock(producto, umbralStockBajo)),
        total,
        page: page,
        limit: limit
    };
}

function paginarProductosStock(productos, skip, take, page, limit) {
    return {
        data: productos.slice(skip, skip + take),
        total: productos.length,
        page,
        limit
    };
}

async function listarStockParaReporte(soloStockBajo = false, umbralStockBajo) {
    const umbral = umbralStockBajo ?? await configuracionStockService.obtenerUmbralStockBajo();
    const productos = await prisma.producto.findMany({
        where: { activo: true },
        select: {
            nombre: true,
            precio: true,
            stock: true,
            stockReservado: true,
            categoriaRelacion: { select: { nombre: true } },
            tipoProducto: { select: { nombre: true } }
        },
        orderBy: { nombre: "asc" }
    });

    return productos
        .map((producto) => ({
            nombre: producto.nombre,
            categoria: producto.categoriaRelacion?.nombre,
            tipoProducto: producto.tipoProducto?.nombre,
            precio: producto.precio,
            stock: producto.stock,
            stockReservado: producto.stockReservado,
            stockDisponible: calcularStockDisponible(producto)
        }))
        .filter((producto) => !soloStockBajo || producto.stockDisponible <= umbral);
}

async function obtenerResumenStockBajo() {
    const umbralStockBajo = await configuracionStockService.obtenerUmbralStockBajo();
    const [productos, totalProductosActivos] = await prisma.$transaction([
        prisma.producto.findMany({
            where: { activo: true },
            select: {
                id: true,
                nombre: true,
                stock: true,
                stockReservado: true
            },
            orderBy: { nombre: "asc" }
        }),
        prisma.producto.count({ where: { activo: true } })
    ]);

    const productosStockBajo = productos
        .map((producto) => ({
            ...producto,
            stockDisponible: calcularStockDisponible(producto)
        }))
        .filter((producto) => producto.stockDisponible <= umbralStockBajo)
        .sort((a, b) => a.stockDisponible - b.stockDisponible || a.nombre.localeCompare(b.nombre, "es"));

    return {
        umbralStockBajo,
        totalProductosActivos,
        totalProductosStockBajo: productosStockBajo.length,
        productosStockBajo
    };
}

async function obtenerResumenInventario() {
    const umbralStockBajo = await configuracionStockService.obtenerUmbralStockBajo();
    const [productos, categorias] = await prisma.$transaction([
        prisma.producto.findMany({
            where: { activo: true },
            select: {
                stock: true,
                stockReservado: true
            }
        }),
        // Se cuentan todas las categorias activas para que el indicador suba
        // tambien cuando se crea una categoria sin productos todavia.
        prisma.categoria.count({ where: { activo: true } })
    ]);

    let stockBajo = 0;
    let sinStock = 0;

    productos.forEach((producto) => {
        const stockDisponible = calcularStockDisponible(producto);
        if (stockDisponible <= 0) {
            sinStock += 1;
        } else if (stockDisponible <= umbralStockBajo) {
            stockBajo += 1;
        }
    });

    return {
        totalProductos: productos.length,
        stockBajo,
        sinStock,
        categorias,
        umbralStockBajo
    };
}

async function obtenerVistaPreviaStockBajo(umbralStockBajo) {
    const umbral = configuracionStockService.validarUmbral(umbralStockBajo);

    // Una sola consulta liviana sobre todo el inventario activo: la vista previa
    // no depende de la página visible ni guarda el umbral propuesto.
    const productos = await prisma.producto.findMany({
        where: { activo: true },
        select: {
            stock: true,
            stockReservado: true
        }
    });

    const totalProductosActivos = productos.length;
    const totalProductosStockBajo = productos.filter(
        (producto) => calcularStockDisponible(producto) <= umbral
    ).length;
    const totalProductosSinStockBajo = totalProductosActivos - totalProductosStockBajo;

    return {
        umbralStockBajo: umbral,
        totalProductosActivos,
        totalProductosStockBajo,
        totalProductosSinStockBajo,
        porcentajeAfectado: totalProductosActivos === 0
            ? null
            : Math.round((totalProductosStockBajo / totalProductosActivos) * 100)
    };
}

async function listarHistorialMovimientos(filtros) {
    const { skip, take, page, limit } = calcularPaginacion(filtros.page, filtros.limit);
    const { productoId, tipo, motivo, desde, hasta } = filtros;

    const where = {
        ...(productoId && { productoId }),
        ...(tipo && { tipo }),
        ...(motivo && { motivo }),
        ...((desde || hasta) && {
            creadoEn: {
                ...(desde && { gte: desde }),
                ...(hasta && { lte: hasta })
            }
        })
    };

    const [movimientos, total] = await prisma.$transaction([
        prisma.movimientoStock.findMany({
            where,
            include: { producto: true },
            orderBy: { creadoEn: "desc" },
            skip: skip,
            take: take
        }),
        prisma.movimientoStock.count({ where })
    ]);

    return {
        data: movimientos,
        total,
        page,
        limit
    };
}

async function ajustarStock(productoId, datos) {
    return registrarMovimiento({
        productoId,
        tipo: datos.tipo,
        motivo: "AJUSTE_MANUAL",
        cantidad: datos.cantidad,
        referenciaId: datos.referenciaId
    });
}

async function listarMovimientosPorProducto(productoId) {
    const movimientos = await prisma.movimientoStock.findMany({
        where: { productoId: productoId },
        orderBy: { creadoEn: "desc" }
    });
    return movimientos;
}

module.exports = {
    registrarMovimiento,
    listarMovimientos,
    listarStock,
    listarStockParaReporte,
    obtenerResumenStockBajo,
    obtenerResumenInventario,
    obtenerVistaPreviaStockBajo,
    listarHistorialMovimientos,
    listarMovimientosPorProducto,
    ajustarStock
};
