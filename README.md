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

4. Crear un archivo `.env` en la raíz del proyecto:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:55432/template1?sslmode=disable
JWT_SECRET=una_clave_secreta_cualquiera
```

5. Levantar la base de datos local en una terminal y dejarla abierta:

```bash
npx prisma dev --name pos-pocho-local --port 3010 --db-port 55432 --shadow-db-port 55433
```

6. En otra terminal, aplicar las migraciones, cargar los datos iniciales e iniciar el servidor:

```bash
npx prisma migrate deploy
node prisma/seed.js
npm run dev
```

## Módulos implementados (backend)

* **Usuarios**: registro y login con JWT
* **Productos**: CRUD completo con borrado lógico
* **Stock**: registro de movimientos (entradas/salidas) con historial
* **Ventas**: registro de ventas con transacción atómica (descuenta stock automáticamente) e historial de ventas

## Notificaciones internas

Cuando una venta de autogestión pasa a `COBRADA`, el backend crea, dentro de la misma transacción, una notificación para cada usuario con rol `Administrador` o `Cajero`, para que el personal pueda comenzar a prepararla. La restricción única por venta y destinatario evita duplicados. Las ventas rápidas y las ventas canceladas no generan notificaciones.

Los endpoints `GET /notificaciones` y `PATCH /notificaciones/:id/leida` requieren JWT y rol de personal. El listado incluye notificaciones leídas y pendientes, junto con el contador de pendientes; cada usuario solo consulta o actualiza las propias. El frontend actualiza el listado cada 30 segundos. Aplicar la migración correspondiente en cada entorno con `npx prisma migrate deploy`.

## Fecha y horario de retiro

La sección **Horarios de retiro** de administración permite definir los días de atención, apertura, cierre, duración de cada turno y excepciones de fechas cerradas o con horario especial. No hay un horario inicial supuesto: hasta que se guarde una configuración, el checkout no ofrece fechas.

El checkout consulta `GET /retiros/disponibilidad?dias=60`; la venta requiere un turno y el backend lo recalcula dentro de la transacción antes de guardarlo. `fecha_retiro` se almacena como fecha SQL (`DATE`) y el horario como cadenas `HH:mm`, evitando conversiones UTC sobre fechas u horas locales. Las ventas anteriores conservan sus datos y quedan sin turno. Los turnos no tienen cupos ni reservas limitadas; al cancelar una compra no se requiere liberar capacidad.

La zona horaria usada para decidir la fecha actual y filtrar turnos que ya comenzaron se configura con `ZONA_HORARIA_NEGOCIO` (por defecto `America/Argentina/Buenos_Aires`). Aplicar la migración con `npx prisma migrate deploy` y regenerar Prisma con `npx prisma generate`. La configuración se gestiona desde el panel, no es necesario modificar datos de ventas existentes.

## Precio mínimo promocional

El piso es global y se configura en el backend mediante `PRECIO_MINIMO_PROMOCIONAL`, en pesos argentinos, con hasta dos decimales. Si no se define, se usa `$100.00`. Una promoción activa se rechaza al crearla o actualizarla si alguno de los productos activos alcanzados quedaría bajo el piso; el error informa el producto, el precio resultante y el mínimo.

El cálculo usa centavos enteros, permite descuentos que dejan el precio exactamente en el mínimo y no acumula promociones: conserva la regla existente de aplicar la oferta individual más beneficiosa. Si un cambio posterior de precio deja una promoción existente bajo el piso, el catálogo informa que no puede aplicarse y el backend rechaza el checkout; también se valida al cambiar precio o categoría de un producto. El precio regular sin promoción puede ser inferior al piso. El límite se expone para mostrarlo en administración y debe configurarse en el entorno del backend. El modelo actual no implementa combos ni promociones 2x1.

## Imágenes de productos

El campo opcional `imagen` almacena una URL HTTP(S) o una ruta relativa de la imagen. Los productos existentes quedan con `imagen: null`. En desarrollo, aplicar el cambio de base de datos con `npx prisma migrate dev`; en despliegues, ejecutar `npx prisma migrate deploy`. Luego regenerar el cliente de Prisma con `npx prisma generate`.

El alta y la edición administrativa aceptan una imagen JPG, PNG o WebP de hasta 5 MB como archivo multipart en el campo `imagen`. El backend valida el formato, guarda el archivo en `uploads/productos/` con un nombre generado y persiste una ruta como `/uploads/productos/<id>.jpg` en el producto. Express publica los archivos bajo `/uploads`. Si una imagen se reemplaza, el archivo anterior se elimina.

El directorio `uploads/` debe persistir entre reinicios y despliegues. En Docker, montar un volumen persistente en ese directorio; si el alojamiento usa almacenamiento efímero, configurar un volumen persistente antes de producción o los archivos subidos podrían perderse.

## Mercado Pago QR

La venta rápida puede generar un QR dinámico en ARS. La venta permanece pendiente y solo se marca como cobrada después de consultar una order `processed` en Mercado Pago.

1. En Mercado Pago Developers, crea una aplicación y usa primero el Access Token de prueba.
2. Crea una sucursal y una caja para Código QR. Configura `MP_QR_EXTERNAL_POS_ID` con el `external_id` de esa caja.
3. Agrega estas variables al `.env` del backend. No publiques ni compartas las credenciales.

```env
MP_ACCESS_TOKEN=TEST-...
MP_QR_EXTERNAL_POS_ID=POS-001
```

4. Aplica las migraciones con `npx prisma migrate deploy` y regenera Prisma con `npx prisma generate`.
5. En la aplicación de Developers, configura notificaciones para **Order (Mercado Pago)** con la URL `https://TU-DOMINIO/ventas/webhook/mercadopago`. Para desarrollo local, usa un túnel HTTPS y configura su URL pública.
6. El webhook QR se usa como aviso y no como confirmación de pago: la API no requiere una firma HMAC para esta notificación QR. El backend acepta solo identificadores de orden con formato válido, busca una orden vinculada a una venta local y consulta la orden con el Access Token antes de actualizar la venta. No se actualizan ventas a partir del contenido enviado por el webhook.
7. El QR dinámico vence a los 15 minutos. El cliente y la caja vuelven a consultar la orden cada 10 segundos como respaldo si la notificación se demora o no llega. Solo `processed` confirma el pago; `expired` y `canceled` cancelan la venta pendiente, mientras que `refunded` queda registrado como reembolsada. `status_detail` también se conserva para diagnóstico.

## Estado Actual

Backend con los módulos principales implementados e integrado con el frontend.
