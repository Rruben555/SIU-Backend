require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const ukmRoutes = require('./routes/ukm');
const pendaftarRoutes = require('./routes/pendaftar');
const authRouthes  =require('./routes/auth');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/ukm', ukmRoutes);
app.use('/pendaftar', pendaftarRoutes);
app.use('/auth',authRouthes)

app.get("/", (req, res) => {
  res.send("SIU-Backend is running...");
});


