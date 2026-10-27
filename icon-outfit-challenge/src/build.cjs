// Arma index.html (un solo archivo) a partir de src/: node src/build.cjs
const fs = require("fs"), path = require("path"), d = __dirname;
const leer = f => fs.readFileSync(path.join(d, f), "utf8");
const html = leer("app.html").replace("/*LIB*/", () => leer("lib-ilustracion.js")).replace("/*MOTOR*/", () => leer("motor.js")).replace("/*UI*/", () => leer("ui.js"));
fs.writeFileSync(path.join(d, "..", "index.html"), html);
console.log("index.html:", Math.round(html.length / 1024), "KB");
