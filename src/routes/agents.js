const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/agents
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        a.*,
        COUNT(c.id) FILTER (WHERE c.status = 'assigned')   AS assigned_count,
        COUNT(c.id) FILTER (WHERE c.status = 'in_transit') AS in_transit_count,
        COUNT(c.id) FILTER (WHERE c.status = 'delivered')  AS delivered_count,
        COUNT(c.id) FILTER (WHERE c.status = 'failed')     AS failed_count
      FROM agents a
      LEFT JOIN cards c ON c.agent_id = a.id
      GROUP BY a.id
      ORDER BY a.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/agents/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*,
        COUNT(c.id) FILTER (WHERE c.status = 'delivered') AS delivered_count,
        COUNT(c.id) FILTER (WHERE c.status = 'assigned')  AS assigned_count
      FROM agents a
      LEFT JOIN cards c ON c.agent_id = a.id
      WHERE a.id = $1
      GROUP BY a.id
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/agents  — admin only
router.post('/', requireRole('admin', 'controller'), async (req, res) => {
  const { name, type, region, phone, status = 'active' } = req.body;
  if (!name || !type || !region) {
    return res.status(400).json({ error: 'name, type, and region are required' });
  }
  try {
    const { rows } = await pool.query(`
      INSERT INTO agents (name, type, region, phone, status)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [name, type, region, phone || null, status]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/agents/:id  — update agent info
router.put('/:id', requireRole('admin', 'controller'), async (req, res) => {
  const { name, type, region, phone, status } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE agents
      SET name   = COALESCE($1, name),
          type   = COALESCE($2, type),
          region = COALESCE($3, region),
          phone  = COALESCE($4, phone),
          status = COALESCE($5, status),
          updated_at = NOW()
      WHERE id = $6 RETURNING *
    `, [name, type, region, phone, status, req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
