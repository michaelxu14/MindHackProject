const express = require('express');
const fs = require('fs');
const path = require('path');


const app = express();
const PORT = 3000;


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));


app.set("view engine", "pug");
app.set("views", path.join(__dirname, "pages"))



app.get("/", (req, res) =>{
    res.render("home", {currentPage: "home"});
});


app.listen(PORT, ()=>{
    console.log(`Server running at http://localhost:${PORT}`);
});






