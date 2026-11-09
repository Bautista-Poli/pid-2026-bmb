## Cómo se ve la pantalla

```
┌──────────────────────────────────────────┐
│ 1. Buscador (dónde vas, tu vehículo)     │  ← panel-buscador
├──────────────────────────────────────────┤
│ 2. Lista de estacionamientos             │  ← resultado-estacionamiento
│    (una tarjeta por cada uno)            │
├──────────────────────────────────────────┤
│ 3. Mapa con los estacionamientos         │  ← mapa-estacionamientos (compartido)
│                                          │
│    Al tocar uno se abre la ficha ───────────→ 4. detalle-estacionamiento
└──────────────────────────────────────────┘

Filtrar (botón del buscador) abre la ventana → 5. modal-filtros
```

## Qué hace cada parte

**1. Buscador (`panel-buscador/`)**
Arriba de todo. Tiene el campo para escribir el destino, el botón "Mi ubicación", el selector de vehículo y el botón "Filtrar". No busca nada por sí mismo: avisa a la pantalla principal (`mapa.ts`) qué eligió el conductor.

**Campo de búsqueda (`panel-buscador/campo-busqueda/`)**
Es el input con la lupa que está dentro del buscador. Mientras escribís, te muestra sugerencias (calles, zonas, plazas). Se puede usar con flechas, Enter y Escape.

**2. Lista (`resultado-estacionamiento/`)**
Una tarjeta por estacionamiento: foto, nombre, nivel, estrellas, dirección, distancia, precio, si hay lugar y los horarios. Si pasás el mouse por una tarjeta, su pin se resalta en el mapa. Si la tocás, se abre su ficha.

**3. Mapa (`mapa.html` + `components/estacionamiento/mapa-estacionamientos/`)**
Muestra los estacionamientos como pins con el precio. El color indica si hay lugar. El punto azul sos vos. Cuando movés el mapa, se buscan los estacionamientos de esa zona.

**4. Ficha (`detalle-estacionamiento/`)**
Se abre al tocar un estacionamiento. Muestra todo el detalle: precio, si hay lugar para el horario elegido, dirección, horarios y la foto. Tiene el botón **Reservar**, que lleva a la pantalla de reserva. Se cierra con la X o con Escape.

**5. Filtros (`modal-filtros/`)**
La ventana que se abre con "Filtrar". Permite elegir fecha, horario, cuántas horas, rango de precio, si querés solo cubiertos, nivel mínimo y el orden de la lista. Los cambios no se aplican hasta tocar **Aplicar**. **Limpiar** vuelve a los valores de fábrica (sin cambiar el orden).

**Insignias (`insignias-estacionamiento/`)**
Son los adornos de un estacionamiento: su nivel (Cobre a Diamante), sus insignias y sus estrellas. Aparecen en la ficha y en la lista. Si todavía no tiene calificaciones, no muestra nada.

## Archivos sueltos

- **`mapa.ts`**: el cerebro de la pantalla. Pide los datos al servidor y conecta todas las partes de arriba.
- **`constantes.ts`**: valores fijos, como el precio máximo del filtro, las opciones de orden y de nivel, y cuántos resultados entran por página (10).
- **`panel.interface.ts`**: define qué datos tienen los filtros.

## Qué pasa paso a paso

1. El conductor elige un destino y un vehículo.
2. La pantalla busca los estacionamientos de la zona que se ve en el mapa.
3. Los muestra en la lista y en el mapa, de a 10 por página.
4. Si cambia el orden, no vuelve a buscar en el servidor: solo reordena lo que ya tiene.
5. Si toca un estacionamiento, se abre su ficha. Desde ahí puede reservar.
