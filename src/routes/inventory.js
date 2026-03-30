const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/inventory  — card counts grouped by branch
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        b.region,
        COUNT(c.id)                                             AS total,
        COUNT(c.id) FILTER (WHERE c.status = 'assigned')       AS assigned,
        COUNT(c.id) FILTER (WHERE c.status = 'in_transit')     AS in_transit,
        COUNT(c.id) FILTER (WHERE c.status = 'delivered')      AS delivered,
        COUNT(c.id) FILTER (WHERE c.status = 'pending')        AS pending,
        COUNT(c.id) FILTER (WHERE c.status = 'failed')         AS failed,
        ROUND(
          100.0 * COUNT(c.id) FILTER (WHERE c.status = 'delivered')
          / NULLIF(COUNT(c.id), 0), 1
        ) AS delivery_rate
      FROM branches b
      LEFT JOIN cards c ON c.branch_id = b.id
      GROUP BY b.id, b.name, b.region
      ORDER BY b.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
