const path = require("path");
const express = require("express");
const app = express();

const staticPath = path.join(__dirname, "static");
app.use(express.static(staticPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
