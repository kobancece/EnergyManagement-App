const express = require('express');
const router = express.Router();
const db = require('../models/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const saltRounds = 10;
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many login attempts from this IP, please try again after 15 minutes'
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
      return res.status(400).send({ message: 'Email and password are required' });
  }

  try {
      const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

      if (users.length === 0) {
          return res.status(401).send({ message: 'Invalid email' });
      }

      const user = users[0];
      const validPassword = await bcrypt.compare(password, user.passwordHash);

      if (!validPassword) {
          return res.status(401).send({ message: 'Invalid password' });
      }

      const deviceId = uuidv4();

      await db.execute('UPDATE users SET deviceId = ? WHERE userId = ?', [deviceId, user.userId]);

      // Store userId in session
      req.session.userId = user.userId;
      res.status(200).send({ success: true, userId: user.userId, message: 'Login successful' });
  } catch (error) {
      res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  const { email, username, password, firstName, lastName, phoneNumber, address } = req.body;
  if (!email || !username || !password || !firstName || !lastName || !phoneNumber || !address) {
      return res.status(400).send({ message: 'All fields are required' });
  }
  try {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const [newUser] = await db.execute(`
          INSERT INTO users (email, username, passwordHash, firstName, lastName, phoneNumber, address, createdAt) 
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [email, username, hashedPassword, firstName, lastName, phoneNumber, address]);
      res.status(201).send({ message: 'User registered successfully', userId: newUser.insertId });
  } catch (error) {
      res.status(500).send({ message: 'Error registering user', error: error.message });
  }
});

// Endpoint to fetch wash sessions
router.get('/washsessions', async (req, res) => {
  const userId = req.session.userId; // Get userId from session

  if (!userId) {
      return res.status(401).send({ message: 'Unauthorized' });
  }

  try {
      const [washSessions] = await db.execute('SELECT * FROM washsessions WHERE userId = ?', [userId]);
      res.status(200).json(washSessions);
  } catch (error) {
      res.status(500).send({ message: 'Error retrieving wash sessions', error: error.message });
  }
});

// Endpoint to generate usage tips
router.get('/tips', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
      return res.status(401).send({ message: 'Unauthorized' });
  }

  try {
      // Fetch user's wash sessions
      const [washSessions] = await db.execute('SELECT * FROM washsessions WHERE userId = ?', [userId]);

      const totalElectricConsumption = washSessions.reduce((sum, session) => sum + session.electricConsumption, 0);
      const totalWaterConsumption = washSessions.reduce((sum, session) => sum + session.waterConsumption, 0);
      const totalCost = washSessions.reduce((sum, session) => sum + session.totalCost, 0);

      const avgElectricConsumption = totalElectricConsumption / washSessions.length;
      const avgWaterConsumption = totalWaterConsumption / washSessions.length;
      const avgCost = totalCost / washSessions.length;

      const tips = [];
      if (avgElectricConsumption > 100) {
          tips.push("Your average electric consumption is quite high. Consider using energy-efficient appliances to reduce consumption.");
      } else {
          tips.push("Great job! Your electric consumption is within a good range. Keep it up!");
      }

      if (avgWaterConsumption > 500) {
          tips.push("Your water consumption is above average. Try using water-saving techniques, such as shorter wash cycles.");
      } else {
          tips.push("Your water consumption is within a reasonable range. Continue practicing good habits.");
      }

      if (avgCost > 50) {
          tips.push("Your total cost is relatively high. Look into peak-hour rates and try to run appliances during off-peak hours to save money.");
      } else {
          tips.push("Your cost is well-managed. Keep monitoring your usage to maintain this balance.");
      }

      res.status(200).json(tips);
  } catch (error) {
      res.status(500).send({ message: 'Error generating tips', error: error.message });
  }
});

// Enable 2FA
router.post('/enable-2fa', async (req, res) => {
  const userId = req.body.userId;
  const secret = speakeasy.generateSecret({ length: 20 });

  // Store the secret in the database for the user
  await db.execute('UPDATE users SET twoFASecret = ? WHERE userId = ?', [secret.base32, userId]);

  qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
    if (err) {
      return res.status(500).send({ message: 'Error generating QR code' });
    }
    res.send({ secret: secret.base32, qrCode: data_url });
  });
});

// Verify 2FA
router.post('/verify-2fa', (req, res) => {
  const { userId, token } = req.body;

  // Retrieve the stored secret for the user
  db.execute('SELECT twoFASecret FROM users WHERE userId = ?', [userId])
    .then(([rows]) => {
      if (rows.length === 0) {
        return res.status(400).send({ message: 'User not found' });
      }

      const secret = rows[0].twoFASecret;
      const tokenValidates = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token
      });

      if (tokenValidates) {
        res.send({ message: '2FA verified successfully' });
      } else {
        res.status(400).send({ message: 'Invalid 2FA token' });
      }
    })
    .catch(err => {
      res.status(500).send({ message: 'Error verifying 2FA', error: err.message });
    });
});

// Fetch monthly consumption data
router.get('/monthly-consumption', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const [results] = await db.query(`
      SELECT 
        DATE_FORMAT(washTimestamp, '%Y-%m') as month, 
        SUM(electricConsumption) as totalElectricConsumption, 
        SUM(waterConsumption) as totalWaterConsumption
      FROM washsessions 
      WHERE userId = ?
      GROUP BY month
      ORDER BY month
    `, [userId]);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error retrieving monthly consumption data:', error);
    res.status(500).send({ message: 'Error retrieving monthly consumption data', error: error.message });
  }
});

// Fetch yearly consumption data
router.get('/yearly-consumption', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const [results] = await db.query(`
      SELECT 
        DATE_FORMAT(washTimestamp, '%Y') as year, 
        SUM(electricConsumption) as totalElectricConsumption, 
        SUM(waterConsumption) as totalWaterConsumption
      FROM washsessions 
      WHERE userId = ?
      GROUP BY year
      ORDER BY year
    `, [userId]);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error retrieving yearly consumption data:', error);
    res.status(500).send({ message: 'Error retrieving yearly consumption data', error: error.message });
  }
});

// Fetch monthly cost data
router.get('/monthly-cost', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const [results] = await db.query(`
      SELECT 
        DATE_FORMAT(washTimestamp, '%Y-%m') as month, 
        SUM(totalCost) as totalCost
      FROM washsessions 
      WHERE userId = ?
      GROUP BY month
      ORDER BY month
    `, [userId]);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error retrieving monthly cost data:', error);
    res.status(500).send({ message: 'Error retrieving monthly cost data', error: error.message });
  }
});

// Fetch yearly cost data
router.get('/yearly-cost', async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const [results] = await db.query(`
      SELECT 
        DATE_FORMAT(washTimestamp, '%Y') as year, 
        SUM(totalCost) as totalCost
      FROM washsessions 
      WHERE userId = ?
      GROUP BY year
      ORDER BY year
    `, [userId]);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error retrieving yearly cost data:', error);
    res.status(500).send({ message: 'Error retrieving yearly cost data', error: error.message });
  }
});


module.exports = router;
