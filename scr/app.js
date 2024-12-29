const express = require("express");
const routes = require("./routes");

const app = express();

// JSON parsing middleware
app.use(express.json());

// Mount routes
app.use("/api", routes);

module.exports = app;
