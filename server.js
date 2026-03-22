const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "pages"));

app.get("/", (req, res) => {
    res.render("home", { currentPage: "home" });
});

app.get("/brain", (req, res) => {
    res.render("brain", { currentPage: "brain" });
});

app.get("/info", (req, res) => {
    res.render("info", { currentPage: "info" });
});

app.get("/info-debug", (req, res) => {
    res.send("info route is wired up and server is running");
});

app.get("/sources", (req, res) => {
    res.render("sources", {currentPage: "sources"});
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});