// src/routes/reviewRoutes.js

const express = require("express");
const router = express.Router();
const { generateReviews } = require("../controllers/reviews/reviewController");

/**
 * POST /reviews/generate-reviews
 * For each user, pick 5 random products, call ChatGPT in chunks,
 * and create reviews in the DB.
 */
router.post("/generate-reviews", generateReviews);

module.exports = router;
