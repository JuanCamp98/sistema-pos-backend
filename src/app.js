// Configuracion principal de la aplicacion Express
const express = require("express");
const path = require("node:path");
const cors = require("cors");

const usuarioRoutes = require("./routes/usuarioRoutes");
const productoRoutes = require("./routes/productoRoutes");
const movimientoStockRoutes = require("./routes/movimientoStockRoutes");
const manejadorErrores = require("./middlewares/manejadorErrores");
const ventaRoutes = require("./routes/ventaRoutes");
const promocionRoutes = require("./routes/promocionRoutes");
const clasificacionRoutes = require("./routes/clasificacionRoutes");
const notificacionRoutes = require("./routes/notificacionRoutes");
const retiroRoutes = require("./routes/retiroRoutes");
const reporteRoutes = require("./routes/reporteRoutes");

const app = express();

// No revelar la tecnologia del servidor en las respuestas.
app.disable("x-powered-by");

// Cabeceras de seguridad basicas. No se agrega una CSP porque el frontend se
// sirve por separado y este backend solo devuelve JSON, archivos y PDFs.
app.use(function (req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
});

const origenesPermitidos = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map(function (origen) { return origen.trim(); })
    .filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Sin encabezado Origin no es una peticion cross-origin del navegador
        // (curl, tests, apps moviles). Se permite.
        if (!origin) return callback(null, true);
        if (origenesPermitidos.includes(origin)) return callback(null, true);
        // En desarrollo, si no hay origenes configurados, se mantiene abierto
        // para no bloquear el frontend local. En produccion se rechaza.
        if (origenesPermitidos.length === 0 && process.env.NODE_ENV !== "production") {
            return callback(null, true);
        }
        return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-token-comprobante"],
    maxAge: 86400
}));

app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Ruta de prueba
app.get("/", (req, res) => {
    res.send("Servidor del sistema POS funcionando");
});

// Rutas de la aplicacion
app.use("/usuarios", usuarioRoutes);
app.use("/productos", productoRoutes);
app.use("/stock", movimientoStockRoutes);
app.use("/ventas", ventaRoutes);
app.use("/retiros", retiroRoutes);
app.use("/reportes", reporteRoutes);
app.use("/notificaciones", notificacionRoutes);
app.use("/promociones", promocionRoutes);
app.use("/categorias", clasificacionRoutes("categoria"));
app.use("/tipos-producto", clasificacionRoutes("tipoProducto"));

// Middleware de manejo de errores, siempre al final
app.use(manejadorErrores);

module.exports = app;
