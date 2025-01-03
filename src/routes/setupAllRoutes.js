// src/routes/setupAllRoutes.js

const express = require("express");
const router = express.Router();
const { runAllSetup } = require("../controllers/setupAllController");

/**
 * POST /api/setup/all
 * Runs the entire generation pipeline in sequence:
 * 1) products => 2) product images => 3) 20 users => 4) user images
 * => 5) addresses => 6) reviews => 7) orders => 8) order items => 9) payments
 */
router.post("/all", runAllSetup);

module.exports = router;
