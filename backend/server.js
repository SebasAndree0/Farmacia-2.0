// C:\Farmacia2026\Farmacia-2.0\backend\server.js

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());

// ⚠️ soporte imágenes base64 grandes
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const pool = new Pool({
  host: "localhost",
  port: 5433,
  database: "farmacia_db",
  user: "farmacia",
  password: "farmacia123",
});

/* =========================
   Health
========================= */
app.get("/health", async (_req, res) => {
  const r = await pool.query("SELECT now()");
  res.json({ ok: true, now: r.rows[0].now });
});

/* =========================
   Usuario
========================= */

// ✅ LISTAR usuarios
app.get("/usuario", async (_req, res) => {
  const r = await pool.query("SELECT data FROM usuario ORDER BY id ASC");
  res.json(r.rows.map((x) => x.data));
});

// ✅ OBTENER usuario por ID
app.get("/usuario/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  const r = await pool.query("SELECT data FROM usuario WHERE id = $1", [id]);

  if (r.rows.length === 0) {
    return res.status(404).json({ error: "No encontrado" });
  }

  res.json(r.rows[0].data);
});

// ✅ ACTUALIZAR usuario (parcial)
app.patch("/usuario/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch = req.body || {};

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    // 1) traer usuario actual
    const r = await pool.query("SELECT data FROM usuario WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    const current = r.rows[0].data || {};

    // 2) merge patch
    const updated = { ...current, ...patch };

    // 3) guardar y devolver
    const u = await pool.query(
      "UPDATE usuario SET data = $1 WHERE id = $2 RETURNING data",
      [updated, id]
    );

    return res.json(u.rows[0].data);
  } catch (e) {
    console.error("PATCH /usuario/:id ERROR:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
      code: e?.code,
    });
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
    console.error("DELETE /usuario/:id ERROR:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
      code: e?.code,
    });
  }
});

/* =========================
   Producto
========================= */
app.get("/producto", async (req, res) => {
  const { categoria } = req.query;

  if (categoria) {
    const r = await pool.query(
      "SELECT data FROM producto WHERE data->>'categoria' = $1 ORDER BY id ASC",
      [String(categoria)]
    );
    return res.json(r.rows.map((x) => x.data));
  }

  const r = await pool.query("SELECT data FROM producto ORDER BY id ASC");
  res.json(r.rows.map((x) => x.data));
});

app.get("/producto/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "id inválido" });
  }

  const r = await pool.query("SELECT data FROM producto WHERE id = $1", [id]);

  if (r.rows.length === 0) {
    return res.status(404).json({ error: "No encontrado" });
  }

  res.json(r.rows[0].data);
});

// ✅ PATCH /producto/:id  (para actualizar stock y/o campos parciales)
app.patch("/producto/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const patch = req.body || {};

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    // 1) traer producto actual
    const r = await pool.query("SELECT data FROM producto WHERE id = $1", [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }

    const current = r.rows[0].data || {};

    // 2) merge patch
    const updated = {
      ...current,
      ...patch,
    };

    // 3) normalizar stock si viene
    if (patch.stock !== undefined) {
      const n = Number(patch.stock);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "stock inválido" });
      }
      updated.stock = n;
    }

    // 4) guardar
    const u = await pool.query(
      "UPDATE producto SET data = $1 WHERE id = $2 RETURNING data",
      [updated, id]
    );

    return res.json(u.rows[0].data);
  } catch (e) {
    console.error("PATCH /producto/:id ERROR:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
      code: e?.code,
    });
  }
});

/* =========================
   Carrito
========================= */

// 🔍 Obtener carrito (por usuario o completo)
app.get("/carrito", async (req, res) => {
  const { idUsuario } = req.query;

  if (idUsuario) {
    const r = await pool.query(
      "SELECT data FROM carrito WHERE data->>'idUsuario' = $1 ORDER BY id ASC",
      [String(idUsuario)]
    );
    return res.json(r.rows.map((x) => x.data));
  }

  const r = await pool.query("SELECT data FROM carrito ORDER BY id ASC");
  res.json(r.rows.map((x) => x.data));
});

/**
 * 🛒 AGREGAR AL CARRITO (PRO)
 * - evita duplicados
 * - suma cantidad
 *
 * Nota: aquí tu carrito guarda el id del producto dentro de data.id
 * (no data.idProducto). Está OK si tu front lo maneja.
 */
app.post("/carrito", async (req, res) => {
  try {
    const body = req.body || {};

    // 🔥 NORMALIZACIÓN DE DATOS
    const idProducto = Number(body.id ?? body.idProducto);
    const idUsuario = Number(body.idUsuario ?? body.userId);

    const nombre = body.nombre;
    const precio = Number(body.precio);
    const stock = Number(body.stock);
    const imagen = body.imagen;
    const cantidad = Number(body.cantidad ?? 1);

    console.log("BODY RECIBIDO:", body);

    // VALIDACIONES
    if (!idUsuario) {
      return res.status(400).json({ ok: false, error: "Falta idUsuario" });
    }
    if (!idProducto) {
      return res.status(400).json({ ok: false, error: "Falta idProducto" });
    }
    if (!nombre) {
      return res.status(400).json({ ok: false, error: "Falta nombre" });
    }
    if (!precio) {
      return res.status(400).json({ ok: false, error: "Falta precio" });
    }

    // 🔎 1. Buscar si ya existe el producto en el carrito (por usuario + id producto)
    const existing = await pool.query(
      `SELECT id, data FROM carrito
       WHERE data->>'idUsuario' = $1
       AND data->>'id' = $2`,
      [String(idUsuario), String(idProducto)]
    );

    if (existing.rows.length > 0) {
      // 🔁 SI EXISTE → actualizar cantidad
      const row = existing.rows[0];
      const current = row.data;

      const nuevaCantidad = (current.cantidad || 1) + cantidad;

      const updated = {
        ...current,
        cantidad: nuevaCantidad,
        // opcional: refrescar stock en carrito
        ...(Number.isFinite(stock) ? { stock } : {}),
      };

      await pool.query("UPDATE carrito SET data = $1 WHERE id = $2", [
        updated,
        row.id,
      ]);

      return res.json({ ok: true, updated: true, data: updated });
    }

    // 🆕 SI NO EXISTE → insertar nuevo
    const data = {
      id: idProducto, // 👈 id del producto
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

    return res.status(201).json({
      ok: true,
      created: true,
      data: r.rows[0].data,
    });
  } catch (e) {
    console.error("POST /carrito ERROR:", e);

    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
      code: e?.code,
    });
  }
});

/**
 * ✅ PATCH /carrito/:id
 * 🔥 ARREGLADO:
 * - :id ahora es idProducto (data.id), NO el id de la tabla carrito
 * - opcional: filtra por idUsuario si viene (body o query)
 *
 * Ejemplo:
 *  PATCH /carrito/12
 *  body: { "cantidad": 2, "idUsuario": 6 }
 */
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

    // ✅ Buscar la fila del carrito por (idUsuario + idProducto) si hay usuario,
    // si no, por idProducto solamente (modo simple).
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

    // ✅ validar cantidad si viene
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
    console.error("PATCH /carrito/:id ERROR:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
      code: e?.code,
    });
  }
});

/**
 * ❌ ELIMINAR ITEM DEL CARRITO
 * 🔥 ARREGLADO igual que PATCH:
 * - :id es idProducto (data.id)
 * - opcional: filtra por idUsuario
 */
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
    console.error("DELETE /carrito/:id ERROR:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Error interno",
      code: e?.code,
    });
  }
});

/* =========================
   Start server
========================= */
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
