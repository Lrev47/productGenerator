// scr/routes/imageRoutes.js
const express = require("express");
const { generateProductImage } = require("../controllers/imageController");

const router = express.Router();

// POST /api/images/generate
router.post("/generate", generateProductImage);

module.exports = router;
