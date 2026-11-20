// Punto de entrada del servidor
require("dotenv/config");

const app = require("./src/app");
const ventaService = require("./src/services/ventaService");
const {
    obtenerErroresConfiguracion,
    obtenerAdvertenciasConfiguracion
} = require("./src/utils/configuracion");

// En produccion no se arranca con configuracion insegura (por ejemplo, un
// JWT_SECRET ausente o demasiado corto que permita forjar tokens).
const erroresConfiguracion = obtenerErroresConfiguracion();
if (erroresConfiguracion.length > 0) {
    erroresConfiguracion.forEach(function (error) {
        console.error("Configuracion invalida: " + error);
    });
    process.exit(1);
}

obtenerAdvertenciasConfiguracion().forEach(function (advertencia) {
    console.warn("Advertencia de configuracion: " + advertencia);
});

const PUERTO = process.env.PORT || 3000;
const LIMPIEZA_VENTAS_MINUTOS = Number(process.env.VENTA_PENDIENTE_LIMPIEZA_MINUTOS || 15);

async function limpiarVentasPendientes() {
    try {
        const canceladas = await ventaService.cancelarVentasPendientesExpiradas();
        if (canceladas > 0) {
            console.log(`Se cancelaron ${canceladas} ventas anonimas vencidas y se libero su stock.`);
        }
    } catch (error) {
        console.error("No se pudieron cancelar las ventas anonimas vencidas:", error.message);
    }
}

app.listen(PUERTO, () => {
    console.log("Servidor corriendo en el puerto " + PUERTO);
    // Se ejecuta al arrancar y luego periodicamente para liberar reservas de
    // compras anonimas abandonadas. El timer no impide cerrar el proceso.
    limpiarVentasPendientes();
    const intervalo = setInterval(
        limpiarVentasPendientes,
        Math.max(1, LIMPIEZA_VENTAS_MINUTOS) * 60 * 1000
    );
    if (typeof intervalo.unref === "function") intervalo.unref();
});
