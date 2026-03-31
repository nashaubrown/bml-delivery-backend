const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT u.*, a.id AS agent_id FROM users u LEFT JOIN agents a ON a.user_id = u.id WHERE u.email = $1',
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agentId: user.agent_id || null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    return res.json({ token, user: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me  — returns current user from token
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
