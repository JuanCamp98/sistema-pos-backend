# POS Web Backend

## Descripción

Backend del sistema POS Web encargado de gestionar la lógica de negocio, autenticación de usuarios, control de inventario, ventas, caja y generación de reportes.

## Documentación completa

La documentación detallada del proyecto (modelo de datos, endpoints, decisiones técnicas) está en el siguiente Google Doc:

[Documentación del proyecto](https://docs.google.com/document/d/1U9A7sZCXHqEEOIHKMWEZhd4TZFbID6rypjZ4SzBhiS0/edit?usp=sharing)
[Tablero del proyecto](https://trello.com/b/kgiBW9pP/pos-web)
## Integrantes

* Corti Pedro Pablo
* Campuzano Juan Ignacio

## Tecnologías Utilizadas

* Node.js
* Express
* PostgreSQL
* Prisma ORM
* JWT (autenticación)
* bcryptjs (encriptación de contraseñas)

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

4. Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:
PORT=3000 
DATABASE_URL=tu_url_de_conexion_a_postgres 
JWT_SECRET=una_clave_secreta_cualquiera

5. Levantar la base de datos local (dejar la terminal abierta):

```bash
npx prisma dev
```

6. En otra terminal, ejecutar el servidor:

```bash
npm run dev
```

## Módulos implementados (backend)

* **Usuarios**: registro y login con JWT
* **Productos**: CRUD completo con borrado lógico
* **Stock**: registro de movimientos (entradas/salidas) con historial
* **Ventas**: registro de ventas con transacción atómica (descuenta stock automáticamente) e historial de ventas

## Estado Actual

Backend con los módulos principales implementados y probados. Pendiente: integración con el frontend.
