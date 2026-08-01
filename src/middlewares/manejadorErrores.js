function manejadorErrores(error, req, res, next) {
    console.log(error);
    const codigoEstado = error.codigoEstado || 500;
    const mensaje = error.codigoEstado ? error.message : "Ocurrio un error en el servidor";
    res.status(codigoEstado).json({ mensaje: mensaje });
}

module.exports = manejadorErrores;