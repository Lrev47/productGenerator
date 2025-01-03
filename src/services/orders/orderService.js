// src/services/orders/orderService.js

const prisma = require("../../db/prisma/client");

// Possible statuses from your schema
const ORDER_STATUSES = [
  "PENDING",
  "COMPLETED",
  "CANCELLED",
  "SHIPPED",
  "REFUNDED",
];

/**
 * createOrdersForAllUsers:
 *  - For each user, find their addresses
 *  - If none, skip
 *  - Otherwise, create 5 orders, each with a unique status
 *  - shippingAddressId, billingAddressId chosen randomly from their addresses
 *  - total = 0 (per your requirement)
 */
async function createOrdersForAllUsers() {
  // 1) Fetch all users
  const allUsers = await prisma.user.findMany({
    orderBy: { id: "asc" },
  });
  console.log(`   -> Found ${allUsers.length} users.`);

  const insertedOrders = [];

  // 2) For each user => find addresses => create 5 orders (one per status)
  for (const user of allUsers) {
    // a) find addresses for this user
    const userAddresses = await prisma.address.findMany({
      where: { userId: user.id },
    });
    if (!userAddresses.length) {
      console.log(`   -> User ${user.id} has NO addresses. Skipping orders.`);
      continue;
    }

    console.log(
      `   -> Creating 5 orders for user ${user.id}, who has ${userAddresses.length} addresses...`
    );

    // b) For each of the 5 statuses, create an order
    for (const status of ORDER_STATUSES) {
      // Pick a random shipping address
      const shippingAddr = pickRandomElement(userAddresses);
      // Possibly pick a different or the same address for billing, your choice
      const billingAddr = pickRandomElement(userAddresses);

      // c) Insert order
      const newOrder = await prisma.order.create({
        data: {
          userId: user.id,
          status,
          total: 0, // set total to 0
          shippingAddressId: shippingAddr.id,
          billingAddressId: billingAddr.id,
        },
      });

      insertedOrders.push(newOrder);
      console.log(
        `      -> Created order ID ${newOrder.id} (status=${status}) for user ${user.id}`
      );
    }
  }

  return insertedOrders;
}

/** Helper to pick a random element from an array */
function pickRandomElement(arr) {
  if (!arr.length) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

module.exports = {
  createOrdersForAllUsers,
};
