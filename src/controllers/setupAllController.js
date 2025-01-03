// src/controllers/setupAllController.js

const { generateProducts } = require("./products/productController");
const {
  generateMissingProductImages,
} = require("./products/productImageController");
const { generateUsers } = require("./users/userController");
const { generateMissingUserImages } = require("./users/userImageController");
const { generateMissingAddresses } = require("./addresses/addressController");
const { generateReviews } = require("./reviews/reviewController");
const { generateOrders } = require("./orders/orderController");
const {
  generateMissingOrderItems,
} = require("./orderItems/orderItemController");
const { generatePayments } = require("./payments/paymentController");

/**
 * Master setup controller that:
 * 1) Generates 100 products
 * 2) Generates missing product images
 * 3) Generates 20 users
 * 4) Generates missing user images
 * 5) Generates addresses for users with none
 * 6) Generates reviews for (new) users
 * 7) Generates 5 orders per user
 * 8) Generates missing orderItems for each order
 * 9) Generates missing payments for each order
 *
 * All steps are run sequentially, one after the other.
 */
async function runAllSetup(req, res) {
  console.log("==> [runAllSetup] Function called.");

  try {
    // 1) Generate 100 products
    {
      console.log("STEP 1: generate 100 products...");
      // We can simulate a 'req' with { body: { numberOfProducts: 100 } }
      const mockReq = { body: { numberOfProducts: 100 } };
      // We'll need a "mockRes" that captures the result but doesn't send
      const mockRes = buildIntermediateRes();
      await generateProducts(mockReq, mockRes);
      console.log("   -> Completed product generation.");
    }

    // 2) Generate missing product images
    {
      console.log("STEP 2: generate missing product images...");
      const mockReq = {}; // no body needed
      const mockRes = buildIntermediateRes();
      await generateMissingProductImages(mockReq, mockRes);
      console.log("   -> Completed missing product images.");
    }

    // 3) Generate 20 users
    {
      console.log("STEP 3: generate 20 users...");
      const mockReq = { body: { numberOfUsers: 20 } };
      const mockRes = buildIntermediateRes();
      await generateUsers(mockReq, mockRes);
      console.log("   -> Completed user generation.");
    }

    // 4) Generate missing user images
    {
      console.log("STEP 4: generate missing user images...");
      const mockReq = {};
      const mockRes = buildIntermediateRes();
      await generateMissingUserImages(mockReq, mockRes);
      console.log("   -> Completed missing user images.");
    }

    // 5) Generate addresses for users that have none (2 addresses each)
    {
      console.log("STEP 5: generate missing addresses...");
      const mockReq = {};
      const mockRes = buildIntermediateRes();
      await generateMissingAddresses(mockReq, mockRes);
      console.log("   -> Completed missing addresses.");
    }

    // 6) Generate reviews for users that have 0 reviews
    {
      console.log("STEP 6: generate reviews for new users...");
      const mockReq = {};
      const mockRes = buildIntermediateRes();
      await generateReviews(mockReq, mockRes);
      console.log("   -> Completed review generation.");
    }

    // 7) Generate orders for each user (one of each status)
    {
      console.log("STEP 7: generate orders for each user...");
      const mockReq = {};
      const mockRes = buildIntermediateRes();
      await generateOrders(mockReq, mockRes);
      console.log("   -> Completed order generation.");
    }

    // 8) Generate missing orderItems for each order
    {
      console.log("STEP 8: generate missing order items...");
      const mockReq = {};
      const mockRes = buildIntermediateRes();
      await generateMissingOrderItems(mockReq, mockRes);
      console.log("   -> Completed missing order items generation.");
    }

    // 9) Generate missing payments
    {
      console.log("STEP 9: generate missing payments...");
      const mockReq = {};
      const mockRes = buildIntermediateRes();
      await generatePayments(mockReq, mockRes);
      console.log("   -> Completed missing payments.");
    }

    // If all steps succeed:
    return res.json({
      success: true,
      message: "All setup steps completed successfully.",
    });
  } catch (error) {
    console.error("[runAllSetup] Error during setup:", error);
    return res.status(500).json({
      error: "Internal server error during runAllSetup.",
    });
  }
}

/**
 * A small helper to build a "mock" response object so we can call
 * existing controllers that expect (req, res).
 *
 * This mockRes won't actually send an HTTP response, but simply capture it.
 * We only need .json(...) or .status(...) for our usage.
 */
function buildIntermediateRes() {
  return {
    status(code) {
      // you could store the code somewhere
      console.log(`[mockRes] status: ${code}`);
      return this; // chainable
    },
    json(payload) {
      console.log(
        "[mockRes] JSON response (truncated for brevity) =>",
        payload
      );
      // do nothing else, no real HTTP sending
      return this;
    },
  };
}

module.exports = {
  runAllSetup,
};
