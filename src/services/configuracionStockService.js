const prisma = require("../config/prisma");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

const UMBRAL_STOCK_BAJO_PREDETERMINADO = 5;
const UMBRAL_STOCK_BAJO_MAXIMO = 2147483647;

function validarUmbral(umbralStockBajo) {
    if (
        !Number.isInteger(umbralStockBajo) ||
        umbralStockBajo < 0 ||
        umbralStockBajo > UMBRAL_STOCK_BAJO_MAXIMO
    ) {
        throw new ErrorPersonalizado(
            "El umbral de stock bajo debe ser un número entero mayor o igual a cero",
            400
        );
    }
    return umbralStockBajo;
}

async function obtenerConfiguracion() {
    const existente = await prisma.configuracionStock.findUnique({ where: { id: 1 } });
    if (existente) return existente;

    return prisma.configuracionStock.upsert({
        where: { id: 1 },
        create: {
            id: 1,
            umbralStockBajo: UMBRAL_STOCK_BAJO_PREDETERMINADO
        },
        update: {}
    });
}

async function obtenerUmbralStockBajo() {
    const configuracion = await obtenerConfiguracion();
    return configuracion.umbralStockBajo;
}

async function guardarConfiguracion(datos) {
    const umbralStockBajo = validarUmbral(datos?.umbralStockBajo);

    return prisma.configuracionStock.upsert({
        where: { id: 1 },
        create: {
            id: 1,
            umbralStockBajo
        },
        update: {
            umbralStockBajo
        }
    });
}

module.exports = {
    UMBRAL_STOCK_BAJO_PREDETERMINADO,
    UMBRAL_STOCK_BAJO_MAXIMO,
    validarUmbral,
    obtenerConfiguracion,
    obtenerUmbralStockBajo,
    guardarConfiguracion
};
