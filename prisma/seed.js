// Script para cargar datos iniciales en la base de datos
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adaptador = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter: adaptador });

async function main() {
    await prisma.rol.upsert({
        where: { nombre: "Administrador" },
        update: {},
        create: { nombre: "Administrador" }
    });

    await prisma.rol.upsert({
        where: { nombre: "Cajero" },
        update: {},
        create: { nombre: "Cajero" }
    });

    await prisma.rol.upsert({
    where: { nombre: "Cliente" },
    update: {},
    create: { nombre: "Cliente" }
    });

    console.log("Roles cargados correctamente");
}

main()
    .catch(function (error) {
        console.log(error);
    })
    .finally(async function () {
        await prisma.$disconnect();
    });