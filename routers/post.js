const express = require('express');
const router = express.Router();
const db = require('../models/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const saltRounds = 10; // for bcrypt

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
