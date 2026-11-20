// Script para cargar datos iniciales en la base de datos
require("dotenv/config");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adaptador = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter: adaptador });

const { normalizarNombre } = require("../src/utils/nombres");

async function buscarPorNombre(modelo, nombre) {
    return modelo.findFirst({
        where: { nombre: { equals: nombre, mode: "insensitive" } }
    });
}

async function upsertRol(nombre) {
    const nombreNormalizado = normalizarNombre(nombre);
    const existente = await buscarPorNombre(prisma.rol, nombreNormalizado);
    if (existente) return existente;
    return prisma.rol.create({ data: { nombre: nombreNormalizado } });
}

async function upsertUsuario(nombre, apellido, dni, email, contrasena, rolNombre) {
    const rol = await upsertRol(rolNombre);
    const emailNormalizado = String(email).trim().toLowerCase();
    const existente = await prisma.usuario.findFirst({
        where: { email: { equals: emailNormalizado, mode: "insensitive" } }
    });
    if (existente) return existente;
    const contrasenaEncriptada = await bcrypt.hash(contrasena, 10);
    return prisma.usuario.create({
        data: {
            nombre: nombre,
            apellido: apellido,
            dni: dni,
            email: emailNormalizado,
            contrasena: contrasenaEncriptada,
            rolId: rol.id
        }
    });
}

const PRODUCTOS_EJEMPLO = [
    {
        nombre: "Cafe Americano",
        descripcion: "Cafe de filtro 250ml",
        precio: 1500.00,
        stock: 50,
        categoria: "Bebidas"
    },
    {
        nombre: "Medialuna",
        descripcion: "Medialuna de manteca",
        precio: 800.00,
        stock: 30,
        categoria: "Panaderia"
    },
    {
        nombre: "Sandwich de Jamon y Queso",
        descripcion: "Pan de miga con jamon y queso",
        precio: 3500.00,
        stock: 20,
        categoria: "Comida"
    },
    {
        nombre: "Gaseosa Cola 500ml",
        descripcion: "Botella de gaseosa sabor cola",
        precio: 2000.00,
        stock: 40,
        categoria: "Bebidas"
    },
    {
        nombre: "Agua Mineral 500ml",
        descripcion: "Botella de agua sin gas",
        precio: 1200.00,
        stock: 60,
        categoria: "Bebidas"
    },
    {
        nombre: "Tostado Mixto",
        descripcion: "Sandwich tostado de jamon y queso",
        precio: 4000.00,
        stock: 15,
        categoria: "Comida"
    }
];

async function upsertProducto(datos) {
    const nombre = normalizarNombre(datos.nombre);
    const existente = await buscarPorNombre(prisma.producto, nombre);
    if (existente) return existente;
    const nombreCategoria = normalizarNombre(datos.categoria);
    const categoria = await buscarPorNombre(prisma.categoria, nombreCategoria) ||
        await prisma.categoria.create({ data: { nombre: nombreCategoria } });
    const tipoProducto = await buscarPorNombre(prisma.tipoProducto, "General") ||
        await prisma.tipoProducto.create({ data: { nombre: "General" } });
    const { categoria: _categoria, ...productoDatos } = datos;
    return prisma.producto.create({ data: { ...productoDatos, nombre, categoriaId: categoria.id, tipoProductoId: tipoProducto.id } });
}

async function main() {
    // Roles
    await upsertRol("Administrador");
    await upsertRol("Cajero");
    await upsertRol("Cliente");

    const esProduccion = process.env.NODE_ENV === "production";
    const contrasenaAdmin = process.env.SEED_ADMIN_PASSWORD;
    const contrasenaCajero = process.env.SEED_CAJERO_PASSWORD;

    if (esProduccion && (!contrasenaAdmin || !contrasenaCajero)) {
        throw new Error("En produccion definí SEED_ADMIN_PASSWORD y SEED_CAJERO_PASSWORD antes de ejecutar el seed");
    }

    // Usuarios de prueba
    await upsertUsuario(
        "Admin",
        "Principal",
        "30000000",
        "admin@pos.local",
        contrasenaAdmin || "admin123",
        "Administrador"
    );
    await upsertUsuario(
        "Cajero",
        "Demo",
        "30000001",
        "cajero@pos.local",
        contrasenaCajero || "cajero123",
        "Cajero"
    );

    // Productos de ejemplo
    for (const producto of PRODUCTOS_EJEMPLO) {
        await upsertProducto(producto);
    }

    console.log("Seed cargado correctamente:");
    console.log("  - Roles: Administrador, Cajero, Cliente");
    console.log("  - Usuarios: admin@pos.local, cajero@pos.local");
    console.log("  - " + PRODUCTOS_EJEMPLO.length + " productos de ejemplo");
    if (!contrasenaAdmin || !contrasenaCajero) {
        console.warn("  - ATENCION: se usaron contrasenas por defecto. Cambialas antes de usar el sistema.");
    }
}

main()
    .catch(function (error) {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async function () {
        await prisma.$disconnect();
    });
