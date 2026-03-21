const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Serve model files from models/
app.use('/models', express.static(path.join(__dirname, 'models')));

app.listen(PORT, () => {
  console.log(`🧠 Brain Viewer running at http://localhost:${PORT}`);
});
