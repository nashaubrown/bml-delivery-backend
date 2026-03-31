const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/notifications?event_type=delivered&channel=sms&limit=50
router.get('/', async (req, res) => {
  const { event_type, channel, limit = 50, offset = 0 } = req.query;
  const conditions = [];
  const params = [];

  if (event_type) {
    params.push(event_type);
    conditions.push(`n.event_type = $${params.length}`);
  }
  if (channel) {
    params.push(channel);
    conditions.push(`n.channel = $${params.length}`);
  }

  params.push(parseInt(limit));
  params.push(parseInt(offset));

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(`
      SELECT n.*, c.card_ref, c.region
      FROM notifications n
      LEFT JOIN cards c ON c.id = n.card_id
      ${where}
      ORDER BY n.sent_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
