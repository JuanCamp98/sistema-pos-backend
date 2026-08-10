// Script para cargar datos iniciales en la base de datos
require("dotenv/config");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adaptador = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter: adaptador });

async function upsertRol(nombre) {
    return prisma.rol.upsert({
        where: { nombre: nombre },
        update: {},
        create: { nombre: nombre }
    });
}

async function upsertUsuario(nombre, apellido, email, contrasena, rolNombre) {
    const rol = await upsertRol(rolNombre);
    const contrasenaEncriptada = await bcrypt.hash(contrasena, 10);
    return prisma.usuario.upsert({
        where: { email: email },
        update: {},
        create: {
            nombre: nombre,
            apellido: apellido,
            email: email,
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
    const existente = await prisma.producto.findFirst({ where: { nombre: datos.nombre } });
    if (existente) return existente;
    return prisma.producto.create({ data: datos });
}

async function main() {
    // Roles
    await upsertRol("Administrador");
    await upsertRol("Cajero");
    await upsertRol("Cliente");

    // Usuarios de prueba
    await upsertUsuario("Admin", "Principal", "admin@pos.local", "admin123", "Administrador");
    await upsertUsuario("Cajero", "Demo", "cajero@pos.local", "cajero123", "Cajero");

    // Productos de ejemplo
    for (const producto of PRODUCTOS_EJEMPLO) {
        await upsertProducto(producto);
    }

    console.log("Seed cargado correctamente:");
    console.log("  - Roles: Administrador, Cajero, Cliente");
    console.log("  - Usuarios: admin@pos.local / admin123, cajero@pos.local / cajero123");
    console.log("  - " + PRODUCTOS_EJEMPLO.length + " productos de ejemplo");
}

main()
    .catch(function (error) {
        console.log(error);
    })
    .finally(async function () {
        await prisma.$disconnect();
    });
