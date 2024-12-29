const express = require("express");
const {
  generateProducts,
  generateProductImages,
} = require("../controllers/productController");

const router = express.Router();

// STEP 1: Generate products
router.post("/generate-products", generateProducts);

// STEP 2: Generate product images
router.post("/generate-product-images", generateProductImages);

module.exports = router;
