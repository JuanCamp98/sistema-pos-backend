const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

let ventaActual;
const movimientos = [];
const actualizacionesStock = [];
let ultimaActualizacionVenta;

const transaccion = {
    venta: {
        findUnique: async () => ventaActual,
        update: async ({ data }) => {
            ultimaActualizacionVenta = data;
            return { ...ventaActual, ...data, usuario: { email: "cajero@example.com" } };
        }
    },
    producto: {
        findUnique: async () => ({ nombre: "Producto", stock: 10 }),
        update: async (datos) => actualizacionesStock.push(datos)
    },
    movimientoStock: {
        create: async (datos) => movimientos.push(datos)
    }
};

const prismaFalso = {
    $transaction: async (callback) => callback(transaccion)
};
const correoFalso = {
    enviarComprobanteVenta: async () => ({ enviado: true })
};
const servicioQrFalso = {};

function reemplazarModulo(ruta, exports) {
    const id = require.resolve(ruta);
    const modulo = new Module(id, module);
    modulo.filename = id;
    modulo.loaded = true;
    modulo.exports = exports;
    require.cache[id] = modulo;
}

reemplazarModulo("../src/config/prisma", prismaFalso);
reemplazarModulo("../src/services/mailService", correoFalso);
reemplazarModulo("../src/services/mercadoPagoQrService", servicioQrFalso);

const ventaService = require("../src/services/ventaService");
const ventaController = require("../src/controllers/ventaController");
const cobrarVentaSchema = require("../src/schemas/ventaSchema").cobrarVentaSchema;

function prepararVenta(overrides = {}) {
    ventaActual = {
        id: "venta-1",
        total: "8500.00",
        estado: "PENDIENTE",
        mpOrderId: null,
        detalles: [{ productoId: "producto-1", cantidad: 1 }],
        ...overrides
    };
    movimientos.length = 0;
    actualizacionesStock.length = 0;
    ultimaActualizacionVenta = undefined;
}

function assertErrorEstado(error, status, mensaje) {
    assert.equal(error.message, mensaje);
    assert.equal(error.codigoEstado || error.status, status);
    return true;
}

test("el schema exige un importe positivo para efectivo y conserva MercadoPago", () => {
    assert.equal(cobrarVentaSchema.safeParse({ metodoPago: "Efectivo", efectivoRecibido: 8500 }).success, true);
    assert.equal(cobrarVentaSchema.safeParse({ metodoPago: "Efectivo" }).success, false);
    assert.equal(cobrarVentaSchema.safeParse({ metodoPago: "Efectivo", efectivoRecibido: -1 }).success, false);
    assert.equal(cobrarVentaSchema.safeParse({ metodoPago: "Efectivo", efectivoRecibido: "10000" }).success, false);
    assert.equal(cobrarVentaSchema.safeParse({ metodoPago: "MercadoPago" }).success, true);
});

test("efectivo exacto devuelve cambio cero y descuenta stock una vez", async () => {
    prepararVenta();
    const resultado = await ventaService.cobrarVenta("venta-1", "Efectivo", 8500);

    assert.equal(resultado.cambio, 0);
    assert.equal(ultimaActualizacionVenta.estado, "COBRADA");
    assert.equal(movimientos.length, 1);
    assert.equal(actualizacionesStock.length, 1);
});

test("efectivo mayor calcula el cambio con decimales exactos", async () => {
    prepararVenta({ total: "8500.25" });
    const resultado = await ventaService.cobrarVenta("venta-1", "Efectivo", 10000.5);

    assert.equal(resultado.cambio, 1500.25);
    assert.equal(movimientos.length, 1);
});

test("efectivo insuficiente se rechaza antes de modificar stock", async () => {
    prepararVenta();

    await assert.rejects(
        ventaService.cobrarVenta("venta-1", "Efectivo", 8000),
        (error) => assertErrorEstado(error, 400, "El efectivo recibido es insuficiente")
    );
    assert.equal(movimientos.length, 0);
    assert.equal(actualizacionesStock.length, 0);
});

test("el service rechaza efectivo vacío y negativo", async () => {
    prepararVenta();
    await assert.rejects(
        ventaService.cobrarVenta("venta-1", "Efectivo", undefined),
        (error) => assertErrorEstado(error, 400, "El efectivo recibido debe ser un numero mayor a 0")
    );

    prepararVenta();
    await assert.rejects(
        ventaService.cobrarVenta("venta-1", "Efectivo", -1),
        (error) => assertErrorEstado(error, 400, "El efectivo recibido debe ser un numero mayor a 0")
    );

    prepararVenta();
    await assert.rejects(
        ventaService.cobrarVenta("venta-1", "Efectivo", "10000"),
        (error) => assertErrorEstado(error, 400, "El efectivo recibido debe ser un numero mayor a 0")
    );
    assert.equal(movimientos.length, 0);
});

test("MercadoPago mantiene el cobro existente sin campo cambio", async () => {
    prepararVenta();
    const resultado = await ventaService.cobrarVenta("venta-1", "MercadoPago");

    assert.equal(Object.hasOwn(resultado, "cambio"), false);
    assert.equal(ultimaActualizacionVenta.metodoPago, "MercadoPago");
    assert.equal(movimientos.length, 1);
});

test("una venta con mpOrderId no admite cobro manual", async () => {
    prepararVenta({ mpOrderId: "order-123" });

    await assert.rejects(
        ventaService.cobrarVenta("venta-1", "Efectivo", 10000),
        (error) => assertErrorEstado(error, 409, "Esta venta debe confirmarse con el estado de Mercado Pago")
    );
    assert.equal(movimientos.length, 0);
    assert.equal(actualizacionesStock.length, 0);
});

test("el controller conserva la respuesta y agrega el cambio calculado", async () => {
    const cobrarVentaOriginal = ventaService.cobrarVenta;
    ventaService.cobrarVenta = async (ventaId, metodoPago, efectivoRecibido) => {
        assert.equal(ventaId, "venta-1");
        assert.equal(metodoPago, "Efectivo");
        assert.equal(efectivoRecibido, 10000);
        return { venta: { id: ventaId }, correo: { enviado: true }, cambio: 1500 };
    };

    let respuesta;
    try {
        await ventaController.cobrar(
            { params: { id: "venta-1" }, body: { metodoPago: "Efectivo", efectivoRecibido: 10000 } },
            {
                status: (codigo) => ({
                    json: (datos) => { respuesta = { codigo, datos }; }
                })
            },
            (error) => { throw error; }
        );
    } finally {
        ventaService.cobrarVenta = cobrarVentaOriginal;
    }

    assert.deepEqual(respuesta, {
        codigo: 200,
        datos: {
            mensaje: "Venta cobrada correctamente",
            venta: { id: "venta-1" },
            correo: { enviado: true },
            cambio: 1500
        }
    });
});
