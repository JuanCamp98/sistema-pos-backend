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

## Mercado Pago QR

La venta rápida puede generar un QR dinámico en ARS. La venta permanece pendiente y solo se marca como cobrada después de consultar una order `processed` en Mercado Pago.

1. En Mercado Pago Developers, crea una aplicación y usa primero el Access Token de prueba.
2. Crea una sucursal y una caja para Código QR. Configura `MP_QR_EXTERNAL_POS_ID` con el `external_id` de esa caja.
3. Agrega estas variables al `.env` del backend. Copia `MP_WEBHOOK_SECRET` desde la configuración de Webhooks. No publiques ni compartas las credenciales.

```env
MP_ACCESS_TOKEN=TEST-...
MP_QR_EXTERNAL_POS_ID=POS-001
MP_WEBHOOK_SECRET=...
```

4. Aplica la migración de desarrollo con `npx prisma migrate dev`.
5. En la aplicación de Developers, configura el evento **Order (Mercado Pago)** para `https://TU-DOMINIO/ventas/webhook/mercadopago`, copia la clave secreta al `.env` y reinicia el backend. Para desarrollo local, usa un túnel HTTPS y configura su URL pública.
6. Prueba con credenciales y cuentas de prueba antes de cambiar al Access Token de producción.

El QR dinámico vence a los 15 minutos. El webhook solo dispara la sincronización: el backend consulta la order directamente a Mercado Pago antes de modificar el estado o descontar el stock.

## Estado Actual

Backend con los módulos principales implementados y probados. Pendiente: integración con el frontend.
