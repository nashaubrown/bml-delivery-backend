// Run this once to create the tables: npm run db:setup
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function setup() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Database schema created successfully.');
  } catch (err) {
    console.error('❌ Schema setup failed:', err.message);
  } finally {
    await pool.end();
  }
}

setup();
