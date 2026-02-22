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

  await upsertMany("usuario", usuarios);
  await upsertMany("producto", productos);
  await upsertMany("carrito", carritos);

  await pool.end();
}

main().catch((e) => {
  console.error("❌ Error importando:", e);
  process.exit(1);
});
