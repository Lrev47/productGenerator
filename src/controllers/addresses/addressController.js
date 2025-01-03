// src/controllers/addresses/addressController.js

const prisma = require("../../db/prisma/client");
const {
  generateMultipleAddressDataWithCallback,
} = require("../../services/addresses/addressChatGPTService");

/**
 * Generate 2 addresses for each user that has 0 addresses (missing addresses),
 * in a single chunked batch, then slice them out and insert in DB.
 */
async function generateMissingAddresses(req, res) {
  console.log("==> [generateMissingAddresses] Function called.");

  try {
    // 1) Find all users who have NO addresses
    const usersWithoutAddresses = await prisma.user.findMany({
      where: {
        addresses: { none: {} }, // means "no Address records"
      },
    });

    if (!usersWithoutAddresses.length) {
      return res.json({
        success: true,
        message: "All users already have at least one address. Skipping.",
        data: [],
      });
    }

    console.log(
      `   -> Found ${usersWithoutAddresses.length} users with zero addresses.`
    );

    // 2) Each user needs 2 addresses, so total needed is:
    const totalNeeded = usersWithoutAddresses.length * 2;

    // We'll gather all generated addresses in memory:
    const allGeneratedAddresses = [];

    // 3) We'll define a callback that receives each chunk of addresses
    //    from ChatGPT and accumulates them into `allGeneratedAddresses`.
    async function onChunkReceived(chunk) {
      allGeneratedAddresses.push(...chunk);
    }

    // 4) Now call our chunk-based generator:
    //    This will call ChatGPT multiple times in chunks of 10 addresses
    //    until we have generated `totalNeeded` addresses.
    await generateMultipleAddressDataWithCallback(
      totalNeeded,
      10,
      onChunkReceived
    );

    console.log(
      `   -> Successfully generated a total of ${allGeneratedAddresses.length} addresses in memory.`
    );

    // 5) Next, we slice them out in pairs (2 addresses per user).
    const insertedAddresses = [];
    let pointer = 0; // points into allGeneratedAddresses

    for (const user of usersWithoutAddresses) {
      // slice out 2 addresses for this user
      const userAddresses = allGeneratedAddresses.slice(pointer, pointer + 2);
      pointer += 2;

      // Insert them into the DB for this user
      for (const addr of userAddresses) {
        const { label, address1, address2, city, state, zipcode, country } =
          addr;

        try {
          const newAddress = await prisma.address.create({
            data: {
              userId: user.id,
              label: label || "Home",
              address1,
              address2,
              city,
              state,
              zipcode,
              country,
            },
          });
          insertedAddresses.push(newAddress);
          console.log(
            `      -> Created address ID ${newAddress.id} for user ${user.id}`
          );
        } catch (error) {
          console.error(
            `      -> Error inserting address into DB for user ${user.id}:`,
            error
          );
          // Continue on to the next address or next user
        }
      }
    }

    return res.json({
      success: true,
      message: `Successfully generated 2 addresses for each missing user.`,
      data: insertedAddresses,
    });
  } catch (error) {
    console.error("Error in generateMissingAddresses:", error);
    return res.status(500).json({
      error: "Internal server error while generating missing addresses.",
    });
  }
}

module.exports = {
  generateMissingAddresses,
};
