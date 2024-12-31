// src/controllers/reviewController.js
const prisma = require("../../db/prisma/client");

// Hypothetical function for generating reviews:
const {
  generateMultipleReviewDataWithCallback,
} = require("../services/reviewChatGPTService");

/**
 * Generate multiple reviews.
 * We need both userId and productId to exist for each review.
 */
async function generateReviews(req, res) {
  console.log("==> [generateReviews] Function called.");

  try {
    let { numberOfReviews } = req.body;
    if (!numberOfReviews || typeof numberOfReviews !== "number") {
      numberOfReviews = 500; // Example default
      console.warn("   -> Using default of 500 reviews.");
    }

    const insertedReviews = [];

    async function onChunkReceived(chunk) {
      for (const reviewData of chunk) {
        const { userId, productId, starRating, comment } = reviewData;

        // userId and productId must be valid
        if (!userId || !productId) {
          console.warn(
            "   -> Missing userId/productId for review. Skipping..."
          );
          continue;
        }

        // Insert review
        const newReview = await prisma.review.create({
          data: {
            userId,
            productId,
            starRating,
            comment,
          },
        });
        insertedReviews.push(newReview);
      }
    }

    await generateMultipleReviewDataWithCallback(
      numberOfReviews,
      20,
      onChunkReceived
    );

    return res.status(200).json({
      success: true,
      data: insertedReviews,
    });
  } catch (error) {
    console.error("Error generating reviews:", error);
    return res.status(500).json({
      error: "Internal server error occurred during review generation.",
      partialData: [],
    });
  }
}

module.exports = {
  generateReviews,
};
