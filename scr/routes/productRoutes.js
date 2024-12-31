// src/routes/productRoutes.js

const express = require("express");
const router = express.Router();

// Controllers
const {
  generateProducts,
} = require("../controllers/products/productController");
const {
  generateImageById,
  generateMissingProductImages,
} = require("../controllers/products/productImageController");

// 1) Generate products in bulk
//    POST /products/generate-products
router.post("/generate-products", generateProducts);

// 2) Generate an image for a specific product by ID
//    POST /products/images/generate-by-id/:id
router.post("/images/generate-by-id/:id", generateImageById);

// 3) Generate images for all products missing an image
//    POST /products/images/generate-missing
router.post("/images/generate-missing", generateMissingProductImages);

module.exports = router;
