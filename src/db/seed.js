const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function seed() {
  console.log('Seeding database...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data
    await client.query('DELETE FROM delivery_logs');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM cards');
    await client.query('DELETE FROM agents');
    await client.query('DELETE FROM branches');
    await client.query('DELETE FROM users');

    // Seed branches
    const branchResult = await client.query(`
      INSERT INTO branches (name, code, region) VALUES
      ('Male Branch', 'MLB', 'Male'),
      ('Hulhumale Branch', 'HLB', 'Male'),
      ('Addu City Branch', 'ADB', 'South'),
      ('Kulhudhuffushi Branch', 'KLB', 'North'),
      ('Naifaru Branch', 'NFB', 'North-Central')
      RETURNING id, code
    `);
    const branches = {};
    branchResult.rows.forEach(b => { branches[b.code] = b.id; });
    console.log('Branches seeded:', Object.keys(branches));

    // Seed users (password: Password123!)
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password123!', 10);
    const userResult = await client.query(`
      INSERT INTO users (email, password_hash, full_name, role, branch_id) VALUES
      ($1, $2, 'Admin User', 'admin', $3),
      ($1, $2, 'Controller User', 'controller', $3),
      ($1, $2, 'Agent Male 1', 'agent', $4),
      ($1, $2, 'Agent Male 2', 'agent', $4),
      ($1, $2, 'Agent Hulhumale', 'agent', $5),
      ($1, $2, 'Agent Addu', 'agent', $6)
      RETURNING id, full_name, role
    `, ['admin@bml.com.mv', hash, branches['MLB'], branches['MLB'], branches['HLB'], branches['ADB']]);
    console.log('Users seeded:', userResult.rows.length);

    // Seed agents linked to agent users
    const agentUsers = userResult.rows.filter(u => u.role === 'agent');
    for (const u of agentUsers) {
      await client.query(
        'INSERT INTO agents (user_id, employee_id, phone) VALUES ($1, $2, $3)',
        [u.id, 'EMP' + Math.floor(Math.random()*10000), '+960 7' + Math.floor(Math.random()*1000000)]
      );
    }
    console.log('Agents seeded:', agentUsers.length);

    // Seed cards
    const statuses = ['pending', 'assigned', 'delivered', 'failed'];
    const cardTypes = ['debit', 'credit', 'prepaid'];
    for (let i = 1; i <= 50; i++) {
      const branchKeys = Object.keys(branches);
      const bKey = branchKeys[i % branchKeys.length];
      await client.query(`
        INSERT INTO cards (card_number, cardholder_name, card_type, status, branch_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '$6 days')
      `, [
        '4532' + String(i).padStart(12, '0'),
        'Customer ' + i,
        cardTypes[i % cardTypes.length],
        statuses[i % statuses.length],
        branches[bKey],
        Math.floor(Math.random() * 30)
      ]);
    }
    console.log('Cards seeded: 50');

    // Seed notifications
    const notifMessages = [
      'New card batch received at Male Branch',
      'Card delivery completed for batch #1023',
      'Agent reported failed delivery - card returned',
      'System maintenance scheduled for Sunday',
      'New agent onboarded at Hulhumale Branch'
    ];
    for (let i = 0; i < notifMessages.length; i++) {
      await client.query(`
        INSERT INTO notifications (message, type, created_at)
        VALUES ($1, $2, NOW() - INTERVAL '$3 hours')
      `, [notifMessages[i], i % 2 === 0 ? 'info' : 'success', i * 3]);
    }
    console.log('Notifications seeded:', notifMessages.length);

    await client.query('COMMIT');
    console.log('Database seeded successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
