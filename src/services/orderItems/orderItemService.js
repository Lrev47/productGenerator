// src/services/orderItems/orderItemService.js

const prisma = require("../../db/prisma/client");

/**
 * Generate a random number of items (3..36) for the given order.
 * Each item references a random product from `allProducts`.
 * Quantity is 1..4. Price is from the product's price.
 *
 * Then sum the total, update the order's `total` field,
 * and return the updated order (with items).
 */
async function generateOrderItemsForOrder(order, allProducts) {
  // 1) Decide how many items for this order
  const itemCount = randomInt(3, 36);

  // 2) We'll keep track of sum
  let sum = 0.0;

  // 3) We store the newly created items in an array
  const createdItems = [];

  for (let i = 0; i < itemCount; i++) {
    // a) pick a random product
    const product = pickRandom(allProducts);
    // b) random quantity 1..4
    const quantity = randomInt(1, 4);
    // c) total price for this item
    const linePrice = product.price; // or product.price * quantity if you prefer
    // if you do product.price * quantity, you'd store that in item `price`
    // or you might store just the unit price in item `price` and multiply later.

    // d) create the item
    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        quantity,
        price: linePrice, // storing the "price" for each item row
      },
    });

    createdItems.push(orderItem);

    // e) sum up
    sum += linePrice * quantity;
  }

  // 4) Now update the order's total
  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      total: sum,
    },
    include: {
      orderItems: true, // if you want to return the items for the updated order
    },
  });

  return updatedOrder;
}

/** pickRandom: returns a random element from an array */
function pickRandom(array) {
  if (!array.length) return null;
  const idx = Math.floor(Math.random() * array.length);
  return array[idx];
}

/** randomInt(min, max) inclusive */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  generateOrderItemsForOrder,
};
