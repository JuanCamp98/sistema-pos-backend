// Controlador de usuarios, conecta las rutas HTTP con el servicio
const usuarioService = require("../services/usuarioService");
const { consultarClientePorDniSchema } = require("../schemas/usuarioSchema");

async function registrar(req, res, next) {
    try {
        let datos = { ...req.body };

        // Si no hay usuario autenticado o no es Administrador, forzar el rol a 'Cliente'
        if (!req.usuario || req.usuario.rol !== 'Administrador') {
            datos.rol = 'Cliente';
        }

        const nuevoUsuario = await usuarioService.registrarUsuario(datos);

        res.status(201).json({
            mensaje: "Usuario registrado correctamente",
            usuario: {
                id: nuevoUsuario.id,
                nombre: nuevoUsuario.nombre,
                apellido: nuevoUsuario.apellido,
                email: nuevoUsuario.email,
                dni: nuevoUsuario.dni
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

async function solicitarRecuperacion(req, res, next) {
    try {
        await usuarioService.solicitarRecuperacionContrasena(req.body.email);
        res.status(200).json({
            mensaje: "Si el correo está asociado a una cuenta, recibirás instrucciones para restablecer tu contraseña."
        });
    } catch (error) {
        next(error);
    }
}

async function restablecerContrasena(req, res, next) {
    try {
        await usuarioService.restablecerContrasena(req.body.token, req.body.contrasena);
        res.status(200).json({ mensaje: "La contraseña se restableció correctamente." });
    } catch (error) {
        next(error);
    }
}

async function obtenerPerfil(req, res, next) {
    try {
        const usuario = await usuarioService.obtenerPerfilUsuario(req.usuario.id);
        res.status(200).json({ usuario });
    } catch (error) {
        next(error);
    }
}

async function obtenerClientePorDni(req, res, next) {
    try {
        const resultado = consultarClientePorDniSchema.safeParse({ dni: req.params.dni });
        if (!resultado.success) {
            const errores = resultado.error.issues.map(function (issue) {
                return issue.path.join(".") + ": " + issue.message;
            });
            return res.status(400).json({ mensaje: "Datos invalidos", errores });
        }

        const cliente = await usuarioService.obtenerClientePorDni(resultado.data.dni);
        res.status(200).json({ cliente });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    registrar,
    iniciarSesion,
    solicitarRecuperacion,
    restablecerContrasena,
    obtenerPerfil,
    obtenerClientePorDni
};