require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const ventaService = require("../src/services/ventaService");
const movimientoStockService = require("../src/services/movimientoStockService");
const mailService = require("../src/services/mailService");
const nodemailer = require("nodemailer");
const {
    limitarPeticiones,
    limpiarRegistros,
    cantidadRegistros,
    MAX_REGISTROS
} = require("../src/middlewares/limitarPeticiones");
const { ventaDirectaSchema, listarVentasQuerySchema } = require("../src/schemas/ventaSchema");
const {
    obtenerErroresConfiguracion,
    obtenerAdvertenciasConfiguracion
} = require("../src/utils/configuracion");
const { firmarWebhook } = require("./helpers/webhookMercadoPago");

// Cubre los 12 hallazgos adicionales de la auditoria:
// 1. sobreventa concurrente, 2. expiracion de ventas anonimas, 3. revocacion JWT,
// 4. rate limiting, 5. firma de webhook, 7. politica de contrasenas,
// 8. re-autenticacion al cambiar email, 9. stock atomico, 11. login 401.
describe("Endurecimiento adicional de seguridad", () => {
    let server;
    let baseUrl;
    let rolAdministrador;
    let rolCliente;
    let marca;
    let categoria;
    let tipoProducto;
    const usuariosCreados = [];
    const ventasCreadas = [];
    const productosCreados = [];

    async function solicitar(ruta, opciones = {}) {
        const respuesta = await fetch(baseUrl + ruta, {
            method: opciones.method || "GET",
            headers: {
                ...(opciones.body ? { "Content-Type": "application/json" } : {}),
                ...(opciones.token ? { Authorization: "Bearer " + opciones.token } : {}),
                ...(opciones.headers || {})
            },
            ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {})
        });
        const texto = await respuesta.text();
        let datos = null;
        try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
        return { respuesta, datos };
    }

    async function crearUsuario(rolId, sufijo, contrasena = "clave-segura-123") {
        const usuario = await prisma.usuario.create({
            data: {
                nombre: "Extra",
                apellido: sufijo,
                dni: String(20000000 + Math.floor(Math.random() * 7000000)),
                email: `extra-${sufijo}-${marca}@pos.local`,
                contrasena: await bcrypt.hash(contrasena, 10),
                rolId
            }
        });
        usuariosCreados.push({ id: usuario.id, email: usuario.email, contrasena });
        return usuario;
    }

    async function iniciarSesion(email, contrasena) {
        const { respuesta, datos } = await solicitar("/usuarios/login", {
            method: "POST",
            body: { email, contrasena }
        });
        return { status: respuesta.status, token: datos?.token, datos };
    }

    async function crearProducto(stock = 10) {
        const producto = await prisma.producto.create({
            data: {
                nombre: "Producto Extra " + crypto.randomUUID(),
                precio: 100,
                stock,
                stockReservado: 0,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });
        productosCreados.push(producto.id);
        return producto;
    }

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = "http://127.0.0.1:" + server.address().port;
        marca = Date.now().toString().slice(-7);

        [rolAdministrador, rolCliente] = await Promise.all([
            prisma.rol.upsert({ where: { nombre: "Administrador" }, update: {}, create: { nombre: "Administrador" } }),
            prisma.rol.upsert({ where: { nombre: "Cliente" }, update: {}, create: { nombre: "Cliente" } })
        ]);
        categoria = await prisma.categoria.create({ data: { nombre: "Extra Categoria " + marca } });
        tipoProducto = await prisma.tipoProducto.create({ data: { nombre: "Extra Tipo " + marca } });
    });

    after(async () => {
        const idsVentas = ventasCreadas;
        if (idsVentas.length) {
            await prisma.movimientoStock.deleteMany({ where: { referenciaId: { in: idsVentas } } });
            await prisma.detalleVenta.deleteMany({ where: { ventaId: { in: idsVentas } } });
            await prisma.venta.deleteMany({ where: { id: { in: idsVentas } } });
        }
        if (productosCreados.length) {
            await prisma.movimientoStock.deleteMany({ where: { productoId: { in: productosCreados } } });
            await prisma.producto.deleteMany({ where: { id: { in: productosCreados } } });
        }
        for (const usuario of usuariosCreados) {
            await prisma.usuario.delete({ where: { id: usuario.id } }).catch(function () {});
        }
        if (categoria) await prisma.categoria.delete({ where: { id: categoria.id } }).catch(function () {});
        if (tipoProducto) await prisma.tipoProducto.delete({ where: { id: tipoProducto.id } }).catch(function () {});
        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await prisma.$disconnect();
    });

    test("3. un token con version desactualizada se rechaza y el nuevo login vuelve a funcionar", async () => {
        const usuario = await crearUsuario(rolCliente.id, "tv");
        const primero = await iniciarSesion(usuario.email, "clave-segura-123");
        assert.equal(primero.status, 200);

        const antes = await solicitar("/usuarios/perfil", { token: primero.token });
        assert.equal(antes.respuesta.status, 200);

        // Simula un cambio de contrasena o una revocacion explicita.
        await prisma.usuario.update({
            where: { id: usuario.id },
            data: { tokenVersion: { increment: 1 } }
        });

        const revocado = await solicitar("/usuarios/perfil", { token: primero.token });
        assert.equal(revocado.respuesta.status, 401);

        const segundo = await iniciarSesion(usuario.email, "clave-segura-123");
        assert.equal(segundo.status, 200);
        const despues = await solicitar("/usuarios/perfil", { token: segundo.token });
        assert.equal(despues.respuesta.status, 200);
    });

    test("3. un usuario eliminado no puede seguir usando su token", async () => {
        const usuario = await crearUsuario(rolCliente.id, "borrado");
        const sesion = await iniciarSesion(usuario.email, "clave-segura-123");
        assert.equal(sesion.status, 200);

        await prisma.usuario.delete({ where: { id: usuario.id } });
        usuariosCreados.splice(usuariosCreados.findIndex((item) => item.id === usuario.id), 1);

        const intento = await solicitar("/usuarios/perfil", { token: sesion.token });
        assert.equal(intento.respuesta.status, 401);
    });

    test("3. el rol se resuelve contra la base y no contra el claim del token", async () => {
        const usuario = await crearUsuario(rolCliente.id, "rol");
        const sesion = await iniciarSesion(usuario.email, "clave-segura-123");
        assert.equal(sesion.status, 200);

        // El token dice "Cliente"; al promoverlo en la base debe tener acceso.
        await prisma.usuario.update({
            where: { id: usuario.id },
            data: { rolId: rolAdministrador.id }
        });

        const promovido = await solicitar("/promociones", { token: sesion.token });
        assert.equal(promovido.respuesta.status, 200);
    });

    test("3. cambiar la contrasena invalida las sesiones anteriores y renueva la actual", async () => {
        const usuario = await crearUsuario(rolCliente.id, "clave");
        const sesion = await iniciarSesion(usuario.email, "clave-segura-123");
        assert.equal(sesion.status, 200);

        const cambio = await solicitar("/usuarios/cambiar-contrasena", {
            method: "PUT",
            token: sesion.token,
            body: {
                contrasenaActual: "clave-segura-123",
                contrasenaNueva: "nueva-clave-123",
                confirmarContrasena: "nueva-clave-123"
            }
        });
        assert.equal(cambio.respuesta.status, 200);
        assert.equal(typeof cambio.datos.token, "string");

        const tokenAnterior = await solicitar("/usuarios/perfil", { token: sesion.token });
        assert.equal(tokenAnterior.respuesta.status, 401);

        const tokenRenovado = await solicitar("/usuarios/perfil", { token: cambio.datos.token });
        assert.equal(tokenRenovado.respuesta.status, 200);

        assert.equal((await iniciarSesion(usuario.email, "clave-segura-123")).status, 401);
        assert.equal((await iniciarSesion(usuario.email, "nueva-clave-123")).status, 200);
    });

    test("11. el login invalido devuelve 401 y el rate limiting corta la fuerza bruta con 429", async () => {
        const email = `bruta-${marca}@pos.local`;
        for (let intento = 0; intento < 10; intento += 1) {
            const resultado = await solicitar("/usuarios/login", {
                method: "POST",
                body: { email, contrasena: "no-existe" }
            });
            assert.equal(resultado.respuesta.status, 401);
        }

        const bloqueado = await solicitar("/usuarios/login", {
            method: "POST",
            body: { email, contrasena: "no-existe" }
        });
        assert.equal(bloqueado.respuesta.status, 429);
        assert.ok(Number(bloqueado.respuesta.headers.get("retry-after")) > 0);
    });

    test("7. el registro rechaza contrasenas de menos de 8 caracteres", async () => {
        const resultado = await solicitar("/usuarios/registro", {
            method: "POST",
            body: {
                nombre: "Corta",
                apellido: "Clave",
                dni: "25111222",
                email: `corta-${marca}@pos.local`,
                contrasena: "1234567"
            }
        });
        assert.equal(resultado.respuesta.status, 400);
    });

    test("7. el registro y el cambio de contrasena rechazan claves de mas de 72 caracteres", async () => {
        const larga = "a".repeat(73);
        const registro = await solicitar("/usuarios/registro", {
            method: "POST",
            body: {
                nombre: "Larga",
                apellido: "Clave",
                dni: "25111223",
                email: `larga-${marca}@pos.local`,
                contrasena: larga
            }
        });
        assert.equal(registro.respuesta.status, 400);

        const usuario = await crearUsuario(rolCliente.id, "larga");
        const sesion = await iniciarSesion(usuario.email, "clave-segura-123");
        assert.equal(sesion.status, 200);

        const cambio = await solicitar("/usuarios/cambiar-contrasena", {
            method: "PUT",
            token: sesion.token,
            body: {
                contrasenaActual: "clave-segura-123",
                contrasenaNueva: larga,
                confirmarContrasena: larga
            }
        });
        assert.equal(cambio.respuesta.status, 400);

        const corta = await solicitar("/usuarios/cambiar-contrasena", {
            method: "PUT",
            token: sesion.token,
            body: {
                contrasenaActual: "clave-segura-123",
                contrasenaNueva: "1234567",
                confirmarContrasena: "1234567"
            }
        });
        assert.equal(corta.respuesta.status, 400);
    });

    test("6. el enlace de recuperacion lleva el token en el fragmento y no en la query", async () => {
        const entornoOriginal = {
            MAIL_HOST: process.env.MAIL_HOST,
            MAIL_USER: process.env.MAIL_USER,
            MAIL_PASS: process.env.MAIL_PASS,
            MAIL_SECURE: process.env.MAIL_SECURE,
            FRONTEND_URL: process.env.FRONTEND_URL
        };
        const crearTransporteOriginal = nodemailer.createTransport;
        let mensaje = null;

        process.env.MAIL_HOST = "smtp.test.local";
        process.env.MAIL_USER = "usuario@test.local";
        process.env.MAIL_PASS = "secreto";
        process.env.MAIL_SECURE = "false";
        process.env.FRONTEND_URL = "https://pos.example";
        nodemailer.createTransport = function () {
            return { sendMail: async function (datos) { mensaje = datos; } };
        };

        try {
            await mailService.enviarCorreoRecuperacionContrasena(
                "destino@pos.local",
                "token/secreto"
            );
        } finally {
            nodemailer.createTransport = crearTransporteOriginal;
            for (const [clave, valor] of Object.entries(entornoOriginal)) {
                if (valor === undefined) delete process.env[clave];
                else process.env[clave] = valor;
            }
        }

        assert.ok(mensaje, "se debe enviar el correo de recuperacion");
        const url = (mensaje.text.match(/https?:\/\/\S+/) || [])[0];
        assert.ok(url, "el correo debe incluir el enlace");
        assert.ok(url.includes("#token=token%2Fsecreto"));
        assert.ok(!url.includes("?token="));
    });

    test("8. cambiar el email exige la contrasena actual", async () => {
        const usuario = await crearUsuario(rolCliente.id, "email");
        const sesion = await iniciarSesion(usuario.email, "clave-segura-123");
        assert.equal(sesion.status, 200);

        const nuevoEmail = `nuevo-${marca}@pos.local`;
        const sinContrasena = await solicitar("/usuarios/perfil", {
            method: "PUT",
            token: sesion.token,
            body: { email: nuevoEmail }
        });
        assert.equal(sinContrasena.respuesta.status, 400);

        const contrasenaIncorrecta = await solicitar("/usuarios/perfil", {
            method: "PUT",
            token: sesion.token,
            body: { email: nuevoEmail, contrasenaActual: "incorrecta" }
        });
        assert.equal(contrasenaIncorrecta.respuesta.status, 400);

        const correcta = await solicitar("/usuarios/perfil", {
            method: "PUT",
            token: sesion.token,
            body: { email: nuevoEmail, contrasenaActual: "clave-segura-123" }
        });
        assert.equal(correcta.respuesta.status, 200);
        assert.equal(correcta.datos.usuario.email, nuevoEmail);
    });

    test("9. editar un producto no permite pisar el stock", async () => {
        const producto = await crearProducto(7);
        const admin = await crearUsuario(rolAdministrador.id, "prod");
        const sesion = await iniciarSesion(admin.email, "clave-segura-123");
        assert.equal(sesion.status, 200);

        const edicion = await solicitar("/productos/" + producto.id, {
            method: "PUT",
            token: sesion.token,
            headers: { "Content-Type": "application/json" },
            body: { nombre: "Nombre editado " + marca, stock: 999 }
        });
        assert.equal(edicion.respuesta.status, 200);

        const actual = await prisma.producto.findUnique({ where: { id: producto.id } });
        assert.equal(actual.stock, 7);
        assert.equal(actual.nombre, "Nombre editado " + marca);
    });

    test("9. los ajustes de stock concurrentes no pierden operaciones", async () => {
        const producto = await crearProducto(10);

        const resultados = await Promise.allSettled([
            movimientoStockService.ajustarStock(producto.id, { tipo: "SALIDA", cantidad: 8 }),
            movimientoStockService.ajustarStock(producto.id, { tipo: "SALIDA", cantidad: 8 })
        ]);

        const exitosos = resultados.filter((resultado) => resultado.status === "fulfilled").length;
        const fallidos = resultados.filter((resultado) => resultado.status === "rejected").length;
        assert.equal(exitosos, 1);
        assert.equal(fallidos, 1);

        const actual = await prisma.producto.findUnique({ where: { id: producto.id } });
        assert.equal(actual.stock, 2);
        assert.equal(actual.stockReservado, 0);
    });

    test("1. dos compras concurrentes no pueden reservar la ultima unidad", async () => {
        const producto = await crearProducto(1);

        function comprar() {
            return ventaService.registrarVenta(null, {
                items: [{ productoId: producto.id, cantidad: 1 }],
                cliente: { nombre: "Anonimo", apellido: "Concurrente" }
            }, "RAPIDA");
        }

        const resultados = await Promise.allSettled([comprar(), comprar()]);
        const exitosos = resultados.filter((resultado) => resultado.status === "fulfilled");
        assert.equal(exitosos.length, 1);
        for (const resultado of exitosos) {
            ventasCreadas.push(resultado.value.id);
        }

        const actual = await prisma.producto.findUnique({ where: { id: producto.id } });
        assert.equal(actual.stockReservado, 1);
    });

    test("2. la limpieza libera el stock de compras anonimas vencidas", async () => {
        const producto = await crearProducto(5);
        const venta = await prisma.venta.create({
            data: {
                usuarioId: null,
                codigoComprobante: "V-EXTRA-" + crypto.randomUUID(),
                tokenAcceso: crypto.randomBytes(32).toString("hex"),
                estado: "PENDIENTE",
                origen: "RAPIDA",
                total: 100,
                creadoEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
                detalles: {
                    create: [{ productoId: producto.id, cantidad: 2, precioUnitario: 50, subtotal: 100 }]
                }
            }
        });
        ventasCreadas.push(venta.id);
        await prisma.producto.update({
            where: { id: producto.id },
            data: { stockReservado: { increment: 2 } }
        });

        const canceladas = await ventaService.cancelarVentasPendientesExpiradas({ limiteMinutos: 60 });
        assert.ok(canceladas >= 1);

        const actual = await prisma.venta.findUnique({ where: { id: venta.id } });
        assert.equal(actual.estado, "CANCELADA");
        const productoActual = await prisma.producto.findUnique({ where: { id: producto.id } });
        assert.equal(productoActual.stockReservado, 0);
    });

    test("5. el webhook exige firma valida cuando MP_WEBHOOK_SECRET esta configurado", async () => {
        const ruta = "/ventas/webhook/mercadopago?data.id=orden_sin_firma";
        const sinFirma = await solicitar(ruta, { method: "POST" });
        assert.equal(sinFirma.respuesta.status, 401);

        const firmaInvalida = await solicitar(ruta, {
            method: "POST",
            headers: {
                "x-signature": "ts=" + Math.floor(Date.now() / 1000) + ",v1=invalida",
                "x-request-id": crypto.randomUUID()
            }
        });
        assert.equal(firmaInvalida.respuesta.status, 401);

        const firmaValida = firmarWebhook(new URL(ruta, baseUrl));
        const valida = await solicitar(ruta, { method: "POST", headers: firmaValida });
        // La orden no existe localmente: el webhook se acepta sin efectos.
        assert.equal(valida.respuesta.status, 200);
    });

    test("12. la API no revela la tecnologia del servidor ni permite origenes no configurados", async () => {
        const respuesta = await fetch(baseUrl + "/");
        assert.equal(respuesta.headers.get("x-powered-by"), null);
        assert.equal(respuesta.headers.get("x-content-type-options"), "nosniff");
        assert.equal(respuesta.headers.get("x-frame-options"), "DENY");
        assert.equal(respuesta.headers.get("referrer-policy"), "no-referrer");

        const preflight = await fetch(baseUrl + "/productos", {
            method: "OPTIONS",
            headers: {
                Origin: "https://sitio-malicioso.example",
                "Access-Control-Request-Method": "GET"
            }
        });
        assert.equal(preflight.headers.get("access-control-allow-origin"), null);
    });

    test("4. el limitador cuenta por clave, devuelve 429 y omite las claves vacias", () => {
        limpiarRegistros();
        const middleware = limitarPeticiones({
            limite: 2,
            ventanaMs: 60 * 1000,
            clave: function (req) { return req.clave; }
        });

        function llamar(clave) {
            let error = null;
            let paso = false;
            middleware(
                { clave: clave, ip: "127.0.0.1" },
                { set: function () {} },
                function (posibleError) {
                    if (posibleError) error = posibleError;
                    else paso = true;
                }
            );
            return { error: error, paso: paso };
        }

        assert.equal(llamar(null).paso, true);
        assert.equal(llamar(null).paso, true);
        assert.equal(llamar("destino@pos.local").paso, true);
        assert.equal(llamar("destino@pos.local").paso, true);

        const bloqueado = llamar("destino@pos.local");
        assert.equal(bloqueado.paso, false);
        assert.equal(bloqueado.error.codigoEstado, 429);
        limpiarRegistros();
    });

    test("4. el limitador acota la cantidad de claves que guarda en memoria", () => {
        limpiarRegistros();
        const middleware = limitarPeticiones({
            limite: 5,
            ventanaMs: 60 * 1000,
            clave: function (req) { return req.clave; }
        });

        for (let indice = 0; indice < MAX_REGISTROS + 50; indice += 1) {
            middleware(
                { clave: "clave-" + indice, ip: "127.0.0.1" },
                { set: function () {} },
                function () {}
            );
        }

        assert.equal(cantidadRegistros(), MAX_REGISTROS);
        limpiarRegistros();
    });

    test("el registro valida el formato del DNI y acota la longitud de los campos", async () => {
        const contrasena = "clave-segura-123";
        const dni = String(30000000 + Math.floor(Math.random() * 60000000));

        const dniInvalido = await solicitar("/usuarios/registro", {
            method: "POST",
            body: {
                nombre: "Valida",
                apellido: "Campos",
                dni: "ABC123",
                email: `invalido-${crypto.randomUUID()}@pos.local`,
                contrasena
            }
        });
        assert.equal(dniInvalido.respuesta.status, 400);

        const nombreLargo = await solicitar("/usuarios/registro", {
            method: "POST",
            body: {
                nombre: "a".repeat(101),
                apellido: "Campos",
                dni,
                email: `largo-${crypto.randomUUID()}@pos.local`,
                contrasena
            }
        });
        assert.equal(nombreLargo.respuesta.status, 400);
    });

    test("el registro normaliza el email y evita duplicados por mayusculas", async () => {
        const contrasena = "clave-segura-123";
        const email = `Mayus-${marca}-${crypto.randomUUID().slice(0, 6)}@POS.Local`;
        const dni = String(30000000 + Math.floor(Math.random() * 60000000));

        const registro = await solicitar("/usuarios/registro", {
            method: "POST",
            body: { nombre: "Mayus", apellido: "Email", dni, email, contrasena }
        });
        assert.equal(registro.respuesta.status, 201);
        assert.equal(registro.datos.usuario.email, email.toLowerCase());
        usuariosCreados.push({
            id: registro.datos.usuario.id,
            email: email.toLowerCase(),
            contrasena
        });

        const sesion = await iniciarSesion(email.toUpperCase(), contrasena);
        assert.equal(sesion.status, 200);

        const duplicado = await solicitar("/usuarios/registro", {
            method: "POST",
            body: {
                nombre: "Mayus",
                apellido: "Email",
                dni: String(Number(dni) + 1),
                email: email.toLowerCase(),
                contrasena
            }
        });
        assert.equal(duplicado.respuesta.status, 409);
    });

    test("los esquemas de venta acotan items, cantidades y paginacion", () => {
        const productoId = crypto.randomUUID();
        const demasiadosItems = Array.from(
            { length: 101 },
            () => ({ productoId: crypto.randomUUID(), cantidad: 1 })
        );

        assert.equal(ventaDirectaSchema.safeParse({ items: demasiadosItems }).success, false);
        assert.equal(ventaDirectaSchema.safeParse({
            items: [{ productoId, cantidad: 10000 }]
        }).success, false);
        assert.equal(ventaDirectaSchema.safeParse({
            items: [{ productoId, cantidad: 1 }]
        }).success, true);

        assert.equal(listarVentasQuerySchema.safeParse({ limite: 101 }).success, false);
        assert.equal(listarVentasQuerySchema.safeParse({ limit: 100 }).success, true);
    });

    test("4. el rate limiting no se puede desactivar por variable de entorno en produccion", () => {
        const entornoAnterior = process.env.NODE_ENV;
        const flagAnterior = process.env.RATE_LIMIT_DISABLED;

        process.env.NODE_ENV = "production";
        process.env.RATE_LIMIT_DISABLED = "true";
        try {
            limpiarRegistros();
            const middleware = limitarPeticiones({
                limite: 1,
                ventanaMs: 60 * 1000,
                clave: function () { return "produccion"; }
            });

            middleware({ ip: "127.0.0.1" }, { set: function () {} }, function () {});
            let error = null;
            middleware({ ip: "127.0.0.1" }, { set: function () {} }, function (posibleError) {
                error = posibleError;
            });

            assert.equal(error.codigoEstado, 429);
        } finally {
            if (entornoAnterior === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = entornoAnterior;
            if (flagAnterior === undefined) delete process.env.RATE_LIMIT_DISABLED;
            else process.env.RATE_LIMIT_DISABLED = flagAnterior;
            limpiarRegistros();
        }
    });

    test("la configuracion de produccion exige un JWT_SECRET robusto", () => {
        assert.deepEqual(obtenerErroresConfiguracion({ NODE_ENV: "development" }), []);
        assert.equal(obtenerErroresConfiguracion({ NODE_ENV: "production" }).length, 1);
        assert.equal(
            obtenerErroresConfiguracion({ NODE_ENV: "production", JWT_SECRET: "corto" }).length,
            1
        );
        assert.deepEqual(
            obtenerErroresConfiguracion({
                NODE_ENV: "production",
                JWT_SECRET: "x".repeat(32)
            }),
            []
        );

        assert.equal(
            obtenerAdvertenciasConfiguracion({ NODE_ENV: "production" }).length,
            2
        );
        assert.deepEqual(
            obtenerAdvertenciasConfiguracion({
                NODE_ENV: "production",
                MP_WEBHOOK_SECRET: "secreto",
                CORS_ORIGINS: "https://pos.example"
            }),
            []
        );
        assert.deepEqual(obtenerAdvertenciasConfiguracion({ NODE_ENV: "development" }), []);
    });
});
