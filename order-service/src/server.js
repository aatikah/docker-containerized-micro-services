const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = Number(process.env.PORT || 3002);
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3001';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'appdb',
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'change-me',
});

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

app.use(express.json());

const initializeDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      total NUMERIC(10, 2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

app.get('/health', async (_req, res) => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', service: 'order-service' });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'order-service', message: error.message });
  }
});

app.get('/orders', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/orders', async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: 'productId and quantity are required' });
  }

  try {
    const cacheKey = `product:${productId}`;
    let product = null;

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      product = JSON.parse(cached);
    } else {
      const response = await axios.get(`${PRODUCT_SERVICE_URL}/products/${productId}`);
      product = response.data;
      await redisClient.set(cacheKey, JSON.stringify(product), { EX: 300 });
    }

    if (!product || !product.price) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const total = Number(product.price) * Number(quantity);

    const { rows } = await pool.query(
      'INSERT INTO orders (product_id, product_name, quantity, total) VALUES ($1, $2, $3, $4) RETURNING *',
      [product.id, product.name, Number(quantity), total]
    );

    await redisClient.set(`order:${rows[0].id}`, JSON.stringify(rows[0]), { EX: 600 });

    return res.status(201).json(rows[0]);
  } catch (error) {
    const message = error.response ? error.response.data : error.message;
    return res.status(500).json({ error: message });
  }
});

const server = app.listen(PORT, async () => {
  try {
    await initializeDatabase();
    await redisClient.connect();
    console.log(`Order service listening on port ${PORT}`);
  } catch (error) {
    console.error('Failed to initialize order service', error);
    process.exit(1);
  }
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down order service gracefully`);
  server.close(async () => {
    await redisClient.quit();
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
