// C:\Farmacia2026\Farmacia-2.0\backend\server.js

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());

// ⚠️ soporte imágenes base64 grandes
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// ✅ LOG de requests (para pillar 500 altiro)
app.use((req, _res, next) => {
  console.log(`\n>>> ${req.method} ${req.url}`);
  next();
});

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "farmacia_db",
  user: "farmacia",
  password: "farmacia123",
});

/* =========================
   ✅ Error helper (PG details)
========================= */
function sendPgError(res, where, e) {
  console.error(`${where} ERROR:`, e);
  return res.status(500).json({
    ok: false,
    where,
    error: e?.message || "Error interno",
    detail: e?.detail || null,
    code: e?.code || null,
    constraint: e?.constraint || null,
    table: e?.table || null,
    column: e?.column || null,
  });
}

/* =========================
   ✅ Ensure tables on boot
========================= */
async function ensureJsonTable(name) {
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
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_categorias_nombre ON categorias (nombre);`
  );
}

async function ensureTables() {
  await ensureJsonTable("usuario");
  await ensureJsonTable("producto");
  await ensureJsonTable("carrito");
  await ensureCategoriasTable();
}

/* =========================
   Helpers
========================= */
function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ✅ canonical único (ROBUSTO)
function canonCat(raw) {
  const s = slugify(raw); // ✅ clave: normaliza de verdad
  if (!s) return "";
  if (s === "medicamentos") return "medicamento";
  if (s === "medicamento") return "medicamento";
  if (s.includes("med")) return "medicamento"; // ✅ opcional: cualquier "med..." -> medicamento
  return s;
}

function labelCat(slug) {
  const s = canonCat(slug);
  if (s === "medicamento") return "Medicamentos";
  if (s === "cremas") return "Cremas";
  if (s === "perfumes") return "Perfumes";
  return s;
}

function pickImagen(body) {
  const url = body.imagen ?? body.imagen_url ?? body.imagenUrl ?? "";
  const b64 = body.imagenBase64 ?? body.imagen_base64 ?? body.imagenB64 ?? "";
  return b64
    ? { imagen_base64: String(b64) }
    : url
    ? { imagen_url: String(url) }
    : {};
}

function normalizarProducto(data, id) {
  const precioNormal = toNumber(data.precioNormal ?? data.precio ?? 0, 0);
  const promoActiva = !!(data.promoActiva ?? data.promo_activa ?? false);
  const precioPromo = promoActiva
    ? toNumber(data.precioPromo ?? data.precio_promo ?? 0, 0)
    : 0;

  const stock = toNumber(data.stock ?? 0, 0);

  // ✅ CANONICAL: solo medicamento
  const categoria = canonCat(data.categoria ?? "");

  // ✅ SIEMPRE string para el front
  const imagen =
    data.imagen_base64 ||
    data.imagenBase64 ||
    data.imagen_url ||
    data.imagenUrl ||
    data.imagen ||
    "";

  return {
    ...data,
    categoria, // ✅ ya normalizada
    stock,
    precioNormal,
    promoActiva,
    precioPromo,
    // compat antigua
    precio: precioNormal,
    imagen,
    id,
  };
}

/* =========================
   Health
========================= */
app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT now()");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    return sendPgError(res, "GET /health", e);
  }
});

/* =========================
   Usuario
========================= */

// ✅ LISTAR usuarios
app.get("/usuario", async (_req, res) => {
  try {
    const r = await pool.query("SELECT data FROM usuario ORDER BY id ASC");
    res.json(r.rows.map((x) => x.data));
  } catch (e) {
    return sendPgError(res, "GET /usuario", e);
  }
});

// ✅ OBTENER usuario por ID
app.get("/usuario/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const r = await pool.query("SELECT data FROM usuario WHERE id = $1", [id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    res.json(r.rows[0].data);
  } catch (e) {
    return sendPgError(res, "GET /usuario/:id", e);
  }
});

// ✅ ACTUALIZAR usuario (parcial)
app.patch("/usuario/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch = req.body || {};

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const r = await pool.query("SELECT data FROM usuario WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    const current = r.rows[0].data || {};
    const updated = { ...current, ...patch };

    const u = await pool.query(
      "UPDATE usuario SET data = $1 WHERE id = $2 RETURNING data",
      [updated, id]
    );

    return res.json(u.rows[0].data);
  } catch (e) {
    return sendPgError(res, "PATCH /usuario/:id", e);
  }
});

// ✅ ELIMINAR usuario por ID
app.delete("/usuario/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }

    const r = await pool.query(
      "DELETE FROM usuario WHERE id = $1 RETURNING id",
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    return res.json({ ok: true, deletedId: id });
  } catch (e) {
    return sendPgError(res, "DELETE /usuario/:id", e);
  }
});

/* =========================
   Categorías
========================= */

// ✅ LISTAR categorías (con fallback si está vacío)
app.get("/categorias", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, slug, nombre FROM categorias ORDER BY nombre ASC"
    );

    // ✅ fallback canonico (solo medicamento)
    if (!r.rows.length) {
      return res.json([
        { id: 1, slug: "medicamento", label: "Medicamentos", nombre: "Medicamentos" },
        { id: 2, slug: "cremas", label: "Cremas", nombre: "Cremas" },
        { id: 3, slug: "perfumes", label: "Perfumes", nombre: "Perfumes" },
      ]);
    }

    // ✅ normaliza slugs al responder + dedup
    const map = new Map();
    r.rows.forEach((c) => {
      const slug = canonCat(c.slug);
      if (!slug) return;
      const label = labelCat(slug) || c.nombre;
      // guarda uno por slug
      if (!map.has(slug)) {
        map.set(slug, {
          id: c.id,
          slug,
          label,
          nombre: label,
        });
      }
    });

    return res.json(Array.from(map.values()));
  } catch (e) {
    return sendPgError(res, "GET /categorias", e);
  }
});

// ✅ CREAR categoría { nombre }
app.post("/categorias", async (req, res) => {
  try {
    const body = req.body || {};
    const nombre = String(body.nombre ?? "").trim();

    if (nombre.length < 2) {
      return res.status(400).json({ ok: false, error: "nombre inválido" });
    }

    let slug = slugify(body.slug ?? nombre);
    if (!slug) slug = "categoria";

    // ✅ FORZAR canonical
    slug = canonCat(slug);

    // si intentan crear Medicamentos, siempre será "medicamento"
    const nombreFinal = slug === "medicamento" ? "Medicamentos" : nombre;

    // si ya existe, devolvemos la existente (no crear duplicado)
    const ex = await pool.query("SELECT id, slug, nombre FROM categorias WHERE slug = $1", [slug]);
    if (ex.rows.length) {
      const row = ex.rows[0];
      const slugOut = canonCat(row.slug);
      const label = labelCat(slugOut) || row.nombre;
      return res.status(200).json({ id: row.id, slug: slugOut, nombre: label, label });
    }

    const r = await pool.query(
      "INSERT INTO categorias (slug, nombre) VALUES ($1, $2) RETURNING id, slug, nombre",
      [slug, nombreFinal]
    );

    const slugOut = canonCat(r.rows[0].slug);
    const label = labelCat(slugOut) || r.rows[0].nombre;

    return res.status(201).json({
      id: r.rows[0].id,
      slug: slugOut,
      nombre: label,
      label,
    });
  } catch (e) {
    return sendPgError(res, "POST /categorias", e);
  }
});

/* =========================
   Producto (CRUD real)
========================= */

// ✅ LISTAR productos (paginación opcional)
app.get("/producto", async (req, res) => {
  try {
    const { categoria, _page, _limit } = req.query;

    const page = toNumber(_page, 0);
    const limit = Math.min(Math.max(toNumber(_limit, 0), 0), 200);
    const offset = page && limit ? (page - 1) * limit : 0;

    if (categoria) {
      // ✅ canonico: medicamento
      const cat = canonCat(categoria);

      const q =
        page && limit
          ? `SELECT id, data FROM producto
             WHERE trim(lower(data->>'categoria')) = $1
             ORDER BY id ASC
             LIMIT $2 OFFSET $3`
          : `SELECT id, data FROM producto
             WHERE trim(lower(data->>'categoria')) = $1
             ORDER BY id ASC`;

      const params = page && limit ? [cat, limit, offset] : [cat];

      const r = await pool.query(q, params);
      return res.json(r.rows.map((x) => normalizarProducto(x.data || {}, x.id)));
    }

    const q =
      page && limit
        ? "SELECT id, data FROM producto ORDER BY id ASC LIMIT $1 OFFSET $2"
        : "SELECT id, data FROM producto ORDER BY id ASC";

    const params = page && limit ? [limit, offset] : [];

    const r = await pool.query(q, params);
    return res.json(r.rows.map((x) => normalizarProducto(x.data || {}, x.id)));
  } catch (e) {
    return sendPgError(res, "GET /producto", e);
  }
});

// ✅ OBTENER producto por id
app.get("/producto/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const r = await pool.query("SELECT data FROM producto WHERE id = $1", [id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    return res.json(normalizarProducto(r.rows[0].data || {}, id));
  } catch (e) {
    return sendPgError(res, "GET /producto/:id", e);
  }
});

// ✅ CREAR producto (CON DEBUG + ERRORES DETALLADOS)
app.post("/producto", async (req, res) => {
  try {
    const body = req.body || {};
    console.log("[POST /producto] body =>", body); // ✅ ver payload real

    const nombre = String(body.nombre ?? "").trim();
    const marca = String(body.marca ?? "").trim();

    // ✅ canonical
    const categoria = canonCat(body.categoria);

    const stock = toNumber(body.stock ?? 0, 0);
    const precioNormal = toNumber(body.precioNormal ?? body.precio ?? 0, 0);

    const promoActiva = !!(body.promoActiva ?? body.promo_activa ?? false);
    const precioPromo = promoActiva
      ? toNumber(body.precioPromo ?? body.precio_promo ?? 0, 0)
      : 0;

    if (!nombre) return res.status(400).json({ ok: false, error: "Falta nombre" });
    if (!marca) return res.status(400).json({ ok: false, error: "Falta marca" });
    if (!categoria) return res.status(400).json({ ok: false, error: "Falta categoria" });

    if (!Number.isFinite(stock) || stock < 0) {
      return res.status(400).json({ ok: false, error: "stock inválido" });
    }
    if (!Number.isFinite(precioNormal) || precioNormal < 0) {
      return res.status(400).json({ ok: false, error: "precio inválido" });
    }
    if (promoActiva && (!Number.isFinite(precioPromo) || precioPromo < 0)) {
      return res.status(400).json({ ok: false, error: "precioPromo inválido" });
    }

    const img = pickImagen(body);

    const data = {
      nombre,
      marca,
      categoria, // ✅ ya canonical
      stock,
      precioNormal,
      promoActiva,
      precioPromo,
      ...img,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const r = await pool.query(
      "INSERT INTO producto (data) VALUES ($1) RETURNING id, data",
      [data]
    );

    return res.status(201).json(
      normalizarProducto(r.rows[0].data || {}, r.rows[0].id)
    );
  } catch (e) {
    return sendPgError(res, "POST /producto", e);
  }
});

// ✅ PATCH /producto/:id
app.patch("/producto/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch = req.body || {};

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const r = await pool.query("SELECT data FROM producto WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    const current = r.rows[0].data || {};
    const updated = { ...current, ...patch };

    if (patch.stock !== undefined) {
      const n = toNumber(patch.stock, NaN);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "stock inválido" });
      }
      updated.stock = n;
    }

    if (patch.precioNormal !== undefined || patch.precio !== undefined) {
      const p = toNumber(patch.precioNormal ?? patch.precio, NaN);
      if (!Number.isFinite(p) || p < 0) {
        return res.status(400).json({ error: "precio inválido" });
      }
      updated.precioNormal = p;
      updated.precio = p;
    }

    if (patch.categoria !== undefined) {
      updated.categoria = canonCat(patch.categoria);
    }

    if (patch.promoActiva !== undefined || patch.promo_activa !== undefined) {
      updated.promoActiva = !!(patch.promoActiva ?? patch.promo_activa);
    }

    if (patch.precioPromo !== undefined || patch.precio_promo !== undefined) {
      const pp = toNumber(patch.precioPromo ?? patch.precio_promo, NaN);
      if (!Number.isFinite(pp) || pp < 0) {
        return res.status(400).json({ error: "precioPromo inválido" });
      }
      updated.precioPromo = pp;
    }

    const img = pickImagen(patch);
    if (Object.keys(img).length) {
      if (img.imagen_base64) delete updated.imagen_url;
      if (img.imagen_url) delete updated.imagen_base64;
      Object.assign(updated, img);
    }

    updated.updatedAt = new Date().toISOString();

    const u = await pool.query(
      "UPDATE producto SET data = $1 WHERE id = $2 RETURNING data",
      [updated, id]
    );

    return res.json(normalizarProducto(u.rows[0].data || {}, id));
  } catch (e) {
    return sendPgError(res, "PATCH /producto/:id", e);
  }
});

// ✅ DELETE /producto/:id
app.delete("/producto/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }

    const r = await pool.query(
      "DELETE FROM producto WHERE id = $1 RETURNING id",
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    return res.json({ ok: true, deletedId: id });
  } catch (e) {
    return sendPgError(res, "DELETE /producto/:id", e);
  }
});

/* =========================
   Carrito
========================= */

// 🔍 Obtener carrito (por usuario o completo)
app.get("/carrito", async (req, res) => {
  try {
    const { idUsuario } = req.query;

    if (idUsuario) {
      const r = await pool.query(
        "SELECT data FROM carrito WHERE data->>'idUsuario' = $1 ORDER BY id ASC",
        [String(idUsuario)]
      );
      return res.json(r.rows.map((x) => x.data));
    }

    const r = await pool.query("SELECT data FROM carrito ORDER BY id ASC");
    return res.json(r.rows.map((x) => x.data));
  } catch (e) {
    return sendPgError(res, "GET /carrito", e);
  }
});

// 🛒 Agregar al carrito (evita duplicados y suma cantidad)
app.post("/carrito", async (req, res) => {
  try {
    const body = req.body || {};

    const idProducto = Number(body.id ?? body.idProducto);
    const idUsuario = Number(body.idUsuario ?? body.userId);

    const nombre = body.nombre;
    const precio = Number(body.precio);
    const stock = Number(body.stock);
    const imagen = body.imagen;
    const cantidad = Number(body.cantidad ?? 1);

    if (!idUsuario) return res.status(400).json({ ok: false, error: "Falta idUsuario" });
    if (!idProducto) return res.status(400).json({ ok: false, error: "Falta idProducto" });
    if (!nombre) return res.status(400).json({ ok: false, error: "Falta nombre" });
    if (!precio) return res.status(400).json({ ok: false, error: "Falta precio" });

    const existing = await pool.query(
      `SELECT id, data FROM carrito
       WHERE data->>'idUsuario' = $1
       AND data->>'id' = $2`,
      [String(idUsuario), String(idProducto)]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const current = row.data;

      const nuevaCantidad = (current.cantidad || 1) + cantidad;

      const updated = {
        ...current,
        cantidad: nuevaCantidad,
        ...(Number.isFinite(stock) ? { stock } : {}),
      };

      await pool.query("UPDATE carrito SET data = $1 WHERE id = $2", [
        updated,
        row.id,
      ]);

      return res.json({ ok: true, updated: true, data: updated });
    }

    const data = {
      id: idProducto,
      nombre,
      precio,
      stock,
      imagen,
      idUsuario,
      cantidad,
      createdAt: new Date().toISOString(),
    };

    const r = await pool.query(
      "INSERT INTO carrito (data) VALUES ($1) RETURNING id, data",
      [data]
    );

    return res.status(201).json({ ok: true, created: true, data: r.rows[0].data });
  } catch (e) {
    return sendPgError(res, "POST /carrito", e);
  }
});

// ✅ PATCH /carrito/:id   (id = idProducto)
app.patch("/carrito/:id", async (req, res) => {
  try {
    const idProducto = Number(req.params.id);
    const patch = req.body || {};

    const idUsuario =
      patch.idUsuario !== undefined
        ? Number(patch.idUsuario)
        : req.query.idUsuario !== undefined
        ? Number(req.query.idUsuario)
        : undefined;

    if (!Number.isFinite(idProducto)) {
      return res.status(400).json({ ok: false, error: "idProducto inválido" });
    }
    if (idUsuario !== undefined && !Number.isFinite(idUsuario)) {
      return res.status(400).json({ ok: false, error: "idUsuario inválido" });
    }

    const q =
      idUsuario !== undefined
        ? `SELECT id, data FROM carrito
           WHERE data->>'idUsuario' = $1 AND data->>'id' = $2
           ORDER BY id ASC LIMIT 1`
        : `SELECT id, data FROM carrito
           WHERE data->>'id' = $1
           ORDER BY id ASC LIMIT 1`;

    const params =
      idUsuario !== undefined
        ? [String(idUsuario), String(idProducto)]
        : [String(idProducto)];

    const r = await pool.query(q, params);

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    const rowId = r.rows[0].id;
    const current = r.rows[0].data || {};
    const updated = { ...current, ...patch };

    if (patch.cantidad !== undefined) {
      const n = Number(patch.cantidad);
      if (!Number.isFinite(n) || n < 1) {
        return res.status(400).json({ ok: false, error: "cantidad inválida" });
      }
      updated.cantidad = n;
    }

    const u = await pool.query(
      "UPDATE carrito SET data = $1 WHERE id = $2 RETURNING data",
      [updated, rowId]
    );

    return res.json(u.rows[0].data);
  } catch (e) {
    return sendPgError(res, "PATCH /carrito/:id", e);
  }
});

// ❌ DELETE /carrito/:id  (id = idProducto)
app.delete("/carrito/:id", async (req, res) => {
  try {
    const idProducto = Number(req.params.id);
    const idUsuario =
      req.query.idUsuario !== undefined ? Number(req.query.idUsuario) : undefined;

    if (!Number.isFinite(idProducto)) {
      return res.status(400).json({ ok: false, error: "idProducto inválido" });
    }
    if (idUsuario !== undefined && !Number.isFinite(idUsuario)) {
      return res.status(400).json({ ok: false, error: "idUsuario inválido" });
    }

    const q =
      idUsuario !== undefined
        ? `DELETE FROM carrito
           WHERE id IN (
             SELECT id FROM carrito
             WHERE data->>'idUsuario' = $1 AND data->>'id' = $2
             ORDER BY id ASC LIMIT 1
           )`
        : `DELETE FROM carrito
           WHERE id IN (
             SELECT id FROM carrito
             WHERE data->>'id' = $1
             ORDER BY id ASC LIMIT 1
           )`;

    const params =
      idUsuario !== undefined
        ? [String(idUsuario), String(idProducto)]
        : [String(idProducto)];

    await pool.query(q, params);

    return res.json({ ok: true });
  } catch (e) {
    return sendPgError(res, "DELETE /carrito/:id", e);
  }
});

/* =========================
   Start server
========================= */
const PORT = 3001;

// ✅ crea tablas y recién ahí levanta
ensureTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 API running on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error("❌ Error asegurando tablas:", e);
    process.exit(1);
  });
