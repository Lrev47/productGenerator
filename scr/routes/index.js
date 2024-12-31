// src/routes/index.js
const express = require("express");
const router = express.Router();
const productRoutes = require("./productRoutes");
// const userRoutes = require("./userRoutes");

// Top-level: only "products" for now
router.use("/products", productRoutes);
// router.use("/users", userRoutes);

module.exports = router;
