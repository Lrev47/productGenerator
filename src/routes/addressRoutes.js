// src/routes/addressRoutes.js

const express = require("express");
const router = express.Router();
const {
  generateMissingAddresses,
} = require("../controllers/addresses/addressController");

/**
 * POST /addresses/generate-missing
 * For each user that has no addresses, request 2 from ChatGPT, create them in the DB.
 */
router.post("/generate-missing", generateMissingAddresses);

module.exports = router;
