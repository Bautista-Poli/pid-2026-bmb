# Comandos de desarrollo (todo local)

Nada de esto necesita internet. Más detalle en [`docs/local.md`](docs/local.md).

## 1. Arrancar (cada vez que prendés la compu)

```bash
brew services start postgresql@18     # levanta la base (si ya estaba, no pasa nada)
```

Dos terminales:

```bash
cd Back  && npm run dev     # API en http://localhost:3000 (se reinicia sola al guardar)
cd Front && npm start       # App en http://localhost:4200 (recarga sola al guardar)
```

## 2. ¿Rompí algo? → un solo comando

Desde la **raíz** del repo:

```bash
npm run check
```

Compila el Front, corre los tests del Front y los del Back. Si todo anda termina
con `✔ Todo OK`; si no, dice en qué paso falló y arriba está el error.

Si falla un test, fijate el nombre: si cambió una regla porque lo pidió el
enunciado, el test quedó viejo (se ajusta o se borra); si no, rompiste algo.

## 3. Crear cosas nuevas en Angular

Desde `Front/`:

```bash
ng generate component ...    
ng generate service ...             
ng generate interface ...               
```

Una pantalla nueva además hay que agregarla en `Front/src/app/app.routes.ts`.

## 4. Base de datos

### Mirar y cambiar cosas a mano: `psql`

```bash
psql parkit_local
```

Adentro se escribe SQL común (siempre terminado en `;`) y algunos atajos:

| Qué | Cómo |
|---|---|
| Listar tablas | `\dt` |
| Ver columnas de una tabla | `\d vehiculo` |
| Ver datos | `SELECT * FROM tipo_vehiculo;` |
| Agregar una columna | `ALTER TABLE vehiculo ADD COLUMN color VARCHAR(30);` |
| Cargar datos | `INSERT INTO tipo_vehiculo (nombre) VALUES ('Bicicleta');` |
| Cambiar datos | `UPDATE usuario SET nombre = 'Ana' WHERE email = 'ana@mail.com';` |
| Salir | `\q` |

Ojo: lo que hacés con `psql` cambia **solo la base**. Si después corrés
`npm run db:restaurar`, se pierde. Para que quede para siempre, copiá el mismo
SQL a los archivos de abajo.

### Que el cambio quede guardado en el código

| Qué cambia | Dónde va | Ejemplo |
|---|---|---|
| Estructura (tablas, columnas) | `Back/src/db/schema.sql` | `ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS color VARCHAR(30);` |
| Datos fijos (tipos, catálogos) | `Back/src/db/seed.sql` | Agregar `(4, 'Bicicleta')` al `INSERT INTO tipo_vehiculo` |

Con `npm run dev` levantado **no hace falta nada más**: al guardar `schema.sql`
o `seed.sql` el Back se reinicia solo y los aplica a la base (en la terminal
aparece `[esquema] schema.sql aplicado`). Si el SQL tiene un error, el Back
muestra el mensaje de Postgres y vuelve a arrancar cuando lo corregís.

Si el Back no está levantado, se aplica a mano desde `Back/`:

```bash
npm run db:migrate     # aplica schema.sql + seed.sql. No borra datos: se puede correr siempre
```

Por eso todo lo de esos archivos tiene que poder correrse dos veces sin
romper (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

### Otros comandos de la base (desde `Back/`)

```bash
npm run db:restaurar   # ⚠ BORRA la base y la vuelve a dejar como la copia de producción
npm run db:crear-admin -- --email admin@parkit.com --nombre Ana --apellido Perez   # pide la contraseña
```

## 5. Si algo no anda

| Error | Solución |
|---|---|
| `Postgres no esta corriendo` / `ECONNREFUSED` | `brew services start postgresql@18` |
| `Falta la variable de entorno ...` | Falta `Back/.env.local`: copiar `Back/.env.example` y completar |
| `EADDRINUSE :3000` / `:4200` | Ya hay uno levantado en otra terminal: cerralo (Ctrl+C) |
| Una columna nueva "no existe" | Fijate en la terminal del Back si `schema.sql` dio error (o corré `npm run db:migrate`) |
