require("dotenv/config");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");
const mailService = require("../src/services/mailService");
const comprobantePdfService = require("../src/services/comprobantePdfService");
const { registrarVentaSchema } = require("../src/schemas/ventaSchema");

function extraerTextoPdf(pdf) {
    const contenido = pdf.toString("latin1");
    return Array.from(contenido.matchAll(/BT([\s\S]*?)ET/g), function (coincidencia) {
        return Array.from(coincidencia[1].matchAll(/<([a-f0-9]+)>/gi), function (texto) {
            return Buffer.from(texto[1], "hex").toString("latin1");
        }).join("");
    }).join("");
}

function crearVenta(nombrePersonalizado) {
    return {
        nombrePersonalizado,
        codigoComprobante: "V-TEST-NOMBRE",
        fecha: new Date("2026-11-09T12:00:00.000Z"),
        total: 250,
        clienteEmail: "cliente@pos.local",
        detalles: [{
            producto: { nombre: "Producto de prueba" },
            cantidad: 1,
            precioUnitario: 250,
            subtotal: 250
        }]
    };
}

test("el checkout normaliza el nombre opcional y rechaza valores vacíos o demasiado largos", () => {
    const compraBase = {
        items: [{ productoId: "00000000-0000-4000-8000-000000000001", cantidad: 1 }],
        retiro: {
            fecha: "2026-11-10",
            horaInicio: "09:00",
            horaFin: "10:00"
        }
    };
    const nombreNormalizado = registrarVentaSchema.safeParse({
        ...compraBase,
        nombrePersonalizado: "  Compra   semanal  "
    });

    assert.equal(nombreNormalizado.success, true);
    assert.equal(nombreNormalizado.data.nombrePersonalizado, "Compra semanal");
    assert.equal(registrarVentaSchema.safeParse({
        ...compraBase,
        nombrePersonalizado: "   "
    }).success, false);
    assert.equal(registrarVentaSchema.safeParse({
        ...compraBase,
        nombrePersonalizado: "x".repeat(81)
    }).success, false);
    assert.equal(registrarVentaSchema.safeParse(compraBase).success, true);
});

test("el correo del comprobante muestra el nombre personalizado y escapa HTML", async (t) => {
    const variablesOriginales = {
        MAIL_HOST: process.env.MAIL_HOST,
        MAIL_USER: process.env.MAIL_USER,
        MAIL_PASS: process.env.MAIL_PASS,
        MAIL_FROM: process.env.MAIL_FROM
    };
    const crearTransportadorOriginal = nodemailer.createTransport;
    let mensajeEnviado;

    process.env.MAIL_HOST = "smtp.test.local";
    process.env.MAIL_USER = "pos@test.local";
    process.env.MAIL_PASS = "test-password";
    process.env.MAIL_FROM = "pos@test.local";
    nodemailer.createTransport = function () {
        return {
            sendMail: async function (mensaje) {
                mensajeEnviado = mensaje;
                return { messageId: "test-message-id" };
            }
        };
    };

    t.after(function () {
        nodemailer.createTransport = crearTransportadorOriginal;
        Object.entries(variablesOriginales).forEach(function ([clave, valor]) {
            if (valor === undefined) delete process.env[clave];
            else process.env[clave] = valor;
        });
    });

    const resultado = await mailService.enviarComprobanteVenta(crearVenta("Compra <especial> & semanal"));
    assert.equal(resultado.enviado, true);
    assert.match(mensajeEnviado.text, /Nombre de compra: Compra <especial> & semanal/);
    assert.match(mensajeEnviado.html, /Nombre de compra/);
    assert.match(mensajeEnviado.html, /Compra &lt;especial&gt; &amp; semanal/);
    assert.doesNotMatch(mensajeEnviado.html, /<especial>/);
    assert.match(mensajeEnviado.html, /V-TEST-NOMBRE/);
});

test("el PDF descargable incluye el nombre personalizado sin reemplazar el código", async () => {
    const pdf = await comprobantePdfService.generarComprobantePdf(crearVenta("Compra semanal"));
    const texto = extraerTextoPdf(pdf);

    assert.ok(pdf.subarray(0, 5).toString() === "%PDF-");
    assert.match(texto, /Compra semanal/);
    assert.match(texto, /V-TEST-NOMBRE/);
});

test("los comprobantes sin nombre personalizado conservan el formato previo", async (t) => {
    const variablesOriginales = {
        MAIL_HOST: process.env.MAIL_HOST,
        MAIL_USER: process.env.MAIL_USER,
        MAIL_PASS: process.env.MAIL_PASS
    };
    const crearTransportadorOriginal = nodemailer.createTransport;
    let mensajeEnviado;

    process.env.MAIL_HOST = "smtp.test.local";
    process.env.MAIL_USER = "pos@test.local";
    process.env.MAIL_PASS = "test-password";
    nodemailer.createTransport = function () {
        return {
            sendMail: async function (mensaje) {
                mensajeEnviado = mensaje;
                return { messageId: "test-message-id" };
            }
        };
    };

    t.after(function () {
        nodemailer.createTransport = crearTransportadorOriginal;
        Object.entries(variablesOriginales).forEach(function ([clave, valor]) {
            if (valor === undefined) delete process.env[clave];
            else process.env[clave] = valor;
        });
    });

    await mailService.enviarComprobanteVenta(crearVenta(null));
    assert.doesNotMatch(mensajeEnviado.text, /Nombre de compra/);
    assert.doesNotMatch(mensajeEnviado.html, /Nombre de compra/);

    const pdf = await comprobantePdfService.generarComprobantePdf(crearVenta(null));
    assert.doesNotMatch(extraerTextoPdf(pdf), /Nombre de compra/);
    assert.match(extraerTextoPdf(pdf), /V-TEST-NOMBRE/);
});
