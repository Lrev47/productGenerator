// src/controllers/orderItems/orderItemController.js

const prisma = require("../../../prisma/client");
const {
  generateOrderItemsForOrder,
} = require("../../services/orderItems/orderItemService");

/**
 * Generate between 3..36 items for each order that has 0 items.
 * Each item references a random product, quantity 1..4, and
 * the order's total is updated to the sum of (price * quantity).
 */
async function generateMissingOrderItems(req, res) {
  console.log("==> [generateMissingOrderItems] Function called.");

  try {
    // 1) Find all orders that have zero items
    const ordersWithoutItems = await prisma.order.findMany({
      where: {
        orderItems: { none: {} }, // means "no OrderItems"
      },
      orderBy: { id: "asc" },
    });

    if (!ordersWithoutItems.length) {
      return res.json({
        success: true,
        message: "All orders already have at least one item. Skipping.",
        data: [],
      });
    }

    // 2) Grab a list of all products to randomly choose from
    const allProducts = await prisma.product.findMany();
    if (!allProducts.length) {
      return res.json({
        success: true,
        message: "No products found, cannot create order items.",
      });
    }

    console.log(
      `   -> Found ${ordersWithoutItems.length} orders with zero items.`
    );

    const updatedOrders = [];

    // 3) For each order, generate 3..36 random items
    for (const order of ordersWithoutItems) {
      try {
        console.log(
          `   -> Generating items for order ${order.id}, userId=${order.userId}...`
        );

        const updatedOrder = await generateOrderItemsForOrder(
          order,
          allProducts
        );

        updatedOrders.push(updatedOrder);

        console.log(
          `      -> Order #${updatedOrder.id} now has ${
            updatedOrder.orderItems.length
          } items, total = ${updatedOrder.total.toFixed(2)}`
        );
      } catch (err) {
        console.error(
          `Error generating items for order ${order.id}:`,
          err.message || err
        );
        // skip this order, or rethrow
      }
    }

    return res.json({
      success: true,
      message: `Successfully generated items for orders that had none.`,
      data: updatedOrders,
    });
  } catch (error) {
    console.error("Error in generateMissingOrderItems:", error);
    return res.status(500).json({
      error: "Internal server error while generating order items.",
    });
  }
}

module.exports = {
  generateMissingOrderItems,
};
