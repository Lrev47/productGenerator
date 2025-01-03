// src/routes/orderRoutes.js

const express = require("express");
const router = express.Router();
const { generateOrders } = require("../controllers/orders/orderController");

/**
 * POST /orders/generate
 * - Creates 5 orders per user (each with a different OrderStatus).
 * - total=0, random shipping & billing addresses.
 */
router.post("/generate", generateOrders);

module.exports = router;
