/* =====================================================================
   ICON OUTFIT CHALLENGE · MOTOR (funciones puras, sin DOM)
   Depende de la librería de ilustración (DIBUJOS, pintarPrenda, FLAT_D, shade).
   ===================================================================== */

/* ---------- Tarjeta 1: estilos ----------
   pal: paleta propia del estilo. Cada prenda toma un "rol" de color de acá. */
const ESTILOS = {
  elegante: { nombre: "Elegante", tag: "Couture", frase: "El estilo elegante pide líneas limpias, buenas telas y terminaciones prolijas",
    pal: { claro: ["#EFE8DC", "marfil"], medio: ["#B7B1BE", "gris perla"], oscuro: ["#1F1C24", "negro"], acento: ["#5B2B5F", "ciruela"], metal: ["#C9A961", "dorado"] },
    mini: { dibujo: "blazer", rol: "oscuro" }, sesgoVestido: 0 },
  casual: { nombre: "Casual", tag: "Easy", frase: "El estilo casual busca prendas cómodas que combinen entre sí sin esfuerzo",
    pal: { claro: ["#F3F0EA", "blanco roto"], medio: ["#C49A6C", "camel"], oscuro: ["#2E3A57", "azul marino"], acento: ["#93AE96", "verde salvia"], metal: ["#C0C4CC", "plateado"] },
    mini: { dibujo: "camperaJean", rol: "denim" }, sesgoVestido: -1 },
  urbano: { nombre: "Urbano", tag: "Street", frase: "El estilo urbano mezcla volumen, prendas utilitarias y actitud de calle",
    pal: { claro: ["#CFCDD3", "gris melange"], medio: ["#6E7350", "verde oliva"], oscuro: ["#1E1E22", "negro"], acento: ["#8E6CE0", "lila eléctrico"], metal: ["#C0C4CC", "plateado"] },
    mini: { dibujo: "cargo", rol: "medio" }, sesgoVestido: -4 },
  minimal: { nombre: "Minimalista", tag: "Pure", frase: "El estilo minimalista se apoya en pocas piezas, cortes simples y colores neutros",
    pal: { claro: ["#F2EFE8", "blanco hueso"], medio: ["#D6C9B3", "arena"], oscuro: ["#3A3A40", "gris carbón"], acento: ["#A79E94", "greige"], metal: ["#C0C4CC", "plateado"] },
    mini: { dibujo: "camisola", rol: "medio" }, sesgoVestido: 0 },
  romantico: { nombre: "Romántico", tag: "Rosé", frase: "El estilo romántico juega con volados, texturas suaves y tonos empolvados",
    pal: { claro: ["#F2D6DB", "rosa empolvado"], medio: ["#C8B5E3", "lila suave"], oscuro: ["#6B4A6E", "malva profundo"], acento: ["#D58EA0", "rosa té"], metal: ["#C9A961", "dorado"] },
    mini: { dibujo: "volados", rol: "claro" }, sesgoVestido: 2 },
  glam: { nombre: "Glam", tag: "Shine", frase: "El estilo glam pide brillo, contraste y una pieza protagonista",
    pal: { claro: ["#EAD8B8", "champagne"], medio: ["#BFC1C9", "plateado"], oscuro: ["#17141C", "negro"], acento: ["#7A3FB8", "violeta"], metal: ["#C9CCD4", "plata"] },
    mini: { dibujo: "coctel", rol: "acento" }, sesgoVestido: 2 },
  deportivo: { nombre: "Deportivo", tag: "Active", frase: "El estilo deportivo prioriza el movimiento, las telas técnicas y el calzado cómodo",
    pal: { claro: ["#F5F5F3", "blanco"], medio: ["#A9ABB1", "gris"], oscuro: ["#2A2B30", "grafito"], acento: ["#9C7CF4", "lavanda"], metal: ["#C0C4CC", "plateado"] },
    mini: { dibujo: "running", rol: "acento" }, sesgoVestido: -8 },
  boho: { nombre: "Boho", tag: "Libre", frase: "El estilo boho combina telas naturales, estampados y prendas con movimiento",
    pal: { claro: ["#EFE4CF", "crudo"], medio: ["#C2704E", "terracota"], oscuro: ["#5A3B2A", "chocolate"], acento: ["#C99A3B", "mostaza"], metal: ["#C9A961", "dorado"] },
    mini: { dibujo: "kimono", rol: "medio" }, sesgoVestido: 1 },
};

/* ---------- Tarjeta 2: clima ---------- */
const CLIMAS = {
  calido: { nombre: "Cálido", nombresLook: ["al Sol", "de Verano", "de Lino"] },
  templado: { nombre: "Templado", nombresLook: ["de Entretiempo", "de Brisa", "de Otoño"] },
  frio: { nombre: "Frío", nombresLook: ["de Lana", "de Invierno", "Bajo Cero"] },
  lluvia: { nombre: "Lluvioso", nombresLook: ["Bajo la Lluvia", "de Tormenta", "entre Charcos"] },
};

/* ---------- Tarjeta 3: evento ----------
   f: formalidad (1 relajado … 5 formal). noche: la paleta pasa a tonos de noche.
   practico: sin taco y con bolso con lugar. */
const EVENTOS = {
  amigos: { nombre: "Salida con amigos", f: 2.2, noche: false, practico: false, nombresLook: ["Plan", "Ronda", "Encuentro"],
    porque: l => `Para una salida con amigos el look es relajado pero cuidado: ${l.calzado} te acompañan horas sin molestar.` },
  fiesta: { nombre: "Fiesta nocturna", f: 4, noche: true, practico: false, nombresLook: ["Medianoche", "After", "Pista"],
    porque: l => `En una fiesta nocturna se puede subir la apuesta: ${l.protagonista} es la pieza que se luce y ${l.bolso} guarda lo justo para la noche.` },
  elegante: { nombre: "Evento elegante", f: 4.4, noche: true, practico: false, nombresLook: ["Velada", "Soirée", "Brindis"],
    porque: l => `Un evento elegante pide prolijidad: ${l.protagonista} y ${l.calzado} suben el nivel sin llegar a la etiqueta de gala.` },
  clases: { nombre: "Día de clases", f: 1.6, noche: false, practico: true, nombresLook: ["Campus", "Aula", "Recreo"],
    porque: l => `Para un día de clases manda la comodidad: ${l.calzado} sin taco para moverte todo el día y ${l.bolso} con lugar para tus cosas.` },
  cita: { nombre: "Cita o salida especial", f: 3.2, noche: true, practico: false, nombresLook: ["Cita", "Primera Cita", "Encuentro Especial"],
    porque: l => `Para una cita conviene verse con intención y estar a gusto: ${l.protagonista} aporta el detalle especial sin exagerar.` },
  airelibre: { nombre: "Paseo al aire libre", f: 1.5, noche: false, practico: true, nombresLook: ["Sendero", "Picnic", "Parque"],
    porque: l => `En un paseo al aire libre vas a caminar: ${l.calzado} sin taco y prendas que acompañan el movimiento.` },
  formal: { nombre: "Evento formal", f: 5, noche: true, practico: false, nombresLook: ["Gala", "Ceremonia", "Gran Noche"],
    porque: l => `Un evento formal pide la versión más cuidada: ${l.protagonista} y ${l.calzado} cumplen con la etiqueta.` },
  casual: { nombre: "Día casual", f: 1.6, noche: false, practico: false, nombresLook: ["Domingo", "Día Libre", "Mañana Lenta"],
    porque: l => `En un día casual no hace falta pensar demasiado: ${l.protagonista} con ${l.calzado} resuelve el día entero.` },
};

/* ---------- Catálogo ----------
   cat: top | bottom | vestido | abrigo | calzado | bolso | acc | medias | paraguas
   est: afinidad por estilo (0-3). cl: climas donde se puede usar. f: [mín, máx] de formalidad.
   rol: color de la paleta (claro|medio|oscuro|acento|metal|noche) o color fijo {hex, nombre}.
   tela: para la explicación. Flags: taco, abierto, imper (impermeable), calor (abrigo 0-3),
   dia (solo de día), tipo: pollera|pantalon|short (para la alternativa).
   por: nombre o color distinto según el estilo. */
const T = ["calido", "templado", "frio", "lluvia"];
const DENIM = { hex: "#4D6E98", nombre: "azul índigo" }, DENIM_CLARO = { hex: "#8CAAD0", nombre: "celeste lavado" };
const es = s => Object.fromEntries(s.split(" ").map(x => { const [k, v] = x.split(":"); return [k, +v]; }));
const CATALOGO = [
  // TOPS
  { id: "remera", cat: "top", nombre: "Remera de algodón", dibujo: "remera", est: es("casual:3 urbano:2 minimal:2 deportivo:1 boho:1"), cl: ["calido", "templado"], f: [1, 3], rol: "claro", tela: "algodón", desc: "Básica de cuello redondo, fresca y fácil de combinar.", por: { urbano: { nombre: "Remera oversize" } } },
  { id: "blusa", cat: "top", nombre: "Blusa satinada", dibujo: "blusa", est: es("elegante:2 romantico:2 glam:2 minimal:1"), cl: ["calido", "templado", "lluvia"], f: [3, 5], rol: "claro", tela: "satén", desc: "Escote en V y caída suave; el brillo del satén eleva el conjunto." },
  { id: "camisa", cat: "top", nombre: "Camisa de poplín", dibujo: "camisa", est: es("elegante:3 minimal:3 casual:2"), cl: ["calido", "templado", "lluvia"], f: [2, 5], rol: "claro", tela: "poplín de algodón", desc: "Cuello clásico y puños; se puede usar abrochada o abierta.", detalle: "oscuro", por: { casual: { nombre: "Camisa a rayas" } } },
  { id: "musculosa", cat: "top", nombre: "Musculosa de lino", dibujo: "musculosa", est: es("casual:2 boho:2 minimal:2"), cl: ["calido"], f: [1, 3], rol: "acento", tela: "lino", desc: "Sin mangas y de lino, la opción más fresca para el calor." },
  { id: "sweater", cat: "top", nombre: "Sweater de lana trenzado", dibujo: "sweater", est: es("casual:3 boho:2 romantico:1 elegante:1 urbano:1"), cl: ["templado", "frio", "lluvia"], f: [1, 3], rol: "medio", tela: "lana", desc: "Punto trenzado que abriga sin pesar.", por: { urbano: { nombre: "Sweater oversize de lana" } } },
  { id: "corset", cat: "top", nombre: "Top corset", dibujo: "corset", est: es("glam:3 romantico:1 urbano:1"), cl: ["calido", "templado"], f: [3, 5], rol: "noche", tela: "satén estructurado", desc: "Estructurado y ajustado: es la pieza protagonista." },
  { id: "deportivo", cat: "top", nombre: "Top deportivo", dibujo: "deportivo", est: es("deportivo:3 urbano:1"), cl: ["calido"], f: [1, 2], rol: "acento", tela: "tela técnica", desc: "Tela técnica que seca rápido." },
  { id: "polera", cat: "top", nombre: "Polera de cuello alto", dibujo: "polera", est: es("minimal:3 elegante:3 urbano:1"), cl: ["templado", "frio", "lluvia"], f: [2, 5], rol: "oscuro", tela: "punto fino", desc: "Punto fino al cuerpo; abriga el cuello y queda prolija bajo cualquier abrigo." },
  { id: "termica", cat: "top", nombre: "Buzo térmico de cuello alto", dibujo: "polera", est: es("deportivo:3 urbano:2 casual:1"), cl: ["templado", "frio", "lluvia"], f: [1, 2], rol: "oscuro", tela: "tela térmica", desc: "Primera capa térmica que retiene el calor y deja transpirar." },
  { id: "volados", cat: "top", nombre: "Blusa con volados", dibujo: "volados", est: es("romantico:3 boho:2"), cl: ["calido", "templado", "lluvia"], f: [2, 4], rol: "claro", tela: "gasa", desc: "Hombros con volados y tela liviana." },
  { id: "crop", cat: "top", nombre: "Crop top", dibujo: "crop", est: es("urbano:2 glam:1 deportivo:1"), cl: ["calido"], f: [1, 3], rol: "acento", tela: "algodón elastizado", desc: "Corto y al cuerpo; equilibra prendas de tiro alto." },
  { id: "camisola", cat: "top", nombre: "Camisola de seda", dibujo: "camisola", est: es("minimal:2 elegante:2 glam:2 romantico:1"), cl: ["calido", "templado"], f: [3, 5], rol: "noche", tela: "seda", desc: "Breteles finos y caída fluida." },
  { id: "cardigan", cat: "top", nombre: "Cárdigan corto de punto", dibujo: "cardigan", est: es("romantico:3 casual:2 boho:1"), cl: ["templado", "frio", "lluvia"], f: [2, 4], rol: "claro", tela: "punto", desc: "Abotonado y corto: se usa como top o como capa extra." },
  { id: "halter", cat: "top", nombre: "Top halter", dibujo: "halter", est: es("glam:3 boho:1"), cl: ["calido"], f: [3, 5], rol: "noche", tela: "crepé", desc: "Se ata al cuello y deja los hombros al aire." },
  { id: "chaleco", cat: "top", nombre: "Chaleco sastrero", dibujo: "chaleco", est: es("elegante:2 minimal:2 urbano:1"), cl: ["calido", "templado"], f: [3, 5], rol: "oscuro", tela: "sarga", desc: "Sastrería sin mangas, se usa solo como top." },
  // BOTTOMS
  { id: "jean", cat: "bottom", tipo: "pantalon", nombre: "Jean recto", dibujo: "jean", est: es("casual:3 urbano:2 minimal:1 boho:1"), cl: T, f: [1, 3], rol: DENIM, tela: "denim", desc: "Tiro alto y pierna recta; un clásico que combina con todo." },
  { id: "wideleg", cat: "bottom", tipo: "pantalon", nombre: "Jean wide leg", dibujo: "wideLeg", est: es("urbano:3 casual:2 boho:1"), cl: ["calido", "templado", "frio"], f: [1, 3], rol: DENIM, tela: "denim", desc: "Pierna ancha y tiro alto, con mucho movimiento." },
  { id: "sastrero", cat: "bottom", tipo: "pantalon", nombre: "Pantalón sastrero", dibujo: "sastrero", est: es("elegante:3 minimal:3 glam:1"), cl: ["templado", "frio", "lluvia"], f: [3, 5], rol: "oscuro", tela: "lana fría", desc: "Pinzas y raya marcada; la base más versátil para looks formales.", por: { deportivo: { nombre: "Pantalón sastrero con cintura elástica", est: 1 } } },
  { id: "plisada", cat: "bottom", tipo: "pollera", nombre: "Pollera midi plisada", dibujo: "plisada", est: es("romantico:3 elegante:2 minimal:1"), cl: ["calido", "templado"], f: [2, 5], rol: "medio", tela: "gasa plisada", desc: "Largo midi con pliegues que se mueven al caminar." },
  { id: "short", cat: "bottom", tipo: "short", nombre: "Short de jean", dibujo: "short", est: es("casual:2 urbano:2 boho:2"), cl: ["calido"], f: [1, 2], rol: DENIM_CLARO, tela: "denim liviano", desc: "Tiro alto y ruedo deshilachado." },
  { id: "shortdep", cat: "bottom", tipo: "short", nombre: "Short deportivo", dibujo: "short", est: es("deportivo:3"), cl: ["calido"], f: [1, 1.5], rol: "oscuro", tela: "tela técnica", desc: "Liviano y con cintura elástica." },
  { id: "calza", cat: "bottom", tipo: "pantalon", nombre: "Calza deportiva", dibujo: "calza", est: es("deportivo:3"), cl: T, f: [1, 2], rol: "oscuro", tela: "lycra técnica", desc: "Tiro alto y compresión suave." },
  { id: "palazzo", cat: "bottom", tipo: "pantalon", nombre: "Pantalón palazzo de lino", dibujo: "palazzo", est: es("boho:2 minimal:2 elegante:2"), cl: ["calido", "templado"], f: [2, 4], rol: "claro", tela: "lino", desc: "Pierna muy ancha y tela que respira." },
  { id: "minifalda", cat: "bottom", tipo: "pollera", nombre: "Minifalda de cuero ecológico", dibujo: "minifalda", est: es("glam:3 urbano:2"), cl: ["templado", "frio"], f: [2, 4], rol: "oscuro", tela: "cuero ecológico", desc: "Corta, recta y con presencia." },
  { id: "lapiz", cat: "bottom", tipo: "pollera", nombre: "Pollera lápiz", dibujo: "lapiz", est: es("elegante:3 minimal:1 glam:1"), cl: ["templado", "frio", "lluvia"], f: [3, 5], rol: "oscuro", tela: "crepé", desc: "Al cuerpo y por debajo de la rodilla." },
  { id: "faldalarga", cat: "bottom", tipo: "pollera", nombre: "Pollera larga estampada", dibujo: "faldaLarga", est: es("boho:3 romantico:1"), cl: ["calido", "templado"], f: [1, 3], rol: "medio", detalle: "claro", tela: "viscosa", desc: "Larga, con vuelo y estampado." },
  { id: "jogger", cat: "bottom", tipo: "pantalon", nombre: "Jogger de algodón", dibujo: "jogger", est: es("deportivo:3 urbano:2 casual:1"), cl: T, f: [1, 2], rol: "medio", tela: "frisa de algodón", desc: "Puños en el tobillo y cintura con cordón." },
  { id: "cargo", cat: "bottom", tipo: "pantalon", nombre: "Pantalón cargo", dibujo: "cargo", est: es("urbano:3 casual:1 deportivo:1"), cl: T, f: [1, 2.5], rol: "medio", tela: "gabardina", desc: "Bolsillos laterales y calce relajado." },
  { id: "bermuda", cat: "bottom", tipo: "short", nombre: "Bermuda sastrera", dibujo: "bermuda", est: es("minimal:2 elegante:1 urbano:1 casual:1"), cl: ["calido"], f: [2, 3.5], rol: "medio", tela: "lino", desc: "Sastrería a la rodilla, fresca y prolija." },
  // VESTIDOS Y ENTERITOS
  { id: "slip", cat: "vestido", nombre: "Vestido slip de satén", dibujo: "slip", est: es("glam:2 minimal:2 romantico:2 elegante:1"), cl: ["calido", "templado"], f: [3, 5], rol: "noche", tela: "satén", desc: "Breteles finos y corte al bies." },
  { id: "gala", cat: "vestido", nombre: "Vestido largo de gala", dibujo: "gala", est: es("elegante:3 glam:3 romantico:1"), cl: ["calido", "templado", "frio"], f: [4.5, 5], rol: "noche", tela: "crepé de seda", desc: "Largo al piso y escote en V: la opción de etiqueta." },
  { id: "camisero", cat: "vestido", nombre: "Vestido camisero", dibujo: "camisero", est: es("casual:2 minimal:2 elegante:1"), cl: ["calido", "templado", "lluvia"], f: [2, 3.5], rol: "medio", tela: "algodón", desc: "Abotonado adelante y con cinto." },
  { id: "enterito", cat: "vestido", nombre: "Enterito de lino", dibujo: "enterito", est: es("boho:2 casual:2 urbano:1"), cl: ["calido"], f: [1, 3], rol: "medio", tela: "lino", desc: "Una sola prenda, liviana, y el look está resuelto." },
  { id: "lunares", cat: "vestido", nombre: "Vestido corto con lunares", dibujo: "lunares", est: es("romantico:3"), cl: ["calido", "templado", "lluvia"], f: [2, 3.5], rol: "oscuro", detalle: "claro", tela: "crepé", desc: "Mangas cortas y estampado de lunares." },
  { id: "punto", cat: "vestido", nombre: "Vestido de punto acanalado", dibujo: "punto", est: es("minimal:3 elegante:2 casual:1"), cl: ["templado", "frio", "lluvia"], f: [2, 4], rol: "oscuro", tela: "punto de lana", desc: "Mangas largas y al cuerpo; abriga como un sweater." },
  { id: "coctel", cat: "vestido", nombre: "Vestido de cóctel", dibujo: "coctel", est: es("glam:3 elegante:2 romantico:1"), cl: ["calido", "templado", "frio", "lluvia"], f: [3.5, 5], rol: "noche", tela: "tafeta", desc: "Corto, con falda con volumen." },
  { id: "wrap", cat: "vestido", nombre: "Vestido cruzado estampado", dibujo: "wrap", est: es("romantico:2 boho:2 casual:1"), cl: ["calido", "templado", "lluvia"], f: [2, 4], rol: "medio", detalle: "claro", tela: "viscosa", desc: "Se cruza y se ata a la cintura." },
  { id: "tejido", cat: "vestido", nombre: "Vestido tejido largo", dibujo: "tejidoLargo", est: es("boho:3 minimal:1"), cl: ["templado", "frio"], f: [2, 3], rol: "claro", tela: "punto", desc: "Largo, tejido y abrigado." },
  { id: "mono", cat: "vestido", nombre: "Mono sastrero", dibujo: "mono", est: es("minimal:3 elegante:2 glam:1 urbano:1"), cl: ["calido", "templado", "frio", "lluvia"], f: [3, 5], rol: "noche", tela: "crepé", desc: "Una pieza de sastrería con cinto: alternativa formal al vestido.", tipo: "pantalon" },
  { id: "vcamiseta", cat: "vestido", nombre: "Vestido remera a rayas", dibujo: "vCamiseta", est: es("casual:3 urbano:1"), cl: ["calido", "templado"], f: [1, 2], rol: "claro", detalle: "oscuro", tela: "algodón", desc: "Cómodo como una remera, largo a la rodilla." },
  // ABRIGOS (tercera prenda)
  { id: "blazer", cat: "abrigo", nombre: "Blazer", dibujo: "blazer", est: es("elegante:3 minimal:2 urbano:1 glam:1"), cl: ["templado"], f: [2.5, 5], calor: 1, rol: "oscuro", tela: "lana fría", desc: "Hombros marcados; ordena cualquier look.", por: { deportivo: { nombre: "Blazer de punto técnico", est: 1 }, glam: { nombre: "Blazer de terciopelo" } } },
  { id: "cuero", cat: "abrigo", nombre: "Campera de cuero ecológico", dibujo: "cuero", est: es("urbano:3 glam:2 casual:1"), cl: ["templado", "frio"], f: [1.5, 4], calor: 2, rol: "oscuro", tela: "cuero ecológico", desc: "Corte motociclista; corta el viento." },
  { id: "tapado", cat: "abrigo", nombre: "Tapado de lana", dibujo: "tapado", est: es("elegante:3 minimal:3 romantico:2 glam:2 casual:1"), cl: ["frio"], f: [2.5, 5], calor: 3, rol: "medio", tela: "paño de lana", desc: "Largo y abrigado; se lleva sobre los hombros o puesto." },
  { id: "puffer", cat: "abrigo", nombre: "Campera puffer", dibujo: "puffer", est: es("deportivo:3 urbano:3 casual:2"), cl: ["frio"], f: [1, 2.5], calor: 3, rol: "oscuro", tela: "nylon acolchado", desc: "Acolchada y liviana: el abrigo más eficiente para el frío." },
  { id: "parka", cat: "abrigo", nombre: "Parka acolchada impermeable", dibujo: "puffer", est: es("casual:2 urbano:2 deportivo:2 boho:1"), cl: ["lluvia", "frio"], f: [1, 3], calor: 3, imper: true, rol: "medio", tela: "nylon impermeable", desc: "Exterior impermeable, costuras selladas y relleno térmico." },
  { id: "kimono", cat: "abrigo", nombre: "Kimono liviano estampado", dibujo: "kimono", est: es("boho:3 romantico:1"), cl: ["templado"], f: [1, 3.5], calor: 0, rol: "acento", detalle: "claro", tela: "viscosa", desc: "Abierto y fluido; suma una capa sin dar calor." },
  { id: "trench", cat: "abrigo", nombre: "Trench impermeable", dibujo: "trench", est: es("elegante:3 minimal:3 romantico:2 casual:2 glam:2 boho:1"), cl: ["lluvia", "templado"], f: [2, 5], calor: 2, imper: true, rol: "medio", tela: "gabardina impermeable", desc: "Cruzado, con cinto y tela repelente al agua.", por: { glam: { nombre: "Trench de charol impermeable", rol: "oscuro" } } },
  { id: "chalecoinf", cat: "abrigo", nombre: "Chaleco inflable", dibujo: "chalecoInflable", est: es("deportivo:2 urbano:2 casual:1"), cl: ["templado"], f: [1, 2], calor: 1, rol: "acento", tela: "nylon acolchado", desc: "Abriga el torso y deja los brazos libres." },
  { id: "camperajean", cat: "abrigo", nombre: "Campera de jean", dibujo: "camperaJean", est: es("casual:3 urbano:2 boho:1"), cl: ["templado"], f: [1, 2.5], calor: 1, rol: DENIM, tela: "denim", desc: "La capa liviana de entretiempo por excelencia." },
  { id: "rompe", cat: "abrigo", nombre: "Rompevientos impermeable", dibujo: "camperaJean", est: es("deportivo:3 urbano:2"), cl: ["lluvia", "templado"], f: [1, 2], calor: 1, imper: true, rol: "acento", tela: "nylon técnico", desc: "Liviano, con capucha, frena el viento y la lluvia." },
  { id: "poncho", cat: "abrigo", nombre: "Poncho de lana", dibujo: "poncho", est: es("boho:3"), cl: ["frio", "templado"], f: [1, 3], calor: 3, rol: "medio", detalle: "claro", tela: "lana", desc: "Tejido artesanal, abrigado y con flecos." },
  // CALZADO
  { id: "zapatillas", cat: "calzado", nombre: "Zapatillas blancas de cuero", dibujo: "zapatillas", est: es("casual:3 urbano:2 minimal:2 deportivo:2"), cl: ["calido", "templado", "frio"], f: [1, 3.2], rol: { hex: "#F3F1EC", nombre: "blanco" }, desc: "Suela plana; combinan con todo y aguantan el día entero." },
  { id: "running", cat: "calzado", nombre: "Zapatillas running", dibujo: "running", est: es("deportivo:3 urbano:1"), cl: ["calido", "templado", "frio"], f: [1, 2], rol: "acento", detalle: "claro", desc: "Amortiguación y malla que respira." },
  { id: "trail", cat: "calzado", nombre: "Zapatillas trail impermeables", dibujo: "running", est: es("deportivo:3 urbano:1"), cl: ["lluvia", "frio"], f: [1, 2], imper: true, rol: "oscuro", detalle: "acento", desc: "Membrana impermeable y suela con agarre para piso mojado." },
  { id: "stilettos", cat: "calzado", nombre: "Stilettos", dibujo: "stilettos", est: es("glam:3 elegante:3 romantico:1"), cl: ["calido", "templado", "frio"], f: [3.8, 5], taco: true, rol: "noche", desc: "Taco aguja y punta fina." },
  { id: "borcegos", cat: "calzado", nombre: "Borcegos de cuero engrasado", dibujo: "borcegos", est: es("urbano:3 casual:1 boho:1 glam:1"), cl: ["templado", "frio", "lluvia"], f: [1, 3.2], imper: true, rol: { hex: "#24202A", nombre: "negro" }, desc: "Suela de goma con agarre; el cuero engrasado repele el agua." },
  { id: "mocasines", cat: "calzado", nombre: "Mocasines de cuero", dibujo: "mocasines", est: es("elegante:2 minimal:3 casual:2"), cl: ["calido", "templado", "frio"], f: [2, 4.2], rol: "oscuro", desc: "Sin cordones, prolijos y planos." },
  { id: "sandalias", cat: "calzado", nombre: "Sandalias de tiras con taco", dibujo: "sandalias", est: es("glam:2 elegante:2 romantico:1 boho:1"), cl: ["calido"], f: [3, 5], taco: true, abierto: true, rol: "metal", desc: "Tiras finas y taco medio, ideales para el calor." },
  { id: "botas", cat: "calzado", nombre: "Botas de caña alta", dibujo: "botasAltas", est: es("elegante:2 glam:2 boho:2 romantico:1"), cl: ["templado", "frio"], f: [2, 4.5], rol: "oscuro", desc: "Caña hasta la rodilla: cubren y abrigan." },
  { id: "botaslluvia", cat: "calzado", nombre: "Botas de lluvia de caucho", dibujo: "botasAltas", est: es("casual:3 romantico:2 boho:2 minimal:1 urbano:1"), cl: ["lluvia"], f: [1, 3], imper: true, rol: "oscuro", desc: "Caucho 100 % impermeable: los charcos dejan de ser un problema." },
  { id: "charol", cat: "calzado", nombre: "Botinetas de charol", dibujo: "botineta", est: es("elegante:3 glam:3 minimal:2 romantico:1"), cl: ["lluvia", "frio"], f: [3, 5], imper: true, rol: { hex: "#1C1A20", nombre: "negro brillante" }, desc: "El charol no absorbe el agua; taco bajo y firme." },
  { id: "chatitas", cat: "calzado", nombre: "Chatitas", dibujo: "chatitas", est: es("romantico:3 minimal:2 elegante:1 casual:1"), cl: ["calido", "templado"], f: [2, 4], rol: "medio", desc: "Planas y livianas; cómodas para caminar." },
  { id: "mules", cat: "calzado", nombre: "Mules de taco medio", dibujo: "mules", est: es("minimal:2 elegante:2 glam:1 romantico:1"), cl: ["calido", "templado"], f: [3, 4.5], taco: true, abierto: true, rol: "claro", desc: "Sin talón y con taco cuadrado." },
  { id: "botineta", cat: "calzado", nombre: "Botinetas de cuero", dibujo: "botineta", est: es("minimal:2 elegante:2 urbano:2 boho:1 casual:1"), cl: ["templado", "frio"], f: [2, 4], rol: "oscuro", desc: "Caña corta y taco bajo." },
  { id: "plataformas", cat: "calzado", nombre: "Plataformas de yute", dibujo: "plataformas", est: es("boho:3 romantico:1"), cl: ["calido"], f: [2, 3.5], abierto: true, rol: "claro", detalle: "claro", desc: "Base de yute: altura sin perder estabilidad." },
  { id: "sandaliasb", cat: "calzado", nombre: "Sandalias bajas de cuero", dibujo: "sandaliasBajas", est: es("boho:3 casual:2 minimal:1"), cl: ["calido"], f: [1, 2.5], abierto: true, rol: "medio", desc: "Planas y abiertas: los pies respiran." },
  // BOLSOS
  { id: "clutch", cat: "bolso", nombre: "Clutch metalizado", dibujo: "clutch", est: es("glam:3 elegante:2 romantico:1"), f: [3.5, 5], noche: true, rol: "metal", desc: "Chico y con brillo: lo justo para la noche." },
  { id: "tote", cat: "bolso", nombre: "Tote de lona", dibujo: "tote", est: es("casual:3 minimal:1 boho:1"), f: [1, 2.5], rol: "claro", desc: "Amplio: entra todo lo del día.", por: { boho: { nombre: "Tote de rafia", est: 2 } } },
  { id: "cartera", cat: "bolso", nombre: "Cartera estructurada", dibujo: "cartera", est: es("elegante:3 minimal:2 romantico:1"), f: [2.5, 4.5], rol: "oscuro", desc: "Forma rígida y asa corta." },
  { id: "rinonera", cat: "bolso", nombre: "Riñonera", dibujo: "rinonera", est: es("urbano:3 deportivo:3"), f: [1, 2.5], rol: "oscuro", desc: "Manos libres; se lleva cruzada." },
  { id: "bandolera", cat: "bolso", nombre: "Bandolera chica", dibujo: "bandolera", est: es("casual:2 romantico:2 boho:1 urbano:1 minimal:1"), f: [1.5, 3.5], rol: "medio", desc: "Cruzada al cuerpo, cómoda y segura." },
  { id: "mochila", cat: "bolso", nombre: "Mochila chica", dibujo: "mochila", est: es("urbano:2 deportivo:2 casual:2"), f: [1, 2], practico: true, rol: "oscuro", desc: "Reparte el peso en los dos hombros." },
  // ACCESORIOS (slot: zona del cuerpo, no se repite)
  { id: "perlas", cat: "acc", slot: "orejas", nombre: "Aros de perla", dibujo: "perlas", est: es("romantico:3 elegante:2 minimal:1"), f: [2, 5], rol: { hex: "#F4EEE6", nombre: "perla" }, desc: "Discretos y luminosos." },
  { id: "argollas", cat: "acc", slot: "orejas", nombre: "Argollas", dibujo: "argollas", est: es("glam:2 urbano:2 boho:2 casual:1"), f: [1, 4], rol: "metal", desc: "Medianas, para todos los días." },
  { id: "aroslargos", cat: "acc", slot: "orejas", nombre: "Aros largos", dibujo: "arosLargos", est: es("glam:3 boho:2 elegante:1"), f: [3, 5], rol: "metal", desc: "Colgantes, se mueven con vos." },
  { id: "cadena", cat: "acc", slot: "cuello", nombre: "Collar de cadena", dibujo: "collar", est: es("urbano:3 glam:2 casual:1"), f: [1, 4], rol: "metal", desc: "Eslabones gruesos con actitud." },
  { id: "collarperlas", cat: "acc", slot: "cuello", nombre: "Collar de perlas", dibujo: "collarPerlas", est: es("elegante:3 romantico:3"), f: [3, 5], rol: { hex: "#F4EEE6", nombre: "perla" }, desc: "Un clásico que nunca falla." },
  { id: "pulsera", cat: "acc", slot: "muneca", nombre: "Pulsera rígida", dibujo: "pulsera", est: es("minimal:2 boho:2 casual:1 elegante:1"), f: [1, 5], rol: "metal", desc: "Un solo detalle de metal." },
  { id: "lentes", cat: "acc", slot: "cara", nombre: "Lentes de sol", dibujo: "lentes", est: es("casual:2 urbano:2 deportivo:2 boho:2 glam:1"), cl: ["calido", "templado"], f: [1, 3.5], dia: true, rol: { hex: "#2B2433", nombre: "negro" }, desc: "Protegen del sol y completan el look." },
  { id: "capelina", cat: "acc", slot: "cabeza", nombre: "Capelina", dibujo: "capelina", est: es("boho:3 romantico:2"), cl: ["calido"], f: [1, 3], dia: true, rol: { hex: "#E3CFA4", nombre: "paja natural" }, desc: "Ala ancha que da sombra." },
  { id: "gorro", cat: "acc", slot: "cabeza", nombre: "Gorro de lana", dibujo: "gorro", est: es("urbano:2 deportivo:2 casual:2 boho:1"), cl: ["frio"], f: [1, 2.5], abriga: true, rol: "acento", desc: "Por la cabeza se pierde mucho calor." },
  { id: "bufanda", cat: "acc", slot: "cuello", nombre: "Bufanda tejida", dibujo: "bufanda", est: es("casual:2 boho:2 urbano:1 minimal:1 romantico:1 deportivo:1"), cl: ["frio"], f: [1, 3.5], abriga: true, rol: "claro", desc: "Gruesa y suave, cierra el cuello contra el viento." },
  { id: "panuelo", cat: "acc", slot: "cuello", nombre: "Pañuelo de seda", dibujo: "panuelo", est: es("romantico:2 elegante:2 boho:1"), cl: ["templado", "lluvia"], f: [2, 4], rol: "acento", detalle: "claro", desc: "Anudado al cuello, suma color." },
  { id: "cinturonancho", cat: "acc", slot: "cintura", nombre: "Cinturón ancho", dibujo: "cinturonAncho", est: es("boho:2 urbano:1 elegante:1"), f: [1, 4], cinto: true, rol: "oscuro", desc: "Marca la cintura." },
  { id: "cinturonfino", cat: "acc", slot: "cintura", nombre: "Cinturón fino", dibujo: "cinturonFino", est: es("elegante:2 minimal:2 romantico:1"), f: [2, 5], cinto: true, rol: "oscuro", desc: "Un detalle prolijo en la cintura." },
  // AGREGADOS SEGÚN CLIMA
  { id: "medias", cat: "medias", nombre: "Medias de lycra opacas", dibujo: "medias", f: [1, 5], rol: "oscuro", desc: "Cubren las piernas debajo de pollera o vestido." },
  { id: "mediaslana", cat: "medias", nombre: "Medias de lana", dibujo: "medias", f: [1, 3], rol: "oscuro", desc: "Más gruesas, para el frío de verdad." },
  { id: "paraguas", cat: "paraguas", nombre: "Paraguas plegable", dibujo: "paraguas", f: [1, 5], rol: "oscuro", desc: "Entra en el bolso y se abre en segundos." },
];
const POR_ID = Object.fromEntries(CATALOGO.map(i => [i.id, i]));

/* El paraguas no estaba en la librería: perfil propio con el mismo trazo. */
DIBUJOS.paraguas = { perfil: c => ({
  p: ["M30,10 C24,24 21,44 22,62 L38,62 C39,44 36,24 30,10 Z", "M29,62 L31,62 L31,84 C31,90 25,92 23,88 L25.5,87 C26.5,88.6 29,88 29,85 Z", "M28.6,4 L31.4,4 L31,11 L29,11 Z"],
  d: [ln("M30,12 L27,61 M30,12 L33,61", shade(c, 0.35), 1), ln("M23,40 L37,40", shade(c, -0.3), 2.2)] }) };

/* ---------- utilidades deterministas ---------- */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const azar = (...k) => (hashStr(k.join("|")) % 1000) / 1000;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const minus = s => s.charAt(0).toLowerCase() + s.slice(1);
const formDist = (r, F) => (F < r[0] ? r[0] - F : F > r[1] ? F - r[1] : 0);
const noAbierto = clima => clima === "frio" || clima === "lluvia";

/* Una prenda "vista" desde un estilo: aplica los cambios de "por". */
function ver(it, estilo) { const o = it.por && it.por[estilo]; if (!o) return it; return { ...it, ...o, est: o.est != null ? { ...it.est, [estilo]: Math.max(it.est[estilo] || 0, o.est) } : it.est }; }

/* ¿Se puede usar? Reglas duras: clima, formalidad (con tolerancia) y condiciones del evento. */
function apta(it, ctx, tol) {
  if (it.cl && !it.cl.includes(ctx.clima)) return false;
  if (formDist(it.f, ctx.ev.f) > tol) return false;
  if (ctx.ev.practico && it.taco) return false;
  if (it.abierto && noAbierto(ctx.clima)) return false;
  if (it.dia && ctx.ev.noche) return false;
  if (it.noche && !ctx.ev.noche) return false;
  if (ctx.clima === "lluvia" && it.cat === "calzado" && !it.imper) return false;
  if (ctx.clima === "lluvia" && /gala|faldalarga|palazzo|tejido|wideleg/.test(it.id)) return false; // ruedos largos que se mojan
  return true;
}
function puntaje(it, ctx) {
  const af = it.est ? (it.est[ctx.estilo] || 0) : 0;
  let s = af * 10 - formDist(it.f, ctx.ev.f) * 7 - Math.abs((it.f[0] + it.f[1]) / 2 - ctx.ev.f) * 1.2;
  if (ctx.ev.practico && it.practico) s += 10;
  if (ctx.ev.noche && it.noche) s += 6;
  return s + azar(ctx.semilla, it.id) * 6;
}
/* Mejores candidatos de una categoría; si no hay, relaja la formalidad (nunca el clima). */
function candidatos(cat, ctx, filtro = () => true) {
  for (const tol of [0.6, 1.4, 2.5, 5]) {
    const l = CATALOGO.filter(i => i.cat === cat).map(i => ver(i, ctx.estilo)).filter(i => apta(i, ctx, tol) && filtro(i));
    if (l.length) return l.map(i => ({ it: i, s: puntaje(i, ctx) })).sort((a, b) => b.s - a.s);
  }
  return [];
}

/* ---------- color ---------- */
function colorDe(it, ctx, papel) {
  const P = ESTILOS[ctx.estilo].pal;
  let r = it.rol;
  if (typeof r === "object") return { hex: r.hex, nombre: r.nombre };
  if (r === "noche") r = ctx.ev.noche ? "acento" : "claro";
  if (papel === "top" && ctx.ev.noche && ctx.ev.f >= 4 && r !== "medio") r = "acento";
  if (papel === "abrigo" && ctx.clima === "frio" && r === "oscuro" && ctx.base === "oscuro") r = "medio";
  if (papel === "bottom" && ctx.colTop && r === ctx.colTop) r = r === "oscuro" ? "medio" : "oscuro";
  if (papel === "calzado" && ctx.clima === "calido" && r === "oscuro" && !ctx.ev.noche) r = "medio";
  const [hex, nombre] = P[r];
  return { hex, nombre, rol: r };
}

/* ---------- motor principal ---------- */
function generarLook(estilo, clima, evento, variante = 0) {
  const ev = EVENTOS[evento], ctx = { estilo, clima, evento, ev, semilla: `${estilo}|${clima}|${evento}|${variante}` };
  const E = ESTILOS[estilo];

  // 1) Base: vestido/enterito o top + inferior.
  const tops = candidatos("top", ctx).slice(0, 5), bots = candidatos("bottom", ctx).slice(0, 5);
  let mejorPar = null;
  for (const t of tops) for (const b of bots) {
    let s = (t.s + b.s) / 2;
    if (t.it.detalle && b.it.detalle) s -= 6;                // dos estampados compiten
    if (t.it.id === "crop" && b.it.tipo === "short") s -= 3;
    if (!mejorPar || s > mejorPar.s) mejorPar = { t: t.it, b: b.it, s };
  }
  const vest = candidatos("vestido", ctx)[0];
  const usaVestido = vest && (!mejorPar || vest.s + E.sesgoVestido + (azar(ctx.semilla, "v") - 0.5) * 6 > mejorPar.s);

  const piezas = [];
  const agregar = (it, papel, extra = {}) => { const c = colorDe(it, ctx, papel); const p = { it, papel, color: c, detalleHex: null, ...extra }; if (it.detalle) p.detalleHex = ESTILOS[estilo].pal[it.detalle === c.rol ? "oscuro" : it.detalle][0]; piezas.push(p); return p; };

  let top = null, bottom = null, vestido = null;
  if (usaVestido) { vestido = agregar(vest.it, "vestido"); ctx.base = vestido.color.rol; }
  else { top = agregar(mejorPar.t, "top"); ctx.colTop = top.color.rol; bottom = agregar(mejorPar.b, "bottom"); ctx.base = bottom.color.rol; }
  const piernasAlAire = vestido ? vestido.it.tipo !== "pantalon" : bottom.it.tipo !== "pantalon";

  // 2) Tercera prenda: obligatoria con frío o lluvia, liviana y opcional en templado, nunca con calor.
  let abrigo = null;
  if (clima !== "calido") {
    const req = clima === "frio" ? i => (i.calor || 0) >= 2 : clima === "lluvia" ? i => i.imper : () => true;
    const c = candidatos("abrigo", ctx, req)[0];
    if (c && (clima !== "templado" || c.s > 4 || ev.noche)) abrigo = agregar(c.it, "abrigo");
  }

  // 3) Calzado
  const calz = candidatos("calzado", ctx, i => !(vestido && vestido.it.id === "gala" && !i.taco && clima !== "lluvia"))[0];
  const calzado = agregar(calz.it, "calzado");

  // 4) Bolso
  const bolso = agregar(candidatos("bolso", ctx)[0].it, "bolso");

  // 5) Accesorios: máximo 2 (3 con frío por gorro/bufanda), sin repetir zona del cuerpo.
  const usados = new Set(), accs = [];
  const conCinto = vestido ? /camisero|mono|wrap/.test(vestido.it.id) === false && vestido.it.id !== "gala" : bottom.it.tipo !== "short" && top && !/corset|crop|halter|camisola/.test(top.it.id);
  const cands = candidatos("acc", ctx, i => !(i.cinto && !conCinto)).filter(c => (c.it.est[estilo] || 0) >= 1 || c.it.abriga);
  if (clima === "frio" && !(ev.f >= 4)) { const a = cands.find(c => c.it.abriga); if (a) { accs.push(a.it); usados.add(a.it.slot); } }
  const maxAcc = 2 + (accs.length ? 1 : 0);
  for (const c of cands) { if (accs.length >= maxAcc) break; if (usados.has(c.it.slot) || c.it.abriga) continue; accs.push(c.it); usados.add(c.it.slot); }
  const accesorios = accs.map(a => agregar(a, "acc"));

  // 6) Agregados de clima
  let medias = null, paraguas = null;
  if (piernasAlAire && (clima === "frio" || clima === "lluvia")) medias = agregar(POR_ID[ev.f >= 3 || clima === "lluvia" ? "medias" : "mediaslana"], "medias");
  if (clima === "lluvia") paraguas = agregar(POR_ID.paraguas, "paraguas");

  // Orden para la lista y los números de la imagen.
  const orden = ["top", "bottom", "vestido", "abrigo", "calzado", "bolso", "acc", "medias", "paraguas"];
  piezas.sort((a, b) => orden.indexOf(a.papel) - orden.indexOf(b.papel));
  piezas.forEach((p, i) => { p.n = i + 1; p.nombre = p.it.nombre; p.texto = `${p.it.nombre} en ${p.color.nombre}`; });

  // Nombre del look
  const v = hashStr(ctx.semilla);
  const nombre = `${ev.nombresLook[v % ev.nombresLook.length]} ${CLIMAS[clima].nombresLook[(v >>> 3) % CLIMAS[clima].nombresLook.length]}`;

  // Explicación (tres razones: estilo, clima, evento)
  const protagonista = vestido || [top, bottom, abrigo].find(p => p && p.color.rol === "acento") || (abrigo && clima === "frio" ? abrigo : top);
  const lc = p => p ? minus(p.texto) : "";
  const l = { protagonista: lc(protagonista), calzado: minus(calzado.it.nombre), bolso: minus(bolso.it.nombre) };
  const pal = ESTILOS[estilo].pal, colores = [...new Set(piezas.filter(p => p.color.rol && p.color.rol !== "metal").map(p => p.color.nombre))].slice(0, 3);
  const porEstilo = `${E.frase}: ${lc(protagonista)} marca el tono y la paleta de ${colores.length > 1 ? colores.slice(0, -1).join(", ") + " y " + colores[colores.length - 1] : colores[0]} une todo el conjunto.`;
  const telas = [...new Set([top, bottom, vestido].filter(Boolean).map(p => p.it.tela))];
  const yy = a => a.length > 1 ? a.slice(0, -1).join(", ") + " y " + a[a.length - 1] : a[0];
  let porClima;
  if (clima === "calido") porClima = `Con calor elegimos telas livianas (${yy(telas)}) y ${minus(calzado.it.nombre)} que dejan respirar; no hace falta tercera prenda.`;
  else if (clima === "templado") porClima = abrigo ? `El clima templado permite una capa liviana: ${minus(abrigo.it.nombre)} se pone o se saca según cambie la temperatura.` : `El clima templado no exige abrigo: ${yy(telas)} alcanzan para estar a gusto todo el día.`;
  else if (clima === "frio") porClima = `Contra el frío armamos capas: ${minus((vestido || top).it.nombre)} abajo y ${minus(abrigo.it.nombre)} arriba${medias ? ", más medias para cubrir las piernas" : ""}${accs.some(a => a.abriga) ? `, y ${minus(accs.find(a => a.abriga).nombre)} para cerrar el look` : ""}.`;
  else porClima = `Para la lluvia, ${minus(abrigo.it.nombre)} y ${minus(calzado.it.nombre)} no dejan pasar el agua, evitamos ruedos largos que se mojan y el paraguas plegable entra en el bolso.`;
  const porque = [porEstilo, porClima, ev.porque(l)];

  // Alternativa sin asumir preferencias: pantalón ↔ pollera/vestido.
  let alternativa = null;
  if (piernasAlAire) {
    const t = top ? top.it : (candidatos("top", ctx)[0] || {}).it;
    const p = candidatos("bottom", ctx, i => i.tipo === "pantalon")[0];
    if (t && p) alternativa = { titulo: "¿Preferís pantalón?", texto: `${vestido ? `Cambiá ${minus(vestido.it.nombre)} por ${minus(t.nombre)} con ${minus(p.it.nombre)}` : `Cambiá ${minus(bottom.it.nombre)} por ${minus(p.it.nombre)}`}; el resto del look queda igual.` };
  } else {
    const opc = [...candidatos("bottom", ctx, i => i.tipo === "pollera"), ...candidatos("vestido", ctx, i => i.tipo !== "pantalon")].sort((a, b) => b.s - a.s)[0];
    if (opc) {
      const actual = vestido ? minus(vestido.it.nombre) : `${minus(top.it.nombre)} y ${minus(bottom.it.nombre)}`;
      let cambio;
      if (opc.it.cat === "vestido") cambio = `Cambiá ${actual} por ${minus(opc.it.nombre)}`;
      else if (bottom) cambio = `Cambiá ${minus(bottom.it.nombre)} por ${minus(opc.it.nombre)}`;
      else { const t = (candidatos("top", ctx)[0] || {}).it; cambio = `Cambiá ${actual} por ${t ? minus(t.nombre) + " con " : ""}${minus(opc.it.nombre)}`; }
      alternativa = { titulo: opc.it.cat === "vestido" ? "¿Preferís vestido?" : "¿Preferís pollera?", texto: `${cambio}${noAbierto(clima) ? " y sumá medias" : ""}; el resto del look queda igual.` };
    }
  }

  return { estilo, clima, evento, variante, nombre, tag: E.tag, piezas, porque, alternativa,
    peinado: peinadoDe(estilo, clima, ev), maquillaje: maquillajeDe(estilo, clima, ev),
    sinAbrigo: !abrigo ? (clima === "calido" ? "Con calor no hace falta: el look respira mejor sin capas." : "No hace falta: el día templado se lleva bien sin capas extra.") : null };
}

/* ---------- peinado y maquillaje (sin asumir largo de pelo ni género) ---------- */
const PEINADOS_LOOK = {
  elegante: ["Coleta baja pulida con raya al medio; en pelo corto, peinado hacia atrás con un toque de gel.", "Rodete bajo bien pulido; en pelo corto, efecto mojado peinado hacia atrás."],
  casual: ["Suelto, con su textura natural, o una media cola despreocupada.", "Ondas suaves y sueltas; en pelo corto, un poco de crema para definir."],
  urbano: ["Trenzas boxer o coleta alta tirante; en pelo corto, textura despeinada con cera mate.", "Coleta alta tirante o trenzas; en pelo corto, textura con cera mate."],
  minimal: ["Raya al medio y bien lacio, o corto y prolijo, sin accesorios.", "Recogido bajo y simple; en pelo corto, peinado prolijo con raya marcada."],
  romantico: ["Ondas suaves con una media cola atada con moño; en pelo corto, ondas al costado con una hebilla.", "Recogido bajo con mechones sueltos que enmarcan la cara; en pelo corto, ondas al costado con una hebilla de perlas."],
  glam: ["Ondas grandes con volumen; en pelo corto, efecto mojado con brillo.", "Ondas de estilo Hollywood hacia un costado; en pelo corto, efecto mojado brillante."],
  deportivo: ["Coleta alta o trenzas firmes que no se muevan; en pelo corto, una vincha elástica.", "Coleta alta pulida; en pelo corto, peinado hacia atrás con gel."],
  boho: ["Trenzas sueltas u ondas al aire con mechones libres; en pelo corto, textura con spray de sal.", "Trenza al costado con mechones sueltos; en pelo corto, ondas con spray de sal."],
};
function peinadoDe(estilo, clima, ev) {
  let t = PEINADOS_LOOK[estilo][ev.f >= 3.2 ? 1 : 0];
  if (clima === "lluvia") t += " Con lluvia, sumá crema antifrizz y preferí un recogido.";
  else if (clima === "calido") t += " Con calor, un recogido despeja la nuca.";
  else if (clima === "frio" && !ev.noche) t += " Si usás gorro, dejá el peinado simple para que no se aplaste.";
  return t;
}
const MAQ = {
  elegante: ["Piel luminosa, máscara de pestañas y labios nude.", "Delineado fino y labios color ciruela."],
  casual: ["Piel fresca, protector solar y bálsamo con color.", "Máscara de pestañas y un rubor durazno."],
  urbano: ["Cejas peinadas y bálsamo; si querés, un delineado gráfico.", "Delineado gráfico y labios mate oscuros."],
  minimal: ["Efecto sin maquillaje: corrector puntual, cejas peinadas y bálsamo.", "Piel satinada y un solo punto de foco: labios o pestañas."],
  romantico: ["Rubor rosado, iluminador suave y labios rosa té.", "Ojos esfumados en malva y labios rosados."],
  glam: ["Iluminador en los pómulos y gloss.", "Sombra con brillo violeta o plateado, pestañas marcadas y labios definidos."],
  deportivo: ["Protector solar, bálsamo labial y, si querés, máscara a prueba de agua.", "Piel fresca y un toque de brillo en los párpados."],
  boho: ["Bronceador suave y labios terracota.", "Sombras cobrizas y labios terracota."],
};
function maquillajeDe(estilo, clima, ev) {
  let t = MAQ[estilo][ev.noche ? 1 : 0];
  if (clima === "lluvia" || (clima === "calido" && ev.practico)) t += " Mejor con fórmulas a prueba de agua.";
  if (!ev.noche && clima === "calido" && !/protector/.test(t)) t += " Sumá protector solar.";
  return t;
}

/* Dibujo plano de una pieza ya coloreada (string SVG en coordenadas de la librería). */
function svgPieza(p) { return prendaPlana({ dibujo: p.it.dibujo, colorHex: p.color.hex, detalleHex: p.detalleHex }); }
function prendaPlana(it) { const fn = DIBUJOS[it.dibujo]; return pintarPrenda(fn.perfil ? fn.perfil(it.colorHex, it) : fn(FLAT_D, it.colorHex, it), it.colorHex, fn.opts); }

if (typeof module !== "undefined") module.exports = { ESTILOS, CLIMAS, EVENTOS, CATALOGO, generarLook };
