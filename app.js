require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit'); 
const session = require('express-session');
const energymanagementRouter = require('./routers/post');
const twofaRouter = require('./routers/twofa');

const app = express();

// Configure session middleware
app.use(session({
  secret: process.env.sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use(cors()); 
app.use(bodyParser.json()); // for parsing application/json
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public'

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply rate limiting to login and 2FA routes
app.use('/energymanagement/login', limiter);
app.use('/twofa/enable-2fa', limiter);
app.use('/twofa/verify-2fa', limiter);

// Use your routers here
app.use('/energymanagement', energymanagementRouter);
app.use('/twofa', twofaRouter);

// Serve the HTML page for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
