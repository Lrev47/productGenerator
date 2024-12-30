// scr/server.js
require("dotenv").config();

// 1. Import express and path here:
const express = require("express");
const path = require("path");

const app = require("./app");
const { port } = require("./config");

// 2. Serve the public folder before any other routes
app.use(express.static(path.join(__dirname, "..", "public")));

// 3. Mount any additional routes after
const imageRoutes = require("./routes/imageRoutes");
app.use("/api/images", imageRoutes);

// Finally, start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
