require("dotenv/config");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

let server;
let usuario;
let otroUsuario;

after(async () => {
    const ids = [usuario?.id, otroUsuario?.id].filter(Boolean);
    if (ids.length > 0) {
        await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    }
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
    }
    await prisma.$disconnect();
});

test("el cliente puede editar su perfil y cambiar su contraseña sin modificar otros usuarios", async () => {
    const rolCliente = await prisma.rol.upsert({
        where: { nombre: "Cliente" },
        update: {},
        create: { nombre: "Cliente" }
    });

    const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const contrasena = "clave-actual";
    const email = `perfil_${sufijo}@pos.local`;
    const dni = `66${sufijo.slice(-6)}`;

    usuario = await prisma.usuario.create({
        data: {
            nombre: "Nombre",
            apellido: "Original",
            dni,
            email,
            contrasena: await bcrypt.hash(contrasena, 10),
            rolId: rolCliente.id
        }
    });

    otroUsuario = await prisma.usuario.create({
        data: {
            nombre: "Otro",
            apellido: "Cliente",
            dni: `77${sufijo.slice(-6)}`,
            email: `otro_${sufijo}@pos.local`,
            contrasena: await bcrypt.hash("otra-clave", 10),
            rolId: rolCliente.id
        }
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function enviar(metodo, ruta, cuerpo, token) {
        return fetch(`${baseUrl}${ruta}`, {
            method: metodo,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
        });
    }

    const login = await enviar("POST", "/usuarios/login", { email, contrasena });
    assert.equal(login.status, 200);
    const token = (await login.json()).token;

    assert.equal((await enviar("PUT", "/usuarios/perfil", { nombre: "Sin token" })).status, 401);
    assert.equal((await enviar("PUT", "/usuarios/cambiar-contrasena", {
        contrasenaActual: contrasena,
        contrasenaNueva: "nueva-clave",
        confirmarContrasena: "nueva-clave"
    })).status, 401);

    // No se acepta un ID ni un rol enviados por el frontend.
    const intentoOtroUsuario = await enviar("PUT", "/usuarios/perfil", {
        id: otroUsuario.id,
        rol: "Administrador",
        nombre: "Hackeado"
    }, token);
    assert.equal(intentoOtroUsuario.status, 400);

    const otroSinCambios = await prisma.usuario.findUnique({
        where: { id: otroUsuario.id },
        select: { nombre: true, rolId: true }
    });
    assert.equal(otroSinCambios.nombre, "Otro");
    assert.equal(otroSinCambios.rolId, rolCliente.id);

    const actualizacion = await enviar("PUT", "/usuarios/perfil", {
        nombre: "Nombre Editado",
        apellido: "Apellido Editado",
        dni,
        email
    }, token);
    assert.equal(actualizacion.status, 200);
    const cuerpoActualizacion = await actualizacion.json();
    assert.equal(cuerpoActualizacion.usuario.nombre, "Nombre Editado");
    assert.equal(cuerpoActualizacion.usuario.rol, "Cliente");
    assert.equal(cuerpoActualizacion.usuario.contrasena, undefined);
    assert.equal(cuerpoActualizacion.usuario.contrasenaHash, undefined);
    assert.equal(JSON.stringify(cuerpoActualizacion).includes("$2"), false);

    const persistido = await prisma.usuario.findUnique({
        where: { id: usuario.id },
        select: { nombre: true, apellido: true, rolId: true }
    });
    assert.equal(persistido.nombre, "Nombre Editado");
    assert.equal(persistido.apellido, "Apellido Editado");
    assert.equal(persistido.rolId, rolCliente.id);

    const emailDuplicado = await enviar("PUT", "/usuarios/perfil", {
        email: otroUsuario.email
    }, token);
    assert.equal(emailDuplicado.status, 409);

    const dniDuplicado = await enviar("PUT", "/usuarios/perfil", {
        dni: otroUsuario.dni
    }, token);
    assert.equal(dniDuplicado.status, 409);

    assert.equal((await enviar("PUT", "/usuarios/perfil", {
        email,
        dni
    }, token)).status, 200);

    assert.equal((await enviar("PUT", "/usuarios/cambiar-contrasena", {
        contrasenaActual: "incorrecta",
        contrasenaNueva: "nueva-clave",
        confirmarContrasena: "nueva-clave"
    }, token)).status, 400);

    assert.equal((await enviar("PUT", "/usuarios/cambiar-contrasena", {
        contrasenaActual: contrasena,
        contrasenaNueva: "nueva-clave",
        confirmarContrasena: "otra-clave"
    }, token)).status, 400);

    assert.equal((await enviar("PUT", "/usuarios/cambiar-contrasena", {
        contrasenaActual: contrasena,
        contrasenaNueva: "12345",
        confirmarContrasena: "12345"
    }, token)).status, 400);

    const cambioContrasena = await enviar("PUT", "/usuarios/cambiar-contrasena", {
        contrasenaActual: contrasena,
        contrasenaNueva: "nueva-clave",
        confirmarContrasena: "nueva-clave"
    }, token);
    assert.equal(cambioContrasena.status, 200);
    const cuerpoContrasena = await cambioContrasena.json();
    assert.equal(cuerpoContrasena.mensaje, "Contraseña actualizada correctamente");
    assert.equal(JSON.stringify(cuerpoContrasena).includes("$2"), false);

    const loginAnterior = await enviar("POST", "/usuarios/login", {
        email,
        contrasena
    });
    const loginNuevo = await enviar("POST", "/usuarios/login", {
        email,
        contrasena: "nueva-clave"
    });
    assert.notEqual(loginAnterior.status, 200);
    assert.equal(loginNuevo.status, 200);
});
