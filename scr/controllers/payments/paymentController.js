// src/controllers/paymentController.js
const prisma = require("../../db/prisma/client");

// Hypothetical function to generate payment data
const {
  generateMultiplePaymentDataWithCallback,
} = require("../services/paymentChatGPTService");

/**
 * Generate multiple Payments.
 * Each Payment requires an orderId. A userId is optional.
 */
async function generatePayments(req, res) {
  console.log("==> [generatePayments] Function called.");

  try {
    let { numberOfPayments } = req.body;
    if (!numberOfPayments || typeof numberOfPayments !== "number") {
      numberOfPayments = 50; // Example default
      console.warn("   -> Using default of 50 payments.");
    }

    const insertedPayments = [];

    async function onChunkReceived(chunk) {
      for (const paymentData of chunk) {
        const { orderId, userId, stripePaymentIntent, amount, status } =
          paymentData;

        if (!orderId || !stripePaymentIntent) {
          console.warn(
            "   -> Missing orderId or stripePaymentIntent. Skipping..."
          );
          continue;
        }

        const newPayment = await prisma.payment.create({
          data: {
            orderId,
            userId, // userId can be null if not provided
            stripePaymentIntent,
            amount: amount || 0,
            status: status || "REQUIRES_PAYMENT_METHOD",
          },
        });
        insertedPayments.push(newPayment);
      }
    }

    await generateMultiplePaymentDataWithCallback(
      numberOfPayments,
      20,
      onChunkReceived
    );

    return res.status(200).json({
      success: true,
      data: insertedPayments,
    });
  } catch (error) {
    console.error("Error generating payments:", error);
    return res.status(500).json({
      error: "Internal server error occurred during payment generation.",
      partialData: [],
    });
  }
}

module.exports = {
  generatePayments,
};
