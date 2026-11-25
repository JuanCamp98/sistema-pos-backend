require("dotenv/config");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const prisma = require("../src/config/prisma");
const mailService = require("../src/services/mailService");

let server;
let usuarioId;
let tokenEnviado;
const enviarCorreoOriginal = mailService.enviarCorreoRecuperacionContrasena;

after(async () => {
    mailService.enviarCorreoRecuperacionContrasena = enviarCorreoOriginal;
    try {
        if (usuarioId) {
            await prisma.recuperacionContrasena.deleteMany({ where: { usuarioId } });
            await prisma.usuario.deleteMany({ where: { id: usuarioId } });
        }
    } finally {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => error ? reject(error) : resolve());
                server.closeAllConnections();
            });
        }
        await prisma.$disconnect();
    }
});

test("la recuperación usa tokens de un solo uso y no revela si existe el email", async () => {
    const rol = await prisma.rol.upsert({
        where: { nombre: "Cliente" },
        update: {},
        create: { nombre: "Cliente" }
    });
    const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `recuperacion_${sufijo}@pos.local`;
    const contrasenaAnterior = "clave-anterior";
    const usuario = await prisma.usuario.create({
        data: {
            nombre: "Cliente",
            apellido: "Recuperación",
            dni: `REC-${sufijo}`,
            email,
            contrasena: await bcrypt.hash(contrasenaAnterior, 10),
            rolId: rol.id
        }
    });
    usuarioId = usuario.id;

    mailService.enviarCorreoRecuperacionContrasena = async (destinatario, token) => {
        assert.equal(destinatario, email);
        tokenEnviado = token;
    };

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function solicitar(correo) {
        return fetch(`${baseUrl}/usuarios/solicitar-recuperacion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: correo })
        });
    }

    async function restablecer(token, contrasena) {
        return fetch(`${baseUrl}/usuarios/restablecer-contrasena`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, contrasena })
        });
    }

    const solicitudInexistente = await solicitar(`inexistente_${sufijo}@pos.local`);
    const solicitudExistente = await solicitar(email);
    assert.equal(solicitudInexistente.status, 200);
    assert.equal(solicitudExistente.status, 200);
    assert.deepEqual(await solicitudExistente.json(), await solicitudInexistente.json());
    assert.equal(typeof tokenEnviado, "string");

    const tokenHash = crypto.createHash("sha256").update(tokenEnviado).digest("hex");
    const recuperacion = await prisma.recuperacionContrasena.findUnique({
        where: { tokenHash }
    });
    assert.ok(recuperacion);
    assert.notEqual(recuperacion.tokenHash, tokenEnviado);
    assert.ok(recuperacion.venceEn > new Date());

    const tokenInexistente = await restablecer("token-invalido", "clave-nueva");
    assert.equal(tokenInexistente.status, 400);

    const tokenVencido = `vencido-${sufijo}`;
    await prisma.recuperacionContrasena.create({
        data: {
            usuarioId,
            tokenHash: crypto.createHash("sha256").update(tokenVencido).digest("hex"),
            venceEn: new Date(Date.now() - 1000)
        }
    });
    assert.equal((await restablecer(tokenVencido, "clave-nueva")).status, 400);

    assert.equal((await restablecer(tokenEnviado, "12345")).status, 400);
    const tokenValido = await restablecer(tokenEnviado, "clave-nueva");
    assert.equal(tokenValido.status, 200);
    assert.equal(await prisma.recuperacionContrasena.findUnique({ where: { tokenHash } }), null);
    assert.equal((await restablecer(tokenEnviado, "otra-clave")).status, 400);

    const inicioSesionNuevo = await fetch(`${baseUrl}/usuarios/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, contrasena: "clave-nueva" })
    });
    const inicioSesionAnterior = await fetch(`${baseUrl}/usuarios/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, contrasena: contrasenaAnterior })
    });
    assert.equal(inicioSesionNuevo.status, 200);
    assert.notEqual(inicioSesionAnterior.status, 200);
});
