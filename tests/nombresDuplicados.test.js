require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/config/prisma");
const clasificacionService = require("../src/services/clasificacionService");
const productoService = require("../src/services/productoService");
const promocionService = require("../src/services/promocionService");

// Los nombres visibles no deben poder duplicarse cambiando mayusculas,
// minusculas o espacios (por ejemplo "Bebidas" y "bebidas").
describe("Nombres duplicados sin distinguir mayusculas", () => {
    let marca;
    const categoriasCreadas = [];
    const tiposCreados = [];
    const productosCreados = [];
    const promocionesCreadas = [];

    async function crearCategoria(nombre) {
        const categoria = await prisma.categoria.create({ data: { nombre } });
        categoriasCreadas.push(categoria.id);
        return categoria;
    }

    async function crearTipoProducto(nombre) {
        const tipo = await prisma.tipoProducto.create({ data: { nombre } });
        tiposCreados.push(tipo.id);
        return tipo;
    }

    async function crearProducto(nombre, categoriaId, tipoProductoId) {
        const producto = await productoService.crearProducto({
            nombre,
            descripcion: "Producto de prueba",
            precio: 1000,
            stock: 5,
            categoriaId,
            tipoProductoId
        });
        productosCreados.push(producto.id);
        return producto;
    }

    function esConflicto(error) {
        return error.codigoEstado === 409 && /Ya existe/.test(error.message);
    }

    before(() => {
        marca = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
    });

    after(async () => {
        await prisma.promocion.deleteMany({ where: { id: { in: promocionesCreadas } } });
        await prisma.producto.deleteMany({ where: { id: { in: productosCreados } } });
        await prisma.categoria.deleteMany({ where: { id: { in: categoriasCreadas } } });
        await prisma.tipoProducto.deleteMany({ where: { id: { in: tiposCreados } } });
    });

    test("una categoria no se puede repetir cambiando mayusculas o espacios", async () => {
        const categoria = await crearCategoria("Bebidas " + marca);

        await assert.rejects(
            () => clasificacionService.crear("categoria", "bebidas " + marca),
            esConflicto
        );
        await assert.rejects(
            () => clasificacionService.crear("categoria", "  BEBIDAS   " + marca + "  "),
            esConflicto
        );

        const otra = await crearCategoria("Otra " + marca);
        await assert.rejects(
            () => clasificacionService.actualizar("categoria", otra.id, "bebidas " + marca),
            esConflicto
        );

        // El mismo registro si puede cambiar solo la capitalizacion de su nombre.
        const renombrada = await clasificacionService.actualizar(
            "categoria",
            categoria.id,
            "BEBIDAS " + marca
        );
        assert.equal(renombrada.nombre, "BEBIDAS " + marca);
    });

    test("un tipo de producto no se puede repetir cambiando mayusculas", async () => {
        const tipo = await crearTipoProducto("Almacen " + marca);
        assert.equal(tipo.nombre, "Almacen " + marca);

        await assert.rejects(
            () => clasificacionService.crear("tipoProducto", "almacen " + marca),
            esConflicto
        );
        await assert.rejects(
            () => clasificacionService.crear("tipoProducto", "ALMACEN " + marca),
            esConflicto
        );
    });

    test("un producto activo no se puede repetir cambiando mayusculas o espacios", async () => {
        const categoria = await crearCategoria("Productos " + marca);
        const tipo = await crearTipoProducto("Tipo " + marca);
        const producto = await crearProducto("Gaseosa " + marca, categoria.id, tipo.id);

        await assert.rejects(
            () => crearProducto("gaseosa " + marca, categoria.id, tipo.id),
            esConflicto
        );
        await assert.rejects(
            () => crearProducto("  GASEOSA   " + marca + " ", categoria.id, tipo.id),
            esConflicto
        );

        const otro = await crearProducto("Agua " + marca, categoria.id, tipo.id);
        await assert.rejects(
            () => productoService.actualizarProducto(otro.id, { nombre: "gaseosa " + marca }),
            esConflicto
        );

        // El mismo producto si puede cambiar solo la capitalizacion.
        const renombrado = await productoService.actualizarProducto(producto.id, {
            nombre: "GASEOSA " + marca
        });
        assert.equal(renombrado.nombre, "GASEOSA " + marca);
    });

    test("las categorias de una promocion se normalizan y no se repiten", async () => {
        const categoria = await crearCategoria("Promo Bebidas " + marca);
        const tipo = await crearTipoProducto("Tipo promo dup " + marca);
        const producto = await crearProducto("Lata promo dup " + marca, categoria.id, tipo.id);

        const promocion = await promocionService.crearPromocion({
            titulo: "Promo duplicada " + marca,
            tipoDescuento: "PORCENTAJE",
            valorDescuento: 10,
            fechaInicio: new Date(Date.now() - 60 * 60 * 1000),
            fechaFin: new Date(Date.now() + 60 * 60 * 1000),
            activo: true,
            productoIds: [producto.id, producto.id],
            categorias: [
                "promo bebidas " + marca,
                "  PROMO BEBIDAS   " + marca + " ",
                "Promo Bebidas " + marca
            ]
        });
        promocionesCreadas.push(promocion.id);

        // Se guarda una sola vez, con la grafia de la categoria existente.
        assert.deepEqual(
            promocion.categorias.map((item) => item.categoria),
            ["Promo Bebidas " + marca]
        );
        // El producto repetido tampoco genera filas duplicadas.
        assert.deepEqual(
            promocion.productos.map((item) => item.producto.id),
            [producto.id]
        );

        // La edicion aplica la misma normalizacion.
        const editada = await promocionService.actualizarPromocion(promocion.id, {
            productoIds: [producto.id, producto.id],
            categorias: ["PROMO BEBIDAS " + marca, "promo bebidas " + marca]
        });
        assert.deepEqual(
            editada.categorias.map((item) => item.categoria),
            ["Promo Bebidas " + marca]
        );
        assert.deepEqual(
            editada.productos.map((item) => item.producto.id),
            [producto.id]
        );
    });

    test("las promociones por categoria se aplican sin distinguir mayusculas", async () => {
        const categoria = await crearCategoria("Bebidas " + marca);
        const tipo = await crearTipoProducto("Tipo promo " + marca);
        const producto = await crearProducto("Lata " + marca, categoria.id, tipo.id);

        const promocion = await prisma.promocion.create({
            data: {
                titulo: "Promo categoria " + marca,
                tipoDescuento: "PORCENTAJE",
                valorDescuento: 10,
                fechaInicio: new Date(Date.now() - 60 * 60 * 1000),
                fechaFin: new Date(Date.now() + 60 * 60 * 1000),
                activo: true,
                categorias: { create: [{ categoria: ("bebidas " + marca) }] }
            }
        });
        promocionesCreadas.push(promocion.id);

        const resultado = await promocionService.calcularPrecioPromocional(prisma, {
            id: producto.id,
            categoria: "BEBIDAS " + marca,
            precio: 1000
        });

        assert.equal(resultado.promocion?.id, promocion.id);
        assert.equal(resultado.promocion?.titulo, "Promo categoria " + marca);
    });
});
