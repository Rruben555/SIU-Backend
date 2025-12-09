const express = require('express');
const cors = require('cors');
const ukmRoutes = require('./routes/ukm');
const pendaftarRoutes = require('./routes/pendaftar');
const authRouthes  =require('./routes/auth');
const app = express();
const PORT = process.env.PORT || 3001;
const komentarRoutes = require('./routes/ukm-komentar');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/ukm', ukmRoutes);
app.use('/pendaftar', pendaftarRoutes);
app.use('/auth',authRouthes)
app.use('/ukm-komentar', komentarRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

