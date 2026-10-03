const express = require('express');
const axios = require('axios');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3001';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3002';

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'gateway',
    productService: PRODUCT_SERVICE_URL,
    orderService: ORDER_SERVICE_URL,
  });
});

const proxyRequest = async (req, res, targetUrl, method = 'GET') => {
  try {
    const config = {
      method,
      url: targetUrl,
      data: req.body,
      headers: { 'Content-Type': 'application/json' },
    };

    const response = await axios(config);
    return res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response ? error.response.status : 502;
    const message = error.response ? error.response.data : { error: 'Service unavailable' };
    return res.status(status).json(message);
  }
};

app.get('/api/products', async (req, res) => {
  await proxyRequest(req, res, `${PRODUCT_SERVICE_URL}/products`);
});

app.get('/api/products/:id', async (req, res) => {
  await proxyRequest(req, res, `${PRODUCT_SERVICE_URL}/products/${req.params.id}`);
});

app.post('/api/products', async (req, res) => {
  await proxyRequest(req, res, `${PRODUCT_SERVICE_URL}/products`, 'POST');
});

app.get('/api/orders', async (req, res) => {
  await proxyRequest(req, res, `${ORDER_SERVICE_URL}/orders`);
});

app.get('/api/orders/:id', async (req, res) => {
  await proxyRequest(req, res, `${ORDER_SERVICE_URL}/orders/${req.params.id}`);
});

app.post('/api/orders', async (req, res) => {
  await proxyRequest(req, res, `${ORDER_SERVICE_URL}/orders`, 'POST');
});

const server = app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT}`);
});

const shutdown = (signal) => {
  console.log(`Received ${signal}, shutting down gateway gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
