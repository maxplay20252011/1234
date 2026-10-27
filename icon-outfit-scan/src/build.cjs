// Arma index.html (un solo archivo): node src/build.cjs
// Comparte la librería de ilustración, el motor y la interfaz con ../icon-outfit-challenge/src.
const fs = require("fs"), path = require("path"), d = __dirname, comun = path.join(d, "..", "..", "icon-outfit-challenge", "src");
const leer = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
const html = leer(d, "app.html")
  .replace("/*LIB*/", () => leer(comun, "lib-ilustracion.js")).replace("/*MOTOR*/", () => leer(comun, "motor.js"))
  .replace("/*UI*/", () => leer(comun, "ui.js")).replace("/*LECTOR*/", () => leer(d, "lector.js"));
fs.writeFileSync(path.join(d, "..", "index.html"), html);
console.log("index.html:", Math.round(html.length / 1024), "KB");
