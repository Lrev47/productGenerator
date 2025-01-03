// src/controllers/payments/paymentController.js

const prisma = require("../../../prisma/client");
const {
  generateMissingPayments,
} = require("../../services/payments/paymentService");

/**
 * Controller: Generate a Payment record for each Order that currently has no Payment.
 */
async function generatePayments(req, res) {
  console.log("==> [generatePayments] Function called.");

  try {
    // Call our service function that does the heavy lifting
    const result = await generateMissingPayments();
    return res.json({
      success: true,
      message: "Successfully generated missing Payments.",
      data: result,
    });
  } catch (error) {
    console.error("Error in generatePayments:", error);
    return res.status(500).json({
      error: "Internal server error while generating payments.",
    });
  }
}

module.exports = {
  generatePayments,
};
