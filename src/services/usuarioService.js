// Logica de negocio relacionada a los usuarios
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const mailService = require("./mailService");
const { validarFormatoDni, obtenerVariantesDni } = require("../utils/dni");

const DURACION_TOKEN_RECUPERACION_MS = 60 * 60 * 1000;

function crearErrorTokenRecuperacion() {
    const error = new Error("El enlace de recuperación no es válido o venció.");
    error.status = 400;
    return error;
}

function obtenerHashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function registrarUsuario(datos) {
    const { nombre, apellido, dni, email, contrasena, rol } = datos;

    const rolEncontrado = await prisma.rol.findUnique({
        where: { nombre: rol }
    });

    if (!rolEncontrado) {
        throw new Error("El rol indicado no existe");
    }

    // Buscamos si existe algun usuario que coincida en DNI O Email en una sola consulta
    const usuarioExistente = await prisma.usuario.findFirst({
        where: {
            OR: [
                { email: email },
                { dni: dni }
            ]
        }
    });

    if (usuarioExistente) {
        const error = new Error("Ya existe un usuario registrado con los datos ingresados");
        error.status = 409;
        throw error;
    }

    const contrasenaEncriptada = await bcrypt.hash(contrasena, 10);

    const nuevoUsuario = await prisma.usuario.create({
        data: {
            nombre: nombre,
            apellido: apellido,
            dni: dni,
            email: email,
            contrasena: contrasenaEncriptada,
            rolId: rolEncontrado.id
        }
    });

    return nuevoUsuario;
}

async function iniciarSesion(datos) {
    const { email, contrasena } = datos;

    const usuario = await prisma.usuario.findUnique({
        where: { email: email },
        include: { rol: true }
    });

    if (!usuario) {
        throw new Error("Email o contrasena incorrectos");
    }

    const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);

    if (!contrasenaValida) {
        throw new Error("Email o contrasena incorrectos");
    }

    const token = jwt.sign(
        {
            id: usuario.id,
            rol: usuario.rol.nombre
        },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );

    return {
        token: token,
        usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            dni: usuario.dni,
            email: usuario.email,
            rol: usuario.rol.nombre
        }
    };
}

async function solicitarRecuperacionContrasena(email) {
    const usuario = await prisma.usuario.findUnique({
        where: { email },
        select: {
            id: true,
            rol: { select: { nombre: true } }
        }
    });

    if (!usuario || usuario.rol.nombre !== "Cliente") {
        return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = obtenerHashToken(token);
    const venceEn = new Date(Date.now() + DURACION_TOKEN_RECUPERACION_MS);

    await prisma.recuperacionContrasena.deleteMany({
        where: { usuarioId: usuario.id }
    });

    const recuperacion = await prisma.recuperacionContrasena.create({
        data: { usuarioId: usuario.id, tokenHash, venceEn }
    });

    try {
        await mailService.enviarCorreoRecuperacionContrasena(email, token);
    } catch (error) {
        console.error("No se pudo enviar el correo de recuperación:", error.message);
        await prisma.recuperacionContrasena.deleteMany({
            where: { id: recuperacion.id }
        });
    }
}

async function restablecerContrasena(token, contrasena) {
    const tokenHash = obtenerHashToken(token);
    const ahora = new Date();
    const recuperacion = await prisma.recuperacionContrasena.findUnique({
        where: { tokenHash },
        select: { id: true, usuarioId: true, venceEn: true }
    });

    if (!recuperacion || recuperacion.venceEn <= ahora) {
        throw crearErrorTokenRecuperacion();
    }

    const contrasenaEncriptada = await bcrypt.hash(contrasena, 10);

    await prisma.$transaction(async (transaccion) => {
        const tokenConsumido = await transaccion.recuperacionContrasena.deleteMany({
            where: {
                id: recuperacion.id,
                venceEn: { gt: ahora }
            }
        });

        if (tokenConsumido.count !== 1) {
            throw crearErrorTokenRecuperacion();
        }

        await transaccion.usuario.update({
            where: { id: recuperacion.usuarioId },
            data: { contrasena: contrasenaEncriptada }
        });
    });
}

async function obtenerPerfilUsuario(usuarioId) {
    const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            email: true,
            rol: { select: { nombre: true } }
        }
    });

    if (!usuario) {
        const error = new Error("Usuario no encontrado");
        error.status = 404;
        throw error;
    }

    return {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        dni: usuario.dni,
        email: usuario.email,
        rol: usuario.rol.nombre
    };
}

async function obtenerClientePorDni(dni) {
    if (!dni || typeof dni !== "string" || !dni.trim()) {
        const error = new Error("El DNI es obligatorio");
        error.status = 400;
        throw error;
    }

    if (!validarFormatoDni(dni)) {
        const error = new Error("El formato del DNI no es válido");
        error.status = 400;
        throw error;
    }

    const cliente = await prisma.usuario.findFirst({
        where: {
            OR: obtenerVariantesDni(dni).map((dniVariante) => ({ dni: dniVariante })),
            rol: {
                nombre: "Cliente"
            }
        },
        select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            email: true
        }
    });

    if (!cliente) {
        const error = new Error("No se encontró ningún cliente con el DNI ingresado");
        error.status = 404;
        throw error;
    }

    return {
        id: cliente.id,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        dni: cliente.dni,
        email: cliente.email
    };
}

module.exports = {
    registrarUsuario,
    iniciarSesion,
    solicitarRecuperacionContrasena,
    restablecerContrasena,
    obtenerPerfilUsuario,
    obtenerClientePorDni
};