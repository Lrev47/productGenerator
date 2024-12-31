// src/controllers/addressController.js
const prisma = require("../../db/prisma/client");

// Hypothetical function for generating address data:
const {
  generateMultipleAddressDataWithCallback,
} = require("../../services/addressChatGPTService");

/**
 * Generate multiple addresses and insert into the DB.
 *
 * Note: Because Address requires a userId (relationship), you might want
 * to ensure the user already exists or do some random assignment logic.
 */
async function generateAddresses(req, res) {
  console.log("==> [generateAddresses] Function called.");

  try {
    let { numberOfAddresses } = req.body;
    if (!numberOfAddresses || typeof numberOfAddresses !== "number") {
      numberOfAddresses = 300; // Example default
      console.warn("   -> Using default of 300 addresses.");
    }

    const insertedAddresses = [];

    async function onChunkReceived(chunk) {
      for (const addressData of chunk) {
        const {
          userId,
          label,
          address1,
          address2,
          city,
          state,
          zipcode,
          country,
        } = addressData;

        // Ensure userId is valid or handle missing userId
        if (!userId) {
          console.warn(
            "   -> No userId provided for address. Skipping this record."
          );
          continue;
        }

        const newAddress = await prisma.address.create({
          data: {
            userId,
            label,
            address1,
            address2,
            city,
            state,
            zipcode,
            country,
          },
        });
        insertedAddresses.push(newAddress);
      }
    }

    await generateMultipleAddressDataWithCallback(
      numberOfAddresses,
      20,
      onChunkReceived
    );

    return res.status(200).json({
      success: true,
      data: insertedAddresses,
    });
  } catch (error) {
    console.error("Error generating addresses:", error);
    return res.status(500).json({
      error: "Internal server error occurred during address generation.",
      partialData: [],
    });
  }
}

module.exports = {
  generateAddresses,
};
