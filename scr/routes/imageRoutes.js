// scr/routes/imageRoutes.js

const express = require("express");
const {
  generateProductImage,
  generateMissingProductImages,
  generateImageById,
} = require("../controllers/imageController");

const router = express.Router();

// 1. Generate a single image from a user-provided prompt (existing)
router.post("/generate", generateProductImage);

// 2. Generate an image for a specific product by ID
router.post("/generate-by-id/:id", generateImageById);

// 3. Generate images for all products missing an imageUrl
router.post("/generate-missing", generateMissingProductImages);

module.exports = router;
