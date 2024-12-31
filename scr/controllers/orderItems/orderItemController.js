// src/controllers/orderItemController.js
const prisma = require("../../db/prisma/client");

// Hypothetical function to generate order items
const {
  generateMultipleOrderItemDataWithCallback,
} = require("../services/orderItemChatGPTService");

/**
 * Generate multiple Order Items.
 * Each Order Item requires a valid productId and orderId.
 */
async function generateOrderItems(req, res) {
  console.log("==> [generateOrderItems] Function called.");

  try {
    let { numberOfOrderItems } = req.body;
    if (!numberOfOrderItems || typeof numberOfOrderItems !== "number") {
      numberOfOrderItems = 300; // Example default
      console.warn("   -> Using default of 300 order items.");
    }

    const insertedOrderItems = [];

    async function onChunkReceived(chunk) {
      for (const itemData of chunk) {
        const { orderId, productId, quantity, price } = itemData;

        if (!orderId || !productId) {
          console.warn("   -> Missing orderId/productId. Skipping...");
          continue;
        }

        const newOrderItem = await prisma.orderItem.create({
          data: {
            orderId,
            productId,
            quantity: quantity || 1,
            price: price || 0,
          },
        });
        insertedOrderItems.push(newOrderItem);
      }
    }

    await generateMultipleOrderItemDataWithCallback(
      numberOfOrderItems,
      20,
      onChunkReceived
    );

    return res.status(200).json({
      success: true,
      data: insertedOrderItems,
    });
  } catch (error) {
    console.error("Error generating order items:", error);
    return res.status(500).json({
      error: "Internal server error occurred during order item generation.",
      partialData: [],
    });
  }
}

module.exports = {
  generateOrderItems,
};
