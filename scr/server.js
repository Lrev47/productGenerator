// scr/server.js
require("dotenv").config();
const app = require("./app");
const { port } = require("./config");

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
const imageRoutes = require("./routes/imageRoutes");
app.use("/api/images", imageRoutes);
