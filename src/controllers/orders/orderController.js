// src/controllers/orders/orderController.js

const prisma = require("../../../prisma/client");
const {
  createOrdersForAllUsers,
} = require("../../services/orders/orderService");

/**
 * Generate 5 orders per user (one for each OrderStatus).
 * Each order is linked to random shipping/billing addresses from that user.
 * total = 0 for each order.
 */
async function generateOrders(req, res) {
  console.log("==> [generateOrders] Function called.");

  try {
    const insertedOrders = await createOrdersForAllUsers();
    return res.json({
      success: true,
      message: `Successfully generated ${insertedOrders.length} orders in total.`,
      data: insertedOrders,
    });
  } catch (error) {
    console.error("Error generating orders:", error);
    return res.status(500).json({
      error: "Internal server error while generating orders.",
    });
  }
}

module.exports = {
  generateOrders,
};
