// C:\Farmacia2026\Farmacia-2.0\backend\import-dbjson.js

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DB_JSON_PATH = path.resolve(__dirname, "..", "db.json");

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "farmacia_db",
  user: "farmacia",
  password: "farmacia123",
});

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* =========================
   ✅ Ensure Tables
========================= */

async function ensureJsonTable(name) {
  // tablas: usuario, producto, carrito (id + data jsonb)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${name} (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function ensureCategoriasTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categorias (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_categorias_nombre ON categorias (nombre);`);
}

/* =========================
   ✅ Upsert JSON tables
========================= */

async function upsertMany(table, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const r of rows) {
      if (!r) continue;
      const id = Number(r.id);
      if (!Number.isFinite(id)) continue;

      await client.query(
        `INSERT INTO ${table} (id, data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [id, r]
      );
    }

    await client.query("COMMIT");
    console.log(`✅ ${table}: ${rows.length} filas importadas (upsert).`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function upsertCategoriasDesdeProductos(productos) {
  // saca categorías únicas desde producto.data.categoria (o categoria)
  const set = new Map(); // slug -> nombre

  for (const p of productos) {
    const cat = String(p?.categoria ?? "").trim();
    if (!cat) continue;

    const slug = slugify(cat);
    if (!slug) continue;

    if (!set.has(slug)) set.set(slug, cat);
  }

  // defaults por si viene vacío db.json
  if (!set.has("medicamentos")) set.set("medicamentos", "Medicamentos");
  if (!set.has("cremas")) set.set("cremas", "Cremas");
  if (!set.has("perfumes")) set.set("perfumes", "Perfumes");

  const cats = [...set.entries()].map(([slug, nombre]) => ({ slug, nombre }));

  for (const c of cats) {
    await pool.query(
      `INSERT INTO categorias (slug, nombre)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [c.slug, c.nombre]
    );
  }

  console.log(`✅ categorias: ${cats.length} categorías (insert/ignore).`);
}

/* =========================
   ✅ Main
========================= */

async function main() {
  const raw = fs.readFileSync(DB_JSON_PATH, "utf-8");
  const db = JSON.parse(raw);

  console.log("Keys en db.json:", Object.keys(db));

  const usuarios = asArray(db.usuario);
  const productos = asArray(db.producto);
  const carritos = asArray(db.carrito);

  console.log("Counts:", {
    usuario: usuarios.length,
    producto: productos.length,
    carrito: carritos.length,
  });

  // ✅ crea TODAS las tablas necesarias
  await ensureJsonTable("usuario");
  await ensureJsonTable("producto");
  await ensureJsonTable("carrito");
  await ensureCategoriasTable();

  // ✅ carga categorías desde productos (antes del upsert)
  await upsertCategoriasDesdeProductos(productos);

  // ✅ importa datos
  await upsertMany("usuario", usuarios);
  await upsertMany("producto", productos);
  await upsertMany("carrito", carritos);

  await pool.end();
}

main().catch((e) => {
  console.error("❌ Error importando:", e);
  process.exit(1);
});
