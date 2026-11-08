require("dotenv/config");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const prisma = require("../src/config/prisma");

describe("API de disponibilidad y retiro programado", () => {
    let server;
    let baseUrl;
    let tokenAdministrador;
    let configuracionAnterior;
    let producto;
    let categoria;
    let fechaRetiro;
    let venta;

    async function solicitar(ruta, opciones = {}) {
        const respuesta = await fetch(baseUrl + ruta, {
            ...opciones,
            headers: {
                ...(opciones.body ? { "Content-Type": "application/json" } : {}),
                ...(opciones.token ? { Authorization: "Bearer " + opciones.token } : {}),
                ...opciones.headers
            },
            ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {})
        });
        const datos = await respuesta.json();
        return { respuesta, datos };
    }

    before(async () => {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        tokenAdministrador = jwt.sign(
            { id: "00000000-0000-4000-8000-000000000001", rol: "Administrador" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        configuracionAnterior = await prisma.configuracionRetiro.findUnique({ where: { id: 1 } });

        categoria = await prisma.categoria.create({
            data: { nombre: "Test Retiro " + Date.now() }
        });
        const tipoProducto = await prisma.tipoProducto.upsert({
            where: { nombre: "General" },
            update: {},
            create: { nombre: "General" }
        });
        producto = await prisma.producto.create({
            data: {
                nombre: "Producto Test Retiro " + Date.now(),
                precio: 100,
                stock: 10,
                categoriaId: categoria.id,
                tipoProductoId: tipoProducto.id,
                activo: true
            }
        });

        const disponibilidad = await fetch(baseUrl + "/retiros/disponibilidad?dias=1").then((response) => response.json());
        const manana = new Date(`${disponibilidad.fechaDesde}T00:00:00.000Z`);
        manana.setUTCDate(manana.getUTCDate() + 1);
        fechaRetiro = manana.toISOString().slice(0, 10);
    });

    after(async () => {
        if (venta) {
            await prisma.detalleVenta.deleteMany({ where: { ventaId: venta.id } });
            await prisma.venta.deleteMany({ where: { id: venta.id } });
        }
        if (producto) await prisma.producto.deleteMany({ where: { id: producto.id } });
        if (categoria) await prisma.categoria.deleteMany({ where: { id: categoria.id } });

        if (configuracionAnterior) {
            await prisma.configuracionRetiro.upsert({
                where: { id: 1 },
                create: {
                    id: 1,
                    configuracion: configuracionAnterior.configuracion
                },
                update: { configuracion: configuracionAnterior.configuracion }
            });
        } else {
            await prisma.configuracionRetiro.deleteMany({ where: { id: 1 } });
        }

        if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    test("admin configura horarios y el checkout recupera y persiste el turno", async () => {
        const diaSemana = new Date(`${fechaRetiro}T00:00:00.000Z`).getUTCDay();
        const configuracion = {
            diasAtencion: [diaSemana],
            horaApertura: "09:00",
            horaCierre: "11:00",
            intervaloMinutos: 60,
            excepciones: []
        };
        const guardado = await solicitar("/retiros/configuracion", {
            method: "PUT",
            token: tokenAdministrador,
            body: configuracion
        });
        assert.equal(guardado.respuesta.status, 200);
        assert.deepEqual(guardado.datos.configuracion.diasAtencion, [diaSemana]);

        const consultado = await solicitar("/retiros/configuracion", { token: tokenAdministrador });
        assert.equal(consultado.respuesta.status, 200);
        assert.equal(consultado.datos.configuracion.horaApertura, "09:00");

        const disponibilidad = await solicitar("/retiros/disponibilidad?dias=2");
        const fechaDisponible = disponibilidad.datos.fechas.find((fecha) => fecha.fecha === fechaRetiro);
        assert.ok(fechaDisponible);
        assert.deepEqual(fechaDisponible.horarios, [
            { horaInicio: "09:00", horaFin: "10:00" },
            { horaInicio: "10:00", horaFin: "11:00" }
        ]);

        const registrada = await solicitar("/ventas", {
            method: "POST",
            body: {
                items: [{ productoId: producto.id, cantidad: 1 }],
                retiro: { fecha: fechaRetiro, horaInicio: "09:00", horaFin: "10:00" }
            }
        });
        assert.equal(registrada.respuesta.status, 201);
        venta = registrada.datos.venta;
        assert.equal(venta.fechaRetiro.slice(0, 10), fechaRetiro);
        assert.equal(venta.horarioRetiroInicio, "09:00");
        assert.equal(venta.horarioRetiroFin, "10:00");

        const detalleCliente = await solicitar("/ventas/comprobante/" + venta.codigoComprobante);
        assert.equal(detalleCliente.respuesta.status, 200);
        assert.equal(detalleCliente.datos.venta.fechaRetiro.slice(0, 10), fechaRetiro);

        const detalleAdmin = await solicitar("/ventas/" + venta.id, { token: tokenAdministrador });
        assert.equal(detalleAdmin.respuesta.status, 200);
        assert.equal(detalleAdmin.datos.venta.horarioRetiroInicio, "09:00");

        const historialAdmin = await solicitar("/ventas?limit=20", { token: tokenAdministrador });
        assert.equal(historialAdmin.respuesta.status, 200);
        const ventaEnHistorial = historialAdmin.datos.ventas.find((item) => item.id === venta.id);
        assert.equal(ventaEnHistorial.horarioRetiroFin, "10:00");
    });

    test("rechaza fechas pasadas, turnos fuera de horario y pedidos sin turno", async () => {
        const ayer = new Date(`${fechaRetiro}T00:00:00.000Z`);
        ayer.setUTCDate(ayer.getUTCDate() - 2);
        const fechaPasada = ayer.toISOString().slice(0, 10);
        const datosBase = { items: [{ productoId: producto.id, cantidad: 1 }] };

        const sinTurno = await solicitar("/ventas", {
            method: "POST",
            body: datosBase
        });
        assert.equal(sinTurno.respuesta.status, 400);

        const fechaInvalida = await solicitar("/ventas", {
            method: "POST",
            body: {
                ...datosBase,
                retiro: { fecha: fechaPasada, horaInicio: "09:00", horaFin: "10:00" }
            }
        });
        assert.equal(fechaInvalida.respuesta.status, 400);

        const turnoFueraDeHorario = await solicitar("/ventas", {
            method: "POST",
            body: {
                ...datosBase,
                retiro: { fecha: fechaRetiro, horaInicio: "08:00", horaFin: "09:00" }
            }
        });
        assert.equal(turnoFueraDeHorario.respuesta.status, 409);
    });
});
