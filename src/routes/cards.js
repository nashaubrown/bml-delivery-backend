const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/cards  — list cards with optional filters
// Query params: status, region, agent_id, branch_id, q (search)
router.get('/', async (req, res) => {
  const { status, region, agent_id, q } = req.query;
  const conditions = [];
  const params = [];

  // Agents can only see their own cards
  if (req.user.role === 'agent') {
    params.push(req.user.agentId);
    conditions.push(`c.agent_id = $${params.length}`);
  } else if (agent_id) {
    params.push(agent_id);
    conditions.push(`c.agent_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`c.status = $${params.length}`);
  }
  if (region) {
    params.push(region);
    conditions.push(`c.region = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(c.customer_name ILIKE $${params.length} OR c.card_ref ILIKE $${params.length} OR c.address ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(`
      SELECT
        c.id, c.card_ref, c.customer_name, c.customer_phone,
        c.address, c.region, c.status, c.attempt_count,
        c.failure_reason, c.notes, c.assigned_at, c.delivered_at,
        c.created_at, c.updated_at,
        b.name  AS branch_name,
        a.name  AS agent_name,
        a.type  AS agent_type
      FROM cards c
      LEFT JOIN branches b ON b.id = c.branch_id
      LEFT JOIN agents   a ON a.id = c.agent_id
      ${where}
      ORDER BY c.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/cards/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, b.name AS branch_name, a.name AS agent_name, a.phone AS agent_phone
      FROM cards c
      LEFT JOIN branches b ON b.id = c.branch_id
      LEFT JOIN agents   a ON a.id = c.agent_id
      WHERE c.id = $1
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Card not found' });

    // Fetch delivery log for this card
    const { rows: logs } = await pool.query(`
      SELECT dl.*, u.name AS updated_by_name
      FROM delivery_logs dl
      LEFT JOIN users u ON u.id = dl.updated_by
      WHERE dl.card_id = $1
      ORDER BY dl.created_at DESC
    `, [rows[0].id]);

    res.json({ ...rows[0], logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/cards/:id/status  — update delivery status
router.put('/:id/status', async (req, res) => {
  const { status, notes, failure_reason } = req.body;
  const validStatuses = ['pending', 'assigned', 'in_transit', 'delivered', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update card
    const updates = { status, notes, updated_at: new Date() };
    if (status === 'in_transit' || status === 'assigned') {
      updates.assigned_at = new Date();
    }
    if (status === 'delivered') {
      updates.delivered_at = new Date();
    }
    if (status === 'failed') {
      updates.failure_reason = failure_reason || null;
    }

    const { rows } = await client.query(`
      UPDATE cards
      SET status = $1, notes = COALESCE($2, notes),
          failure_reason = $3,
          attempt_count = CASE WHEN $1 = 'failed' THEN attempt_count + 1 ELSE attempt_count END,
          delivered_at  = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [status, notes || null, failure_reason || null, req.params.id]);

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Card not found' });
    }

    // Log the status change
    await client.query(`
      INSERT INTO delivery_logs (card_id, status, notes, failure_reason, updated_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [rows[0].id, status, notes || null, failure_reason || null, req.user.id]);

    // Simulate notification log entry
    const notifMsg = {
      delivered:  'Your BML card has been delivered successfully.',
      failed:     'Card delivery attempt failed. Our agent will try again.',
      in_transit: 'Your BML card is out for delivery today.',
      assigned:   'Your BML card has been assigned for delivery.',
    }[status];

    if (notifMsg) {
      await client.query(`
        INSERT INTO notifications (card_id, customer_name, event_type, message, channel)
        VALUES ($1, $2, $3, $4, 'sms')
      `, [rows[0].id, rows[0].customer_name, status, notifMsg]);
    }

    await client.query('COMMIT');
    res.json({ card: rows[0], message: `Status updated to "${status}"` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/cards/assign/bulk  — admin: assign multiple cards to one agent
router.post('/assign/bulk', requireRole('admin', 'controller'), async (req, res) => {
  const { card_ids, agent_id } = req.body;
  if (!Array.isArray(card_ids) || !card_ids.length || !agent_id) {
    return res.status(400).json({ error: 'card_ids (array) and agent_id are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify agent exists and is active
    const { rows: agentRows } = await client.query(
      `SELECT * FROM agents WHERE id = $1 AND status = 'active'`, [agent_id]
    );
    if (!agentRows[0]) return res.status(404).json({ error: 'Agent not found or inactive' });

    // Update all selected cards
    const { rowCount } = await client.query(`
      UPDATE cards
      SET agent_id = $1, status = 'assigned', assigned_at = NOW(), updated_at = NOW()
      WHERE id = ANY($2::int[]) AND status IN ('pending', 'failed')
    `, [agent_id, card_ids]);

    // Log each assignment
    for (const cardId of card_ids) {
      await client.query(`
        INSERT INTO delivery_logs (card_id, status, notes, updated_by)
        VALUES ($1, 'assigned', $2, $3)
      `, [cardId, `Assigned to ${agentRows[0].name}`, req.user.id]);
    }

    await client.query('COMMIT');
    res.json({ assigned: rowCount, agent: agentRows[0].name });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
