// server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const routes = require("./routes");
const { port } = require("./config");

// Create Express instance
const app = express();

// JSON parsing middleware
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, "..", "public")));

// Mount routes
app.use("/api", routes);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
