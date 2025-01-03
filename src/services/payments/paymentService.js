// src/services/payments/paymentService.js

const prisma = require("../../db/prisma/client");

/**
 * Generate a Payment for each Order that has no Payment yet.
 * We'll match the PaymentStatus to the OrderStatus as we see fit:
 *   - PENDING => REQUIRES_PAYMENT_METHOD
 *   - COMPLETED => SUCCEEDED
 *   - CANCELLED => FAILED
 *   - SHIPPED => PROCESSING
 *   - REFUNDED => CANCELED
 *
 * We'll set stripePaymentIntent to a placeholder or random string,
 * amount to order.total, userId to order.userId (optional).
 */
async function generateMissingPayments() {
  console.log("==> [generateMissingPayments] Service called.");

  // 1) Find all Orders that have zero Payment records
  const ordersWithoutPayments = await prisma.order.findMany({
    where: {
      payments: {
        none: {},
      },
    },
    include: {
      user: true, // optional if you want user data
    },
  });

  if (!ordersWithoutPayments.length) {
    console.log(
      "   -> All Orders already have at least one Payment. Skipping."
    );
    return [];
  }

  console.log(
    `   -> Found ${ordersWithoutPayments.length} orders with no Payment.`
  );

  const insertedPayments = [];

  // 2) For each order, create a Payment
  for (const order of ordersWithoutPayments) {
    const newPaymentData = {
      orderId: order.id,
      stripePaymentIntent: `FAKE_INTENT_${order.id}_${Date.now()}`, // placeholder, or random
      amount: order.total ?? 0.0,
      status: getPaymentStatusFromOrderStatus(order.status),
      userId: order.userId, // optional
    };

    try {
      const createdPayment = await prisma.payment.create({
        data: newPaymentData,
      });
      insertedPayments.push(createdPayment);
      console.log(
        `   -> Created Payment ID ${createdPayment.id} for Order ID ${order.id}`
      );
    } catch (err) {
      console.error(`Error inserting Payment for Order ${order.id}:`, err);
      // We can skip or break. For now, skip this Payment and continue.
      continue;
    }
  }

  return insertedPayments;
}

/**
 * Maps an OrderStatus to a PaymentStatus:
 *   - PENDING => REQUIRES_PAYMENT_METHOD
 *   - COMPLETED => SUCCEEDED
 *   - CANCELLED => FAILED
 *   - SHIPPED => PROCESSING
 *   - REFUNDED => CANCELED
 */
function getPaymentStatusFromOrderStatus(orderStatus) {
  switch (orderStatus) {
    case "PENDING":
      return "REQUIRES_PAYMENT_METHOD";
    case "COMPLETED":
      return "SUCCEEDED";
    case "CANCELLED":
      return "FAILED";
    case "SHIPPED":
      return "PROCESSING";
    case "REFUNDED":
      return "CANCELED";
    default:
      return "REQUIRES_PAYMENT_METHOD"; // fallback
  }
}

module.exports = {
  generateMissingPayments,
};
