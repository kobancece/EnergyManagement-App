const express = require('express');
const router = express.Router();
const db = require('../models/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const saltRounds = 10; // for bcrypt
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes'
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password, token } = req.body;

  if (!email || !password) {
    return res.status(400).send({ message: 'Email and password are required' });
  }

  try {
    const [user] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

    if (user.length === 0) {
      return res.status(401).send({ message: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user[0].passwordHash);
    if (!validPassword) {
      return res.status(401).send({ message: 'Invalid email or password' });
    }

    // Check if 2FA is enabled
    if (user[0].twoFASecret) {
      const tokenValidates = speakeasy.totp.verify({
        secret: user[0].twoFASecret,
        encoding: 'base32',
        token: token
      });

      if (!tokenValidates) {
        return res.status(401).send({ message: 'Invalid 2FA token' });
      }
    }

    // Assuming you want to create a JSON Web Token for the session
    const jwtToken = jwt.sign({ userId: user[0].userId, role: user[0].role }, 'your_secret_key', { expiresIn: '1h' });

    res.status(200).send({ message: 'Authentication successful', token: jwtToken });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
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

router.post('/login', async (req, res) => {
  const { email, password, token } = req.body;

  if (!email || !password) {
    return res.status(400).send({ message: 'Email and password are required' });
  }

  try {
    const [user] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

    if (user.length === 0) {
      return res.status(401).send({ message: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user[0].passwordHash);
    if (!validPassword) {
      return res.status(401).send({ message: 'Invalid email or password' });
    }

    // Check if 2FA is enabled
    if (user[0].twoFASecret) {
      const tokenValidates = speakeasy.totp.verify({
        secret: user[0].twoFASecret,
        encoding: 'base32',
        token: token
      });

      if (!tokenValidates) {
        return res.status(401).send({ message: 'Invalid 2FA token' });
      }
    }

    // Assuming you want to create a JSON Web Token for the session
    const jwtToken = jwt.sign({ userId: user[0].userId, role: user[0].role }, 'your_secret_key', { expiresIn: '1h' });

    res.status(200).send({ message: 'Authentication successful', token: jwtToken });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});

router.get('/tips', async (req, res) => {
  try {
    const [monthlyConsumption] = await db.query(`
      SELECT 
        DATE_FORMAT(washTimestamp, '%Y-%m') as month, 
        SUM(electricConsumption) as totalElectricConsumption, 
        SUM(waterConsumption) as totalWaterConsumption,
        SUM(totalCost) as totalCost
      FROM washsessions 
      GROUP BY month
      ORDER BY month
    `);
    
    const tips = generateTips(monthlyConsumption);
    res.status(200).json(tips);
  } catch (error) {
    console.error('Error generating tips:', error);
    res.status(500).send({ message: 'Error generating tips', error: error.message });
  }
});

function generateTips(data) {
  const tips = [];
  const avgElectricConsumption = data.reduce((acc, curr) => acc + curr.totalElectricConsumption, 0) / data.length;
  const avgWaterConsumption = data.reduce((acc, curr) => acc + curr.totalWaterConsumption, 0) / data.length;
  const avgCost = data.reduce((acc, curr) => acc + curr.totalCost, 0) / data.length;

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

  return tips;
}

module.exports = router;


router.get('/yearly-consumption', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        DATE_FORMAT(washTimestamp, '%Y') as year, 
        SUM(electricConsumption) as totalElectricConsumption, 
        SUM(waterConsumption) as totalWaterConsumption,
        SUM(totalCost) as totalCost
      FROM washsessions 
      GROUP BY year
      ORDER BY year
    `);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error retrieving yearly consumption data:', error);
    res.status(500).send({ message: 'Error retrieving yearly consumption data', error: error.message });
  }
});

router.get('/monthly-consumption', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        DATE_FORMAT(washTimestamp, '%Y-%m') as month, 
        SUM(electricConsumption) as totalElectricConsumption, 
        SUM(waterConsumption) as totalWaterConsumption,
        SUM(totalCost) as totalCost
      FROM washsessions 
      GROUP BY month
      ORDER BY month
    `);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error retrieving monthly consumption data:', error);
    res.status(500).send({ message: 'Error retrieving monthly consumption data', error: error.message });
  }
});


router.post('/register', async (req, res) => {
  const { email, username, password, firstName, lastName, phoneNumber, address } = req.body;
  if (!email || !username || !password || !firstName || !lastName || !phoneNumber || !address) {
    return res.status(400).send({ message: 'All fiuserelds are required' });
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

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send({ message: 'Email and password are required' });
  }

  try {
    const [user] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

    if (user.length === 0) {
      return res.status(401).send({ message: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user[0].passwordHash);
    if (!validPassword) {
      return res.status(401).send({ message: 'Invalid email or password' });
    }

    // Assuming you want to create a JSON Web Token for the session
    const token = jwt.sign({ userId: user[0].userId, role: user[0].role }, 'your_secret_key', { expiresIn: '1h' });

    res.status(200).send({ message: 'Authentication successful', token: token });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error', error: error.message });
  }
});



module.exports = router;
