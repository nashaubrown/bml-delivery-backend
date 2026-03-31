const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin', 'controller'));

// GET /api/reports/summary  — top-level KPIs
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                           AS total,
        COUNT(*) FILTER (WHERE status = 'delivered')      AS delivered,
        COUNT(*) FILTER (WHERE status = 'in_transit')     AS in_transit,
        COUNT(*) FILTER (WHERE status = 'assigned')       AS assigned,
        COUNT(*) FILTER (WHERE status = 'pending')        AS pending,
        COUNT(*) FILTER (WHERE status = 'failed')         AS failed,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / NULLIF(COUNT(*),0), 1) AS success_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/86400) FILTER (WHERE status = 'delivered'), 1) AS avg_delivery_days
      FROM cards
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reports/by-region
router.get('/by-region', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        region,
        COUNT(*)                                           AS total,
        COUNT(*) FILTER (WHERE status = 'delivered')      AS delivered,
        COUNT(*) FILTER (WHERE status = 'pending')        AS pending,
        COUNT(*) FILTER (WHERE status = 'failed')         AS failed,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / NULLIF(COUNT(*),0),1) AS delivery_rate
      FROM cards
      GROUP BY region ORDER BY total DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reports/agent-performance
router.get('/agent-performance', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        a.id, a.name, a.type, a.region,
        COUNT(c.id)                                           AS total_assigned,
        COUNT(c.id) FILTER (WHERE c.status = 'delivered')    AS delivered,
        COUNT(c.id) FILTER (WHERE c.status = 'failed')       AS failed,
        ROUND(100.0 * COUNT(c.id) FILTER (WHERE c.status = 'delivered') / NULLIF(COUNT(c.id),0),1) AS success_rate,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.delivered_at - c.assigned_at))/3600) FILTER (WHERE c.status = 'delivered'),1) AS avg_hours_to_deliver
      FROM agents a
      LEFT JOIN cards c ON c.agent_id = a.id
      WHERE a.status = 'active'
      GROUP BY a.id, a.name, a.type, a.region
      ORDER BY delivered DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reports/daily-trend?days=7
router.get('/daily-trend', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  try {
    const { rows } = await pool.query(`
      SELECT
        DATE(delivered_at) AS date,
        COUNT(*) AS delivered
      FROM cards
      WHERE status = 'delivered'
        AND delivered_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY DATE(delivered_at)
      ORDER BY date ASC
    `, [days]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
