// src/routes/orderItemRoutes.js

const express = require("express");
const router = express.Router();
const {
  generateMissingOrderItems,
} = require("../controllers/orderItems/orderItemController");

/**
 * POST /order-items/generate-missing
 * For each order that has no items, generate 3..36 random items referencing random products.
 * Then update the order’s total.
 */
router.post("/generate-missing", generateMissingOrderItems);

module.exports = router;
