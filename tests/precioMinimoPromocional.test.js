const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const {
    calcularPrecioPromocional,
    calcularPrecioPromocionalEnCentavos,
    validarPromocionContraMinimo
} = require("../src/services/promocionService");
const { registrarVentaSchema } = require("../src/schemas/ventaSchema");

describe("Precio mínimo promocional", () => {
    const precioMinimoOriginal = process.env.PRECIO_MINIMO_PROMOCIONAL;
    after(() => {
        if (precioMinimoOriginal === undefined) delete process.env.PRECIO_MINIMO_PROMOCIONAL;
        else process.env.PRECIO_MINIMO_PROMOCIONAL = precioMinimoOriginal;
    });

    test("calcula porcentajes con precisión de centavos y permite precios mayores o iguales al mínimo", () => {
        assert.deepEqual(
            calcularPrecioPromocionalEnCentavos("150.00", promocion("PORCENTAJE", "20")),
            { precioOriginal: 15000, precioFinal: 12000 }
        );
        assert.deepEqual(
            calcularPrecioPromocionalEnCentavos("125.00", promocion("PORCENTAJE", "20")),
            { precioOriginal: 12500, precioFinal: 10000 }
        );
    });

    test("rechaza porcentajes del 100%, productos baratos e importes fijos que cruzan el mínimo", async () => {
        process.env.PRECIO_MINIMO_PROMOCIONAL = "100.00";
        const casos = [
            { producto: { id: "p1", nombre: "Producto", precio: "150.00" }, descuento: promocion("PORCENTAJE", "100") },
            { producto: { id: "p2", nombre: "Producto económico", precio: "99.99" }, descuento: promocion("PORCENTAJE", "1") },
            { producto: { id: "p3", nombre: "Producto", precio: "120.00" }, descuento: promocion("IMPORTE", "20.01") }
        ];

        for (const caso of casos) {
            const resultado = await calcularPrecioPromocional(
                { promocion: { findMany: async () => [caso.descuento] } },
                caso.producto
            );
            assert.equal(resultado.precioFinal, Number(caso.producto.precio));
            assert.equal(resultado.promocion, null);
            assert.ok(resultado.promocionNoAplicable);
            assert.match(resultado.promocionNoAplicable.mensaje, /La acción no se puede realizar/);
        }
    });

    test("rechaza al guardar una promoción cuando un producto alcanzado queda bajo el mínimo", async () => {
        process.env.PRECIO_MINIMO_PROMOCIONAL = "100.00";
        let consulta;
        const db = {
            producto: {
                findMany: async (args) => {
                    consulta = args;
                    return [{ id: "p1", nombre: "Producto", precio: "150.00" }];
                }
            }
        };

        await assert.rejects(
            validarPromocionContraMinimo({
                activo: true,
                tipoDescuento: "PORCENTAJE",
                valorDescuento: 50,
                productoIds: ["p1"],
                categorias: []
            }, db),
            { codigoEstado: 400, message: /La acción no se puede realizar.*75,00.*100,00/ }
        );
        assert.deepEqual(consulta.where.OR, [{ id: { in: ["p1"] } }]);
    });

    test("permite guardar una promoción cuyo precio final coincide con el mínimo", async () => {
        process.env.PRECIO_MINIMO_PROMOCIONAL = "100.00";
        await assert.doesNotReject(validarPromocionContraMinimo({
            activo: true,
            tipoDescuento: "PORCENTAJE",
            valorDescuento: 20,
            productoIds: ["p1"],
            categorias: []
        }, {
            producto: {
                findMany: async () => [{ id: "p1", nombre: "Producto", precio: "125.00" }]
            }
        }));
    });

    test("selecciona la promoción individual más beneficiosa sin acumular descuentos", async () => {
        process.env.PRECIO_MINIMO_PROMOCIONAL = "100.00";
        const promociones = [
            { ...promocion("PORCENTAJE", "20"), id: "a", titulo: "20%" },
            { ...promocion("IMPORTE", "10"), id: "b", titulo: "Descuento fijo" }
        ];
        const resultado = await calcularPrecioPromocional(
            { promocion: { findMany: async () => promociones } },
            { id: "p1", nombre: "Producto", precio: "150.00" }
        );

        assert.equal(resultado.precioFinal, 120);
        assert.equal(resultado.descuentoAplicado, 30);
        assert.equal(resultado.promocion.id, "a");
        assert.equal(resultado.promocionNoAplicable, null);
    });

    test("calcula correctamente productos distintos del mismo carrito con promociones distintas", async () => {
        process.env.PRECIO_MINIMO_PROMOCIONAL = "100.00";
        const promocionesPorProducto = {
            p1: [promocion("IMPORTE", "50")],
            p2: [promocion("PORCENTAJE", "25")]
        };
        const db = {
            promocion: {
                findMany: async ({ where }) => {
                    const productoId = where.OR[0].productos.some.productoId;
                    return promocionesPorProducto[productoId];
                }
            }
        };

        const precios = await Promise.all([
            calcularPrecioPromocional(db, { id: "p1", nombre: "Producto uno", precio: "200.00" }),
            calcularPrecioPromocional(db, { id: "p2", nombre: "Producto dos", precio: "300.00" })
        ]);

        assert.deepEqual(precios.map((item) => item.precioFinal), [150, 225]);
        assert.equal(precios.reduce((total, item) => total + Math.round(item.precioFinal * 100), 0), 37500);
    });

    test("un producto sin promoción conserva el precio regular y no se marca como inválido", async () => {
        process.env.PRECIO_MINIMO_PROMOCIONAL = "100.00";
        const resultado = await calcularPrecioPromocional(
            { promocion: { findMany: async () => [] } },
            { id: "p1", nombre: "Producto", precio: "50.00" }
        );

        assert.equal(resultado.precioFinal, 50);
        assert.equal(resultado.promocionNoAplicable, null);
    });

    test("el checkout descarta los precios manipulados y solo acepta producto y cantidad", () => {
        const resultado = registrarVentaSchema.safeParse({
            items: [{ productoId: "00000000-0000-4000-8000-000000000001", cantidad: 1, precio: 0, precioUnitario: 0 }],
            precio: 0,
            total: 0
        });

        assert.equal(resultado.success, true);
        assert.deepEqual(resultado.data.items, [
            { productoId: "00000000-0000-4000-8000-000000000001", cantidad: 1 }
        ]);
        assert.equal("total" in resultado.data, false);
    });
});

function promocion(tipoDescuento, valorDescuento) {
    return {
        id: "promo",
        titulo: "Descuento de prueba",
        tipoDescuento,
        valorDescuento
    };
}
