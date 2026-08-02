// Configuracion principal de la aplicacion Express
const express = require("express");
const cors = require("cors");

const usuarioRoutes = require("./routes/usuarioRoutes");
const productoRoutes = require("./routes/productoRoutes");
const movimientoStockRoutes = require("./routes/movimientoStockRoutes");
const manejadorErrores = require("./middlewares/manejadorErrores");
const ventaRoutes = require("./routes/ventaRoutes");

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get("/", (req, res) => {
    res.send("Servidor del sistema POS funcionando");
});

// Rutas de la aplicacion
app.use("/usuarios", usuarioRoutes);
app.use("/productos", productoRoutes);
app.use("/stock", movimientoStockRoutes);
app.use("/ventas", ventaRoutes);

// Middleware de manejo de errores, siempre al final
app.use(manejadorErrores);

module.exports = app;