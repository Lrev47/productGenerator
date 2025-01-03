// src/routes/userRoutes.js

const express = require("express");
const router = express.Router();

// Controllers
const { generateUsers } = require("../controllers/users/userController");
const {
  generateUserImageById,
  generateMissingUserImages,
  handleRunpodCallback,
} = require("../controllers/users/userImageController");

/**
 * 1) Generate users in bulk
 *    POST /users/generate-users
 */
router.post("/generate-users", generateUsers);

/**
 * 2) Generate an image for a specific user by ID
 *    POST /users/images/generate-by-id/:id
 */
router.post("/images/generate-by-id/:id", generateUserImageById);

/**
 * 3) Generate images for all users missing an image
 *    POST /users/images/generate-missing
 */
router.post("/images/generate-missing", generateMissingUserImages);

// NEW: Endpoint for handling ephemeral callback
router.post("/images/runpod-callback", handleRunpodCallback);

module.exports = router;
