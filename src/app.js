// Configuracion principal de la aplicacion Express
const express = require("express");
const cors = require("cors");

const usuarioRoutes = require("./routes/usuarioRoutes");
const manejadorErrores = require("./middlewares/manejadorErrores");

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

// Middleware de manejo de errores, siempre al final
app.use(manejadorErrores);

module.exports = app;