const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(cors());

// Configuración de la conexión a Neon PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_dEch1jfw3zIX@ep-broad-feather-b4mp69zv-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

// Ruta de prueba para verificar que la BD responde
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.status(200).json({ status: 'Conexión exitosa a Neon', time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al conectar a la base de datos' });
  }
});

// 1. Ruta para registrar un pedido (cuando escanean el QR)
app.post('/api/orden', async (req, res) => {
  const { device_id, qr_numero, mensaje } = req.body;
  try {
    // Buscamos el ID de la sucursal y del QR
    const sucursalRes = await pool.query('SELECT id FROM sucursales WHERE device_id = $1', [device_id]);
    if (sucursalRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }
    const sucursal_id = sucursalRes.rows[0].id;

    // Insertamos el pedido en la base de datos
    const nuevoPedido = await pool.query(
      'INSERT INTO pedidos (sucursal_id, mensaje, estado) VALUES ($1, $2, $3) RETURNING *',
      [sucursal_id, mensaje, 'PENDIENTE']
    );

    res.status(201).json({ status: 'success', pedido: nuevoPedido.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el pedido' });
  }
});

// 2. Ruta para que el ESP32 consulte sus pedidos pendientes (Polling)
app.get('/api/pendientes/:device_id', async (req, res) => {
  const { device_id } = req.params;
  try {
    const query = `
      SELECT p.id, p.mensaje, p.created_at 
      FROM pedidos p
      JOIN sucursales s ON p.sucursal_id = s.id
      WHERE s.device_id = $1 AND p.estado = 'PENDIENTE'
      ORDER BY p.created_at ASC;
    `;
    const result = await pool.query(query, [device_id]);
    
    // Opcional: Marcarlos como impresos/procesados para que no se descarguen doble
    if (result.rows.length > 0) {
      const ids = result.rows.map(row => row.id);
      await pool.query('UPDATE pedidos SET estado = \'IMPRESO\', updated_at = NOW() WHERE id = ANY($1)', [ids]);
    }

    res.status(200).json({ pendientes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar pendientes' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});