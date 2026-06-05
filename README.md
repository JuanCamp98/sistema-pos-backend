# POS Web Backend

## Descripción

Backend del sistema POS Web encargado de gestionar la lógica de negocio, autenticación de usuarios, control de inventario, ventas, caja y generación de reportes.

## Integrantes

* Corti Pedro Pablo
* Campuzano Juan Ignacio
* Centeno Lucas

## Tecnologías Utilizadas

* Node.js
* Express
* PostgreSQL
* Prisma ORM

## Instalación

1. Clonar el repositorio:

```bash
git clone https://github.com/JuanCamp98/sistema-pos-backend.git
```

2. Ingresar a la carpeta del proyecto:

```bash
cd pos-web-backend
```

3. Instalar dependencias:

```bash
npm install
```

4. Ejecutar el servidor:

```bash
npm run dev
```

## Variables de Entorno

Crear un archivo `.env` tomando como referencia el archivo `.env_example`.

Variables requeridas:

* PORT
* DATABASE_URL
* JWT_SECRET

## Estado Actual

Proyecto inicializado con Express y preparado para comenzar el desarrollo de la API y la integración con la base de datos.
