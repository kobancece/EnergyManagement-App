const express = require('express');
const router = express.Router();
const db = require('../models/db');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const rateLimit = require('express-rate-limit');

const twofaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many attempts from this IP, please try again after 15 minutes'
  });

// Enable 2FA with rate limiting
router.post('/enable-2fa', twofaLimiter, async (req, res) => {
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
  
  // Verify 2FA with rate limiting
  router.post('/verify-2fa', twofaLimiter, (req, res) => {
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

module.exports = router;
