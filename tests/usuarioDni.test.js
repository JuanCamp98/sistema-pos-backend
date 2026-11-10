require("dotenv/config");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

let server;
let usuario;

after(async () => {
    if (usuario) {
        await prisma.usuario.deleteMany({ where: { id: usuario.id } });
    }
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
    }
    await prisma.$disconnect();
});

test("el inicio de sesión devuelve el DNI persistido para el perfil del cliente", async () => {
    const rol = await prisma.rol.upsert({
        where: { nombre: "Cliente" },
        update: {},
        create: { nombre: "Cliente" }
    });
    const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const dni = `DNI-${sufijo}`;
    const email = `dni_${sufijo}@pos.local`;
    const contrasena = "clave-de-prueba";

    usuario = await prisma.usuario.create({
        data: {
            nombre: "Cliente",
            apellido: "DNI",
            dni,
            email,
            contrasena: await bcrypt.hash(contrasena, 10),
            rolId: rol.id
        }
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const respuesta = await fetch(`http://127.0.0.1:${server.address().port}/usuarios/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, contrasena })
    });

    assert.equal(respuesta.status, 200);
    const datos = await respuesta.json();
    assert.equal(datos.usuario.dni, dni);

    const perfilSinSesion = await fetch(`${baseUrl}/usuarios/perfil`);
    assert.equal(perfilSinSesion.status, 401);

    const perfil = await fetch(`${baseUrl}/usuarios/perfil`, {
        headers: { Authorization: `Bearer ${datos.token}` }
    });
    assert.equal(perfil.status, 200);
    assert.equal((await perfil.json()).usuario.dni, dni);
});
