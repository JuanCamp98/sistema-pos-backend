// Controlador de usuarios, conecta las rutas HTTP con el servicio
const usuarioService = require("../services/usuarioService");

async function registrar(req, res, next) {
    try {
        const nuevoUsuario = await usuarioService.registrarUsuario(req.body);

        res.status(201).json({
            mensaje: "Usuario registrado correctamente",
            usuario: {
                id: nuevoUsuario.id,
                nombre: nuevoUsuario.nombre,
                apellido: nuevoUsuario.apellido,
                email: nuevoUsuario.email
            }
        });
    } catch (error) {
        next(error);
    }
}

async function iniciarSesion(req, res, next) {
    try {
        const resultado = await usuarioService.iniciarSesion(req.body);

        res.status(200).json({
            mensaje: "Sesion iniciada correctamente",
            token: resultado.token,
            usuario: resultado.usuario
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { registrar, iniciarSesion };