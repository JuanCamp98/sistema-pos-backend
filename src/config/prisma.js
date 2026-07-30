// Conexion centralizada al cliente de Prisma
// Se importa este archivo en cualquier lugar que necesite hablar con la base de datos
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adaptador = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter: adaptador });

module.exports = prisma;