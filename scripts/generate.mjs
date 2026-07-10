// Genera el boletin jurisprudencial semanal del SJF (SCJN) como sitio estatico.
// Rastrea la semana en curso, lee la ficha de cada criterio (contexto minimo),
// clasifica por materia y escribe public/index.html + public/data.json.
//
// Uso: node scripts/generate.mjs
// Requiere: playwright (chromium). Pensado para correr en GitHub Actions.
// Diseno: BLINDADO v2 (barra lateral fija sin foto/cinta/recuadro; circulos
// numerados por materia y por organo; encabezado con recuadro de semana).

import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public");
const BASE = "https://sjfsemanal.scjn.gob.mx";
const DET = BASE + "/detalle/tesis/";
const SJF = BASE + "/busqueda-principal-tesis";
const LOGOS = JSON.parse(readFileSync(join(__dirname, "brand-logos.json"), "utf8"));

// ---------- Tablas de referencia ----------
const CIRC = {
I: "Ciudad de México", II: "Estado de México", III: "Jalisco", IV: "Nuevo León",
V: "Sonora", VI: "Puebla", VII: "Veracruz", VIII: "Coahuila", IX: "San Luis Potosí",
X: "Tabasco", XI: "Michoacán", XII: "Sinaloa", XIII: "Oaxaca", XIV: "Yucatán",
XV: "Baja California", XVI: "Guanajuato", XVII: "Chihuahua", XVIII: "Morelos",
XIX: "Tamaulipas", XX: "Chiapas", XXI: "Guerrero", XXII: "Querétaro",
XXIII: "Zacatecas", XXIV: "Nayarit", XXV: "Durango", XXVI: "Baja California Sur",
XXVII: "Quintana Roo", XXVIII: "Tlaxcala", XXIX: "Hidalgo", XXX: "Aguascalientes",
XXXI: "Campeche", XXXII: "Colima",
};
const ORD = {
"1o": "Primer", "2o": "Segundo", "3o": "Tercer", "4o": "Cuarto", "5o": "Quinto",
"6o": "Sexto", "7o": "Séptimo", "8o": "Octavo", "9o": "Noveno", "10o": "Décimo",
"11o": "Décimo Primer", "12o": "Décimo Segundo", "13o": "Décimo Tercer",
"14o": "Décimo Cuarto", "15o": "Décimo Quinto", "16o": "Décimo Sexto",
"17o": "Décimo Séptimo", "18o": "Décimo Octavo",
};
const REGION_CN =
"Circuitos: I Ciudad de México (penal y administrativo), II Estado de México, IV Nuevo León, " +
"V Sonora, VIII Coahuila, IX San Luis Potosí, XII Sinaloa, XV Baja California, XVI Guanajuato, " +
"XVII Chihuahua, XIX Tamaulipas, XXII Querétaro, XXIII Zacatecas, XXIV Nayarit, XXV Durango, " +
"XXVI Baja California Sur, XXVIII Tlaxcala y XXX Aguascalientes. Sede: Ciudad de México " +
"(Acuerdo General 108/2022 del Consejo de la Judicatura Federal).";

// Materias (buckets) y colores
const MATERIAS = [
{ num: 1, color: "#2a69de", nombre: "Constitucional y derechos fundamentales" },
{ num: 2, color: "#0e7c86", nombre: "Administrativo y fiscal" },
{ num: 3, color: "#9a2d3f", nombre: "Penal y justicia para adolescentes" },
{ num: 4, color: "#2e7d52", nombre: "Laboral y seguridad social" },
{ num: 5, color: "#6a3fb0", nombre: "Civil, familiar y perspectiva de género" },
{ num: 6, color: "#b5701f", nombre: "Amparo y cuestiones procesales" },
{ num: 7, color: "#5f6b1e", nombre: "Agrario y otras materias" },
];
const ONAME = { SCJN: "SCJN · Pleno", PR: "Plenos Regionales", TCC: "Tribunales Colegiados" };
const OANC = { SCJN: "org-scjn", PR: "org-pr", TCC: "org-tcc" };
const OCOL = { SCJN: "#2a69de", PR: "#0e7c86", TCC: "#5c6b7d" };

// ---------- Utilidades ----------
const esc = (s) =>
String(s || "")
.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
.replace(/"/g, "&quot;");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
function primerasFrases(txt, n) {
const t = clean(txt);
if (!t) return "";
const partes = t.split(/(?<=[.])\s+/);
return partes.slice(0, n).join(" ");
}
function recorta(txt, max = 420) {
const t = clean(txt);
if (t.length <= max) return t;
const corte = t.slice(0, max);
const i = corte.lastIndexOf(". ");
return (i > 120 ? corte.slice(0, i + 1) : corte.trim() + "…");
}

// Clasifica en bucket 1..7 a partir del campo "Materia(s)" de la ficha.
function bucketMateria(materias, rubro) {
const m = (materias || "").toLowerCase();
const r = (rubro || "").toLowerCase();
if (m.includes("agrari")) return 7;
if (m.includes("penal")) return 3;
if (m.includes("laboral") || m.includes("trabajo")) return 4;
if (m.includes("familiar")) return 5;
if (m.includes("civil")) return 5;
if (m.includes("fiscal") || m.includes("administrativ")) return 2;
if (m.includes("constitucional")) return 1;
// "Común" u otros: casi siempre son cuestiones de amparo/procesales.
if (m.includes("común") || m.includes("comun")) {
if (r.includes("agrari")) return 7;
return 6;
}
return 6;
}

// Deriva organo, obligatoriedad, ambito territorial y organo exacto.
function ambito(inst, clave, tipo, organoExacto) {
const instL = (inst || "").toLowerCase();
clave = clean(clave);
// SCJN Pleno
if (instL.includes("pleno") && !instL.includes("regional")) {
const org = organoExacto || "Pleno de la Suprema Corte de Justicia de la Nación";
return { org: "SCJN", org_badge: "SCJN · Pleno", oblig: true,
territorio: "todo el país", orgName: org,
ambito: `Obligatoria en todo el país (art. 217 Ley de Amparo). Órgano: ${org}.` };
}
// SCJN Salas
if (instL.includes("primera sala") || instL.includes("segunda sala")) {
const org = organoExacto || (instL.includes("primera") ?
"Primera Sala de la Suprema Corte de Justicia de la Nación" :
"Segunda Sala de la Suprema Corte de Justicia de la Nación");
return { org: "SCJN", org_badge: "SCJN · Sala", oblig: true,
territorio: "todo el país", orgName: org,
ambito: `Obligatoria en todo el país (art. 217 Ley de Amparo). Órgano: ${org}.` };
}
// Pleno Regional
if (instL.includes("regional")) {
const reg = regionDeClave(clave);
const org = organoExacto || "Pleno Regional";
return { org: "PR", org_badge: "Pleno Regional", oblig: true, region: reg,
territorio: reg, orgName: org,
ambito: `Obligatoria en la ${reg} (art. 217 Ley de Amparo). Órgano: ${org}.` };
}
// Tribunal Colegiado
const { circuito, estado, esCentroAux } = circuitoDeClave(clave);
const org = organoExacto || organoTCCdeClave(clave);
const territorio = esCentroAux ? circuito : `${circuito}${estado ? ", " + estado : ""}`;
if (tipo === "J") {
return { org: "TCC", org_badge: "Tribunal Colegiado", oblig: true,
territorio, orgName: org,
ambito: `Obligatoria en el ${territorio} (art. 217 Ley de Amparo). Órgano: ${org}.` };
}
return { org: "TCC", org_badge: "Tribunal Colegiado", oblig: false,
territorio, orgName: org,
ambito: `Orientadora (no obligatoria). Órgano: ${org} (${territorio}).` };
}

// "V Región" -> "Quinta Región" (regiones del Centro Auxiliar, ordinal femenino).
function regionCentroAuxSpelled(txt) {
const ORDF = { I: "Primera", II: "Segunda", III: "Tercera", IV: "Cuarta", V: "Quinta",
VI: "Sexta", VII: "Séptima", VIII: "Octava", IX: "Novena", X: "Décima",
XI: "Décima Primera", XII: "Décima Segunda" };
return String(txt || "").replace(/^([IVXL]+)\s+/i, (mm, rn) => (ORDF[rn.toUpperCase()] || rn) + " ");
}
function regionDeClave(clave) {
// PR.A.C.CN -> Centro-Norte, CS -> Centro-Sur, etc.
const m = clave.match(/PR\.[A-Z.]*?\.?(CN|CS|NO|NE|SE|SO|PC|CO)\b/);
const map = { CN: "Región Centro-Norte", CS: "Región Centro-Sur", NO: "Región Noroeste",
NE: "Región Noreste", SE: "Región Sureste", SO: "Región Suroeste", CO: "Región Centro" };
return (m && map[m[1]]) || "región correspondiente";
}
function romanoDeClave(clave) {
const m = clave.match(/^([IVXLC]+)\./);
return m ? m[1] : null;
}
function circuitoDeClave(clave) {
if (/^\(.*Regi[oó]n\)/i.test(clave)) {
const rm = clave.match(/\(([^)]*Regi[oó]n)\)/i);
const regTxt = rm ? regionCentroAuxSpelled(rm[1]) : "";
return { circuito: "Centro Auxiliar" + (regTxt ? ", " + regTxt : ""), estado: "", esCentroAux: true };
}
const rom = romanoDeClave(clave);
if (!rom) return { circuito: "circuito correspondiente", estado: "", esCentroAux: false };
const ordinalCirc = {
I: "Primer", II: "Segundo", III: "Tercer", IV: "Cuarto", V: "Quinto", VI: "Sexto",
VII: "Séptimo", VIII: "Octavo", IX: "Noveno", X: "Décimo", XI: "Décimo Primer",
XII: "Décimo Segundo", XIII: "Décimo Tercer", XIV: "Décimo Cuarto", XV: "Décimo Quinto",
XVI: "Décimo Sexto", XVII: "Décimo Séptimo", XVIII: "Décimo Octavo", XIX: "Décimo Noveno",
XX: "Vigésimo", XXI: "Vigésimo Primer", XXII: "Vigésimo Segundo", XXIII: "Vigésimo Tercer",
XXIV: "Vigésimo Cuarto", XXV: "Vigésimo Quinto", XXVI: "Vigésimo Sexto",
XXVII: "Vigésimo Séptimo", XXVIII: "Vigésimo Octavo", XXIX: "Vigésimo Noveno",
XXX: "Trigésimo", XXXI: "Trigésimo Primer", XXXII: "Trigésimo Segundo",
};
const nombre = (ordinalCirc[rom] || rom) + " Circuito";
return { circuito: nombre, estado: CIRC[rom] || "", esCentroAux: false };
}
function organoTCCdeClave(clave) {
// Ej: "II.3o.A. J/1 K" -> "Tercer Tribunal Colegiado en Materia Administrativa del Segundo Circuito"
if (/^\(.*Regi[oó]n\)/i.test(clave)) {
const rm = clave.match(/\(([^)]*Regi[oó]n)\)/i);
return "Tribunal Colegiado de Circuito del Centro Auxiliar de la " + (rm ? regionCentroAuxSpelled(rm[1]) : "región");
}
const { circuito } = circuitoDeClave(clave);
const mOrd = clave.match(/\.(\d+o)\./);
const ord = mOrd ? (ORD[mOrd[1]] || mOrd[1]) : "";
const mMat = clave.match(/\.\d+o\.([A-Z]+(?:\.[A-Z]+)*)/);
const mats = { A: "Materia Administrativa", C: "Materia Civil", P: "Materia Penal",
T: "Materia de Trabajo", "P.A": "Materias Penal y Administrativa",
"A.C": "Materias Administrativa y Civil", "C.T": "Materias Civil y de Trabajo",
"P.C": "Materias Penal y Civil" };
const letras = mMat ? mMat[1] : "";
const matName = mats[letras] || "";
const materiaFrag = matName ? ` en ${matName}` : "";
return `${ord} Tribunal Colegiado${materiaFrag} del ${circuito}`.replace(/\s+/g, " ").trim();
}

// ---------- Scraping ----------
function clickBuscar(page) {
return page.evaluate(() => {
const btns = [...document.querySelectorAll("button, a, input")];
const b = btns.find((e) => /(^|\s)buscar(\s|$)/i.test((e.innerText || e.value || "").trim()));
if (b) b.click();
return !!b;
});
}

function parseListado(txt, acc, vistos) {
const lines = txt.split(/\n/).map((l) => l.trim());
let i = 0;
while (i < lines.length) {
const m = lines[i].match(/Registro digital:\s*(\d{6,})/);
if (m) {
const reg = m[1];
// acumular rubro hasta la linea de localizacion
let j = i + 1;
const rubroLines = [];
let loc = null;
while (j < lines.length && j < i + 8) {
if (/;\s*12a\.?\s*Época;|;\s*11a\.?\s*Época;/i.test(lines[j])) { loc = lines[j]; break; }
if (lines[j]) rubroLines.push(lines[j]);
j++;
}
if (loc && !vistos.has(reg)) {
vistos.add(reg);
const parts = loc.split(";").map((p) => p.trim());
const orgRaw = parts[0] || "";
const clave = parts[3] || "";
const tipoTok = (parts[4] || "").trim().split(/\s+/)[0]; // J / TA
acc.push({ reg, rubro: clean(rubroLines.join(" ")), orgRaw, clave, tipo: tipoTok });
}
i = j + 1;
} else i++;
}
}

async function irSiguiente(page) {
return page.evaluate(() => {
const a = [...document.querySelectorAll("a,button")].find(
(e) => (e.innerText || "").trim().toLowerCase() === "next"
);
if (!a) return false;
const cls = (a.className || "") + " " + ((a.parentElement && a.parentElement.className) || "");
if (/disabled/i.test(cls)) return false;
a.click();
return true;
});
}
async function paginaActual(page) {
return page.evaluate(() => {
const m = (document.body.innerText || "").match(/P[aá]gina\s+(\d+)\s+de\s+(\d+)/i);
return m ? [parseInt(m[1]), parseInt(m[2])] : [1, 1];
});
}

function extraeFicha(txt) {
const g = (re) => { const m = txt.match(re); return m ? clean(m[1]) : ""; };
const materia = g(/Materia\(s\):\s*([^\n]+)/i);
const inst = g(/Instancia:\s*([^\n]+)/i);
const tipoF = g(/Tipo:\s*([^\n]+)/i);
const hechos = g(/Hechos:\s*([\s\S]*?)\n\s*(?:Criterio jur[ií]dico:|Criterio:)/i);
const criterio = g(/Criterio jur[ií]dico:\s*([\s\S]*?)\n\s*(?:Justificaci[oó]n:|PLENO|PRIMERA SALA|SEGUNDA SALA|TRIBUNAL|PLENO REGIONAL)/i);
// organo exacto: linea en mayusculas antes del precedente
let organo = "";
const mo = txt.match(/\n\s*(PLENO REGIONAL[^\n]+|PRIMER[AO][^\n]*TRIBUNAL COLEGIADO[^\n]+CIRCUITO[^\n]*|[A-ZÁÉÍÓÚÑ ]*TRIBUNAL COLEGIADO[^\n]+CIRCUITO[^\n]*|TRIBUNAL COLEGIADO DE CIRCUITO DEL CENTRO AUXILIAR[^\n]+)\n/);
if (mo) organo = clean(mo[1]).replace(/\.$/, "");
return { materia, inst, tipoF, hechos, criterio, organo };
}

async function main() {
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
page.setDefaultTimeout(45000);

console.log("Abriendo SJF…");
await page.goto(SJF, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const home = await page.evaluate(() => document.body.innerText);
const fm = home.match(/Actualizado al (viernes[^\n]*?\d{4})/i);
const semana = fm ? clean(fm[1]) : "";
console.log("Semana:", semana || "(no detectada)");

await clickBuscar(page);
await page.waitForURL(/listado-resultado-tesis/, { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(2500);

const registros = [];
const vistos = new Set();
let guard = 0;
while (guard++ < 40) {
await page.waitForTimeout(1200);
const txt = await page.evaluate(() => document.body.innerText);
parseListado(txt, registros, vistos);
const [cur, tot] = await paginaActual(page);
if (cur >= tot) break;
const ok = await irSiguiente(page);
if (!ok) break;
}
console.log("Criterios recopilados:", registros.length);
if (registros.length === 0) throw new Error("No se recopilaron criterios (revisar selectores/semana).");

// Fichas
for (const r of registros) {
try {
await page.goto(DET + r.reg, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1400);
const txt = await page.evaluate(() => document.body.innerText);
const f = extraeFicha(txt);
r.materiaField = f.materia;
r.inst = f.inst;
// tipo: preferir el del listado; si no, de la ficha
if (!r.tipo) r.tipo = /aislada/i.test(f.tipoF) ? "TA" : "J";
const contexto = [primerasFrases(f.hechos, 1), primerasFrases(f.criterio, 2)]
.filter(Boolean).join(" ");
r.resuelve = recorta(contexto || f.criterio || r.rubro, 430);
const a = ambito(f.inst, r.clave, r.tipo, f.organo);
Object.assign(r, a);
r.bucket = bucketMateria(f.materia, r.rubro);
} catch (e) {
console.log("Ficha con error", r.reg, e.message);
const a = ambito("", r.clave, r.tipo, "");
Object.assign(r, a);
r.resuelve = clean(r.rubro);
r.bucket = bucketMateria("", r.rubro);
}
}
await browser.close();

// Modelo por materia
const materias = MATERIAS.map((m) => ({ ...m, crit: registros.filter((r) => r.bucket === m.num) }))
.filter((m) => m.crit.length > 0);

const html = construyeHTML(materias, semana);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), html, "utf8");
writeFileSync(join(OUT, "data.json"),
JSON.stringify({ semana, generado: new Date().toISOString(), registros }, null, 2), "utf8");
console.log("Listo: public/index.html (", registros.length, "criterios )");
}

// ---------- Generacion HTML (DISENO BLINDADO v2) ----------
function construyeHTML(materias, semana) {
const all = materias.flatMap((m) => m.crit);
const tot = all.length;
const juris = all.filter((c) => c.tipo === "J").length;
const aisl = tot - juris;
const nOrg = (o) => all.filter((c) => c.org === o).length;
const semanaTxt = semana || "de la semana en curso";

// Materias donde aparece cada organo (para los circulos numerados de la barra)
const orgIn = { SCJN: [], PR: [], TCC: [] };
for (const m of materias)
for (const o of ["SCJN", "PR", "TCC"])
if (m.crit.some((c) => c.org === o)) orgIn[o].push(m);

const CSS = `
*{box-sizing:border-box}
html{scroll-behavior:auto}
body{margin:0;background:#eef1f6;font-family:Raleway,'Segoe UI',Arial,sans-serif;color:#26303c}
a{text-decoration:none}
.layout{max-width:1180px;margin:0 auto;position:relative}
/* Sidebar */
.side{position:fixed;top:0;left:calc(50% - 590px);width:270px;height:100vh;overflow:hidden;background:#061127;color:#fff;padding:14px 16px 14px}
.side::-webkit-scrollbar{width:0;height:0;display:none}.side::-webkit-scrollbar-thumb{background:#2b3d55;border-radius:8px}
.side .brand{font-family:Georgia,serif;font-size:20px;font-weight:700;color:#fff;line-height:1.1}
.side .brand .amp{color:#5b93ff}
.side .tag{font-size:9px;letter-spacing:1.5px;color:#9fb3d1;margin-top:3px;text-transform:uppercase}
.side .rib{background:#2a69de;color:#fff;font-size:10px;letter-spacing:2px;text-align:center;padding:6px;border-radius:5px;margin:12px 0;font-weight:600}
.side .snum{font-size:11px;color:#9fb3d1;background:#16273b;border-radius:6px;padding:8px 10px;margin-bottom:14px;line-height:1.5}
.side .snum b{color:#fff}
.side h4{font-size:10px;letter-spacing:1.5px;color:#7f93b3;margin:11px 0 6px;text-transform:uppercase;border-bottom:1px solid #24374f;padding-bottom:4px}
.side .nav a{display:block;color:#cdd8e6;font-size:12.5px;padding:5px 8px;border-radius:6px;margin-bottom:2px;line-height:1.3}
.side .nav a:hover{background:#16273b;color:#fff}
.side .nav a.active{background:#1c3350;color:#fff;font-weight:600}
.side .nav a .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle}
.side .nav a .ct{float:right;color:#7f93b3;font-size:11px}
.side .orgnav a{display:block;color:#9fb3d1;font-size:11.5px;padding:4px 8px;border-radius:6px}
.side .orgnav a:hover{background:#16273b;color:#fff}
.side .sjf{display:block;text-align:center;background:#2a69de;color:#fff;border-radius:16px;padding:8px;font-size:11.5px;font-weight:600;margin-top:12px}
/* Main */
.main{margin-left:calc(50% - 590px + 270px);width:calc(1180px - 270px);max-width:900px;background:#fff;min-height:100vh}
.mtop{background:#061127;padding:26px 34px}
.mtop .h{font-size:22px;font-weight:700;color:#fff}
.mtop .s{font-size:12px;color:#9fb3d1;margin-top:4px}
.bd{padding:24px 34px 6px}
.h1{font-size:19px;font-weight:700;color:#061127}
.lead{margin:8px 0 14px;font-size:14px;line-height:1.55}
.chip{display:inline-block;background:#f7f9fc;border:1px solid #e4e8ee;border-radius:16px;padding:6px 14px;font-size:12px;color:#061127;font-weight:600}
.box{margin:18px 0 6px;background:#f7f9fc;border-left:4px solid #2a69de;border-radius:0 6px 6px 0;padding:14px 16px}
.box .t{font-size:11px;letter-spacing:1.5px;color:#2a69de;font-weight:700;margin-bottom:6px}
.box ul{margin:0;padding-left:18px;font-size:13px;line-height:1.55}
.msec{padding:22px 34px 4px}
.bar{background:#061127;border-radius:6px;padding:11px 15px;color:#fff;font-size:16px;font-weight:700;scroll-margin-top:14px}
.bn{display:inline-block;width:27px;height:27px;border-radius:50%;text-align:center;line-height:27px;font-size:14px;margin-right:9px}
.osub{margin:15px 0 7px;padding-left:11px;scroll-margin-top:14px}
.osl{font-size:12.5px;font-weight:700;letter-spacing:.5px}
.men{color:#8894a4;font-size:11px}
.reg{background:#f7f9fc;border:1px dashed #0e7c86;border-radius:6px;padding:11px 13px;margin-bottom:10px;font-size:12px;line-height:1.5}
.card{border:1px solid #e4e8ee;border-radius:9px;padding:14px 16px;margin-bottom:12px}
.bg{display:inline-block;border-radius:9px;padding:2px 9px;font-size:10px;font-weight:700;margin-right:4px}
.bj{background:#e3ecff;color:#2a69de}.ba{background:#f0f0f2;color:#6b7280}
.bo1{background:#eaf1ff;color:#2a69de;font-weight:600}.bo2{background:#e3f4f5;color:#0e7c86;font-weight:600}.bo3{background:#eef0f2;color:#5c6b7d;font-weight:600}
.ru{font-size:13.5px;font-weight:700;color:#061127;line-height:1.45;margin-top:8px}
.qr{font-size:13px;margin:8px 0 10px;line-height:1.5}
.qr b{color:#2a69de}
.ob1{font-size:12px;color:#1c7a43;background:#eaf7ef;border-radius:5px;padding:7px 10px}
.ob2{font-size:12px;color:#5c6b7d;background:#f4f5f7;border-radius:5px;padding:7px 10px}
.ft{margin-top:9px;padding-top:9px;border-top:1px solid #e4e8ee;font-size:11.5px;color:#8894a4;overflow:hidden}
.ft a{color:#2a69de;font-weight:600;float:right}
.foot{background:#061127;padding:22px 34px;text-align:center}
.foot .m{font-family:Georgia,serif;font-size:19px;font-weight:700;color:#fff}
.foot .m .amp{color:#5b93ff}
.foot .d{font-size:11.5px;color:#9fb3d1;margin-top:3px}
.hr{border-top:1px solid #24374f;margin:12px 0}
.avz{font-size:10.5px;color:#7f93b3;line-height:1.6;text-align:left}
.avz b{color:#9fb3d1}
.mobtoggle{display:none}
/* Responsive */
@media(max-width:1180px){
 .side{left:0}
 .main{margin-left:270px;width:calc(100% - 270px);max-width:none}
}
@media(max-width:820px){
 .side{transform:translateX(-100%);transition:transform .25s;z-index:50;box-shadow:4px 0 18px rgba(0,0,0,.3);width:255px}
 body.nav-open .side{transform:translateX(0)}
 .main{margin-left:0;width:100%}
 .mobtoggle{display:inline-flex;align-items:center;gap:8px;position:fixed;top:12px;left:12px;z-index:60;background:#2a69de;color:#fff;border:none;border-radius:8px;padding:9px 13px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}
 .mtop{padding-top:58px}
 .backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:40}
 body.nav-open .backdrop{display:block}
}
.amt{font-size:12px;color:#26303c;background:#f2f5fb;border-radius:5px;padding:7px 10px}.side .orgnav .orow{padding:4px 8px}.side .orgnav .ol{display:block;color:#cdd8e6;font-size:12px;font-weight:600;margin-bottom:4px}.side .orgnav .ol em{color:#7f93b3;font-style:normal;font-weight:600;font-size:11px}.side .orgnav .ocir{display:flex;flex-wrap:wrap;gap:5px}.side .orgnav .ndot{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,.3)}.side .orgnav .ndot:hover{opacity:.85;transform:scale(1.08)}.side .nav a .ndotm{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;margin-right:8px;vertical-align:middle;color:#fff;font-size:11px;font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,.3)}.mtop{display:flex;justify-content:space-between;align-items:flex-start;gap:22px}.mtop-l{flex:1;min-width:0}.mtop-r{flex:0 0 auto;text-align:right;font-size:11.5px;color:#9fb3d1;background:#0d1f38;border:1px solid #1c3350;border-radius:8px;padding:9px 13px;line-height:1.55;white-space:nowrap}.mtop-r b{color:#fff}@media(max-width:640px){.mtop{flex-direction:column;gap:12px}.mtop-r{text-align:left;white-space:normal}}`;

const P = [];
const a = (s) => P.push(s);
a(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Boletin jurisprudencial semanal del despacho Medina & Alatorre: tesis y jurisprudencias de la SCJN por materia."><meta name="robots" content="index,follow"><meta property="og:title" content="Boletin Jurisprudencial Semanal - Medina & Alatorre"><meta property="og:type" content="website"><title>Boletín Jurisprudencial SJF — ${esc(semanaTxt)}</title><style>${CSS}</style></head><body>`);
a(`<button class="mobtoggle" onclick="document.body.classList.toggle('nav-open')">☰ Índice</button><div class="backdrop" onclick="document.body.classList.remove('nav-open')"></div><div class="layout">`);

// --- Barra lateral v2 (sin foto, sin cinta, sin recuadro de semana) ---
a(`<aside class="side"><h4>Por materia</h4><nav class="nav">`);
for (const m of materias)
a(`<a href="#m${m.num}" data-target="m${m.num}"><span class="ndotm" style="background:${m.color}">${m.num}</span>${esc(m.nombre)}<span class="ct">${m.crit.length}</span></a>`);
a(`</nav><h4>Por órgano</h4><nav class="orgnav">`);
for (const o of ["SCJN", "PR", "TCC"]) {
if (!orgIn[o].length) continue;
a(`<div class="orow"><span class="ol">${esc(ONAME[o])} <em>(${nOrg(o)})</em></span><span class="ocir">`);
for (const m of orgIn[o])
a(`<a class="ndot" style="background:${m.color}" href="#m${m.num}">${m.num}</a>`);
a(`</span></div>`);
}
a(`</nav><a class="sjf" href="${SJF}" target="_blank" rel="noopener">Abrir el SJF →</a></aside>`);

// --- Encabezado v2 (wordmark + titulo a la izquierda; recuadro de semana a la derecha) ---
a(`<main class="main"><div class="mtop"><div class="mtop-l"><img src="${LOGOS.top}" alt="Medina & Alatorre" style="height:30px;display:block;margin-bottom:12px"><div class="h">Boletín Jurisprudencial Semanal</div><div class="s">Semanario Judicial de la Federación · Semana del ${esc(semanaTxt)}</div></div><div class="mtop-r">Semana del <b>${esc(semanaTxt)}</b><br>${tot} criterios · ${juris} jurisprudencia · ${aisl} aisladas</div></div>`);
a(`<div class="bd"><div class="h1">Buen día 👋</div><p class="lead">Le compartimos las tesis y jurisprudencias que la SCJN publicó esta semana en el Semanario Judicial de la Federación, organizadas por materia. Use la barra lateral para navegar entre secciones en todo momento.</p><span class="chip">📅 Semana del ${esc(semanaTxt)}</span></div>`);

// --- Secciones por materia ---
const anchorPuesto = { SCJN: false, PR: false, TCC: false };
for (const m of materias) {
a(`<section class="msec" id="m${m.num}"><div class="bar"><span class="bn" style="background:${m.color}">${m.num}</span>${esc(m.nombre)} <span style="color:#9fb3d1;font-weight:400;font-size:13px">(${m.crit.length})</span></div>`);
for (const o of ["SCJN", "PR", "TCC"]) {
const cr = m.crit.filter((c) => c.org === o);
if (!cr.length) continue;
const sc = OCOL[o];
const idAttr = anchorPuesto[o] ? "" : ` id="${OANC[o]}"`;
anchorPuesto[o] = true;
a(`<div class="osub" style="border-left:4px solid ${sc}"${idAttr}><table width="100%"><tr><td class="osl" style="color:${sc}">${esc(ONAME[o])} <span style="color:#8894a4;font-weight:400">(${cr.length})</span></td></tr></table></div>`);
if (o === "PR") a(`<div class="reg"><b>Integración de la Región Centro-Norte:</b> ${esc(REGION_CN)}</div>`);
for (const c of cr) {
const tj = c.tipo === "J" ? "bj" : "ba";
const tl = c.tipo === "J" ? "JURISPRUDENCIA" : "AISLADA";
const ob = o === "SCJN" ? "bo1" : o === "PR" ? "bo2" : "bo3";
const territorio = c.territorio || "";
const orgName = c.orgName || c.org_badge || "";
a(`<div class="card"><div><span class="bg ${tj}">${tl}</span><span class="bg ${ob}">${esc(c.org_badge)}</span></div><div class="ru">${esc(c.rubro)}</div><div class="qr"><b>¿Qué resuelve?</b> — ${esc(c.resuelve)}</div>`);
a(`<div class="amt">📍 Ámbito territorial: ${esc(territorio)}. Órgano: ${esc(orgName)}.</div>`);
a(`<div class="ft">${esc(c.clave)} · Reg. ${esc(c.reg)} <a href="${DET}${esc(c.reg)}" target="_blank" rel="noopener">Consultar →</a></div></div>`);
}
}
a(`</section>`);
}

// --- Pie v2 ---
a(`<div class="foot"><img src="${LOGOS.mono}" alt="M&A" style="height:28px;display:inline-block;opacity:.92"><div class="d">Medina &amp; Alatorre · Abogados · Guadalajara, Jalisco · contacto@abogadosmya.com</div><div class="hr"></div><div class="avz"><b>Fuente:</b> Semanario Judicial de la Federación, SCJN — publicación de la ${esc(semanaTxt)} (sjfsemanal.scjn.gob.mx).<br><b>Aviso:</b> Boletín de apoyo con fines informativos. No sustituye el texto íntegro de las tesis ni el criterio profesional; para cada caso concreto consulte la ficha oficial. Las tesis aisladas son orientadoras y no vinculantes.</div></div></main></div>`);

// --- Script scroll-spy + cierre de menu movil ---
a(`<script>var links=[].slice.call(document.querySelectorAll('.side .nav a'));var secs=links.map(function(l){return document.getElementById(l.getAttribute('data-target'));});function spy(){var y=window.scrollY+120,idx=0;for(var i=0;i<secs.length;i++){if(secs[i]&&secs[i].offsetTop<=y)idx=i;}links.forEach(function(l,i){l.classList.toggle('active',i===idx);});}window.addEventListener('scroll',spy,{passive:true});window.addEventListener('load',spy);[].slice.call(document.querySelectorAll('.side a')).forEach(function(l){l.addEventListener('click',function(){document.body.classList.remove('nav-open');});});</script>`);
a(`</body></html>`);
return P.join("");
}

export { construyeHTML, ambito, bucketMateria, circuitoDeClave, organoTCCdeClave, regionDeClave };

// Ejecuta el rastreo solo cuando se invoca directamente (permite importar para pruebas).
const invocadoDirecto =
process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocadoDirecto) {
main().catch((e) => { console.error("Error:", e); process.exit(1); });
}
