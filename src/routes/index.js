// src/routes/index.js
const express = require("express");
const router = express.Router();
const productRoutes = require("./productRoutes");
const userRoutes = require("./userRoutes");
const addressRoutes = require("./addressRoutes");
const reviewRoutes = require("./reviewRoutes");
const orderRoutes = require("./orderRoutes");

// Top-level: only "products" for now
router.use("/products", productRoutes);
router.use("/users", userRoutes);
router.use("/addresses", addressRoutes);
router.use("/reviews", reviewRoutes);
router.use("/orders", orderRoutes);

module.exports = router;
