// src/routes/paymentRoutes.js

const express = require("express");
const router = express.Router();
const {
  generatePayments,
} = require("../controllers/payments/paymentController");

/**
 * POST /api/payments/generate-missing
 * Creates Payment records for each Order that has no Payment.
 */
router.post("/generate-missing", generatePayments);

module.exports = router;
