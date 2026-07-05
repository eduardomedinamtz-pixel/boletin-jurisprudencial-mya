# Boletín Jurisprudencial Semanal — Medina & Alatorre

Sitio de **una sola página** que muestra las tesis y jurisprudencias que la SCJN
publica cada semana en el **Semanario Judicial de la Federación (SJF)**,
organizadas por materia y con el contexto de cada criterio. Se **regenera y
publica solo cada viernes** mediante GitHub Actions + Netlify.

- **Sitio en vivo:** https://boletin-jurisprudencial-mya.netlify.app
- **Página:** `public/index.html` (se sobrescribe automáticamente cada semana)
- **Generador:** `scripts/generate.mjs` (Playwright rastrea el SJF y arma el HTML)
- **Automatización:** `.github/workflows/weekly.yml` (cron: viernes 19:00 UTC ≈ 13:00 Guadalajara)

## Cómo funciona

1. Cada viernes, GitHub Actions ejecuta `node scripts/generate.mjs`.
2. El script abre el SJF, confirma la semana en curso, recopila **todos** los
   criterios, entra a la ficha de cada uno para extraer el contexto (Hechos +
   Criterio jurídico), determina órgano y obligatoriedad, clasifica por materia y
   escribe `public/index.html` y `public/data.json`.
3. El Action comitea los cambios; **Netlify** (conectado a este repo) detecta el
   push y **publica** la nueva versión.

## Puesta en marcha (una sola vez)

### 1) Subir el repositorio a GitHub
```bash
git init
git add .
git commit -m "Boletin SJF: version inicial"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/boletin-jurisprudencial-mya.git
git push -u origin main
```

### 2) Conectar Netlify a este repositorio
Ya existe el proyecto **boletin-jurisprudencial-mya** en tu cuenta de Netlify
(URL: `boletin-jurisprudencial-mya.netlify.app`). Conéctalo al repo:

- Netlify → tu proyecto **boletin-jurisprudencial-mya** → **Site configuration →
  Build & deploy → Link repository** (o "Import from Git") y elige este repo.
- **Publish directory:** `public`
- **Build command:** *(vacío)*
- Rama de producción: `main`

> Si prefieres crear el sitio desde cero: Netlify → **Add new site → Import an
> existing project → GitHub →** este repo, con los mismos ajustes de arriba.

A partir de ahí, cada push (incluidos los del robot semanal) publica solo.

### 3) Verificar la automatización
- GitHub → pestaña **Actions** → workflow **"Boletin SJF semanal"** →
  **Run workflow** para probarlo manualmente.
- Debe generar `public/index.html`, comitearlo y disparar el deploy de Netlify.

## Ajustes útiles

- **Horario:** cambia el `cron` en `.github/workflows/weekly.yml`.
- **Clasificación por materia:** función `bucketMateria()` en `scripts/generate.mjs`.
- **Contexto ("¿Qué resuelve?"):** se arma con la primera frase de *Hechos* y las
  dos primeras de *Criterio jurídico* de la ficha oficial (no inventa; parafrasea
  del texto fuente). Ajusta el largo en `recorta()`.
- **Diseño/marca:** función `construyeHTML()` (paleta y tipografía Medina & Alatorre).

## Notas
- El SJF es una aplicación con JavaScript; por eso el generador usa un navegador
  headless (Playwright/Chromium), que en GitHub Actions funciona sin problema.
- `public/index.html` viene **precargado** con el boletín de la semana del
  viernes 3 de julio de 2026, de modo que el sitio funciona desde el primer deploy,
  antes del primer corrido automático.
- Aviso legal: material de apoyo; no sustituye el texto íntegro de las tesis ni el
  criterio profesional. Las tesis aisladas son orientadoras y no vinculantes.
