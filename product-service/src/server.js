const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'appdb',
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'change-me',
});

app.use(express.json());

const initializeDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC(10, 2) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const { rowCount } = await pool.query('SELECT * FROM products');
  if (rowCount === 0) {
    await pool.query(`
      INSERT INTO products (name, description, price, stock)
      VALUES
        ('Laptop Stand', 'Adjustable aluminum stand for laptops', 49.99, 12),
        ('Mechanical Keyboard', 'Compact 65% keyboard with hot-swappable switches', 129.00, 8),
        ('USB-C Hub', 'Seven-port connectivity hub for workstations', 39.50, 20);
    `);
  }
};

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', service: 'product-service' });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'product-service', message: error.message });
  }
});

app.get('/products', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/products', async (req, res) => {
  const { name, description, price, stock } = req.body;

  if (!name || price === undefined || stock === undefined) {
    return res.status(400).json({ error: 'Name, price, and stock are required' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO products (name, description, price, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description || '', Number(price), Number(stock)]
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, async () => {
  try {
    await initializeDatabase();
    console.log(`Product service listening on port ${PORT}`);
  } catch (error) {
    console.error('Failed to initialize database', error);
    process.exit(1);
  }
});

const shutdown = (signal) => {
  console.log(`Received ${signal}, shutting down product service gracefully`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
