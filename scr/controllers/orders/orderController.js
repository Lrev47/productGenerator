// src/controllers/orderController.js
const prisma = require("../../db/prisma/client");

// Hypothetical function to generate order data
const {
  generateMultipleOrderDataWithCallback,
} = require("../services/orderChatGPTService");

/**
 * Generate multiple Orders.
 * Orders require a valid userId. Optionally, shippingAddressId and billingAddressId.
 */
async function generateOrders(req, res) {
  console.log("==> [generateOrders] Function called.");

  try {
    let { numberOfOrders } = req.body;
    if (!numberOfOrders || typeof numberOfOrders !== "number") {
      numberOfOrders = 100; // Example default
      console.warn("   -> Using default of 100 orders.");
    }

    const insertedOrders = [];

    async function onChunkReceived(chunk) {
      for (const orderData of chunk) {
        const { userId, shippingAddressId, billingAddressId, status, total } =
          orderData;

        // userId required
        if (!userId) {
          console.warn("   -> Missing userId for order. Skipping...");
          continue;
        }

        // Insert order
        const newOrder = await prisma.order.create({
          data: {
            userId,
            shippingAddressId,
            billingAddressId,
            status: status || "PENDING",
            total: total || 0,
          },
        });
        insertedOrders.push(newOrder);
      }
    }

    await generateMultipleOrderDataWithCallback(
      numberOfOrders,
      20,
      onChunkReceived
    );

    return res.status(200).json({
      success: true,
      data: insertedOrders,
    });
  } catch (error) {
    console.error("Error generating orders:", error);
    return res.status(500).json({
      error: "Internal server error occurred during order generation.",
      partialData: [],
    });
  }
}

module.exports = {
  generateOrders,
};
