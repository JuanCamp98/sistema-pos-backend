const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
    configuracionRetiroSchema,
    retiroVentaSchema
} = require("../src/schemas/retiroSchema");
const { registrarVentaSchema } = require("../src/schemas/ventaSchema");
const {
    generarHorarios,
    validarHorarioDisponible
} = require("../src/services/retiroService");

const configuracion = {
    diasAtencion: [0, 1],
    horaApertura: "09:00",
    horaCierre: "12:00",
    intervaloMinutos: 60,
    excepciones: []
};

describe("Disponibilidad de retiro", () => {
    test("genera intervalos dentro de los horarios configurados", () => {
        assert.deepEqual(
            generarHorarios("2026-11-09", configuracion, new Date("2026-11-08T13:00:00.000Z")),
            [
                { horaInicio: "09:00", horaFin: "10:00" },
                { horaInicio: "10:00", horaFin: "11:00" },
                { horaInicio: "11:00", horaFin: "12:00" }
            ]
        );
    });

    test("oculta fechas pasadas y turnos que ya comenzaron en el día actual", () => {
        const ahora = new Date("2026-11-08T13:30:00.000Z");
        assert.deepEqual(generarHorarios("2026-11-07", configuracion, ahora), []);
        assert.deepEqual(
            generarHorarios("2026-11-08", configuracion, ahora),
            [{ horaInicio: "11:00", horaFin: "12:00" }]
        );
    });

    test("aplica cierres y horarios especiales", () => {
        const configuracionEspecial = {
            ...configuracion,
            excepciones: [
                { fecha: "2026-11-09", cerrado: true },
                {
                    fecha: "2026-11-10",
                    cerrado: false,
                    horaApertura: "13:00",
                    horaCierre: "15:00"
                }
            ]
        };
        const ahora = new Date("2026-11-08T13:00:00.000Z");

        assert.deepEqual(generarHorarios("2026-11-09", configuracionEspecial, ahora), []);
        assert.deepEqual(
            generarHorarios("2026-11-10", configuracionEspecial, ahora),
            [{ horaInicio: "13:00", horaFin: "14:00" }, { horaInicio: "14:00", horaFin: "15:00" }]
        );
    });

    test("rechaza turnos que no coinciden exactamente con un intervalo habilitado", () => {
        const ahora = new Date("2026-11-08T13:00:00.000Z");
        const retiroValido = {
            fecha: "2026-11-09",
            horaInicio: "09:00",
            horaFin: "10:00"
        };
        assert.equal(validarHorarioDisponible(retiroValido, configuracion, ahora), true);
        assert.equal(validarHorarioDisponible({ ...retiroValido, horaFin: "09:30" }, configuracion, ahora), false);
        assert.equal(validarHorarioDisponible({ ...retiroValido, horaInicio: "08:00" }, configuracion, ahora), false);
    });

    test("valida formato de fecha, días, intervalos y horarios de apertura", () => {
        assert.equal(retiroVentaSchema.safeParse({
            fecha: "2026-02-30",
            horaInicio: "09:00",
            horaFin: "10:00"
        }).success, false);
        assert.equal(configuracionRetiroSchema.safeParse({
            ...configuracion,
            diasAtencion: [1, 1]
        }).success, false);
        assert.equal(configuracionRetiroSchema.safeParse({
            ...configuracion,
            horaApertura: "12:00"
        }).success, false);
    });

    test("el checkout requiere una fecha y un intervalo de retiro", () => {
        const datosBase = {
            items: [{ productoId: "c6bbeb14-a886-4b2d-995b-2d7586f142be", cantidad: 1 }]
        };
        assert.equal(registrarVentaSchema.safeParse(datosBase).success, false);
        assert.equal(registrarVentaSchema.safeParse({
            ...datosBase,
            retiro: {
                fecha: "2026-11-09",
                horaInicio: "09:00",
                horaFin: "10:00"
            }
        }).success, true);
    });
});
