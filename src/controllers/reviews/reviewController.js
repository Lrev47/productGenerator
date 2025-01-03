// src/controllers/reviews/reviewController.js

const prisma = require("../../../prisma/client");
const {
  getReviewsForSingleUser,
} = require("../../services/reviews/reviewChatGPTService");

/**
 * If a user already has ≥1 reviews, skip that user.
 * For those with 0 reviews, we pick 5 random products, fetch GPT, and insert new reviews.
 *
 * Adds simple retry logic for Prisma P1017 errors (server closed connection).
 */
async function generateReviews(req, res) {
  console.log("==> [generateReviews] Function called.");

  try {
    // 1) Grab all users
    const allUsers = await prisma.user.findMany({ orderBy: { id: "asc" } });
    console.log(`   -> Found ${allUsers.length} users total.`);

    // 2) Grab all products
    const allProducts = await prisma.product.findMany({
      orderBy: { id: "asc" },
    });
    console.log(`   -> Found ${allProducts.length} products total.`);

    if (!allUsers.length || !allProducts.length) {
      return res.json({
        success: true,
        message: "No users or no products found. Skipping.",
      });
    }

    const insertedReviews = [];

    // 3) For each user
    for (const user of allUsers) {
      // Check how many reviews user already has
      let existingReviewsCount = 0;
      try {
        existingReviewsCount = await prisma.review.count({
          where: { userId: user.id },
        });
      } catch (err) {
        // If we got a P1017 here, let's do a quick reconnect + retry
        const success = await handleP1017AndRetry(() =>
          prisma.review.count({
            where: { userId: user.id },
          })
        );
        if (success.ok) {
          existingReviewsCount = success.result;
        } else {
          console.error(
            `   -> user ${user.id}: Could not recover from P1017 on checking existingReviews. Skipping this user.`
          );
          continue; // skip user or re-throw — your choice
        }
      }

      if (existingReviewsCount > 0) {
        console.log(
          `   -> User ${user.id} (${user.username}) already has ${existingReviewsCount} review(s). Skipping.`
        );
        continue;
      }

      // If no reviews, pick 5 random products
      const randomProducts = pickRandomProducts(allProducts, 5);
      if (!randomProducts.length) {
        continue;
      }

      // Build array of { userId, productId, productName, productDescription }
      const pairs = randomProducts.map((p) => ({
        userId: user.id,
        productId: p.id,
        productName: p.name,
        productDescription: p.description || "",
      }));

      console.log(
        `User ${user.id} (${user.username}): generating 5 reviews...`
      );

      // Single GPT call
      let gptReviews = [];
      try {
        gptReviews = await getReviewsForSingleUser(user.id, pairs, 10000);
      } catch (err) {
        console.error(
          `Error requesting reviews from GPT for user ${user.id}:`,
          err
        );
        continue; // skip user
      }

      // Insert each review
      for (const r of gptReviews) {
        const { userId, productId, starRating, comment } = r;

        // Because P1017 can happen here, let's handle it similarly:
        const createReviewFunc = () =>
          prisma.review.create({
            data: { userId, productId, starRating, comment },
          });

        let newReview;
        try {
          newReview = await createReviewFunc();
        } catch (error) {
          if (isP1017Error(error)) {
            // Retry logic for the actual review creation
            const success = await handleP1017AndRetry(createReviewFunc);
            if (success.ok) {
              newReview = success.result;
            } else {
              console.error(
                `Error inserting review for user ${userId}, product ${productId}:`,
                error
              );
              continue; // skip
            }
          } else {
            // Not a P1017 => handle normally
            console.error(
              `Error inserting review for user ${userId}, product ${productId}:`,
              error
            );
            continue; // skip or re-throw
          }
        }

        if (newReview) {
          insertedReviews.push(newReview);
          console.log(
            `   -> Created review ID ${newReview.id} for user ${userId}, product ${productId}`
          );
        }
      }

      // Optional short delay
      await new Promise((r) => setTimeout(r, 2000));
    }

    return res.json({
      success: true,
      totalInserted: insertedReviews.length,
      data: insertedReviews,
    });
  } catch (error) {
    console.error("Error in generateReviews:", error);
    return res.status(500).json({
      error: "Internal server error while generating reviews.",
    });
  }
}

/** Helper to pick N random products */
function pickRandomProducts(allProducts, n = 5) {
  if (allProducts.length <= n) return allProducts;
  const result = [];
  const copy = [...allProducts];

  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return result;
}

/**
 * Detect if an error is a P1017 from Prisma
 */
function isP1017Error(err) {
  return err && err.code === "P1017";
}

/**
 * If we detect a P1017, let's disconnect, reconnect, and try exactly once more.
 * If success => return { ok: true, result: ... }
 * If failure => return { ok: false, error: ... }
 */
async function handleP1017AndRetry(prismaOp) {
  try {
    // 1) Disconnect
    console.warn("   -> Encountered P1017, attempting prisma.$disconnect()...");
    await prisma.$disconnect();

    // 2) Delay a bit
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 3) Reconnect
    console.warn("   -> Reconnecting Prisma...");
    await prisma.$connect();

    // 4) Attempt the operation again
    console.warn("   -> Retrying prismaOp now...");
    const result = await prismaOp();
    return { ok: true, result };
  } catch (err) {
    console.error("   -> handleP1017AndRetry second attempt failed:", err);
    return { ok: false, error: err };
  }
}

module.exports = {
  generateReviews,
};
