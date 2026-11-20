function manejadorErrores(error, req, res, next) {
    const conEstado = Number.isInteger(error?.codigoEstado) || Number.isInteger(error?.status);
    const codigoEstado = conEstado ? (error.codigoEstado || error.status) : 500;
    const mensaje = conEstado ? error.message : "Ocurrio un error en el servidor";

    // En produccion no se loguea el objeto completo (puede incluir datos
    // sensibles como contraseñas, tokens o cuerpos de request).
    if (process.env.NODE_ENV === "production") {
        console.error(`[${codigoEstado}] ${req.method} ${req.originalUrl}: ${error?.message || "Error sin mensaje"}`);
    } else {
        console.error(error);
    }

    res.status(codigoEstado).json({ mensaje: mensaje });
}

module.exports = manejadorErrores;
