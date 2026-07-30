// Middleware que captura errores y responde de forma consistente
// Se coloca al final de todas las rutas en app.js
function manejadorErrores(error, req, res, next) {
    console.log(error);

    res.status(500).json({
        mensaje: "Ocurrio un error en el servidor"
    });
}

module.exports = manejadorErrores;