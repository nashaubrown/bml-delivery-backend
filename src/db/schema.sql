-- ============================================================
-- BML Card Delivery Platform - PostgreSQL Schema
-- ============================================================

-- Users (login accounts for agents and admins)
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,  -- bcrypt hash
  role        VARCHAR(20)  NOT NULL CHECK (role IN ('agent', 'admin', 'controller')),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Agents (delivery personnel — internal or third-party like Maldives Post)
CREATE TABLE IF NOT EXISTS agents (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20)  NOT NULL CHECK (type IN ('internal', 'third-party')),
  region      VARCHAR(50)  NOT NULL,
  phone       VARCHAR(30),
  status      VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  region      VARCHAR(50)  NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Cards (each row = one bank card to be delivered)
CREATE TABLE IF NOT EXISTS cards (
  id              SERIAL PRIMARY KEY,
  card_ref        VARCHAR(20) UNIQUE NOT NULL,  -- e.g. C001, C002
  customer_name   VARCHAR(100) NOT NULL,
  customer_phone  VARCHAR(30)  NOT NULL,
  address         TEXT         NOT NULL,
  region          VARCHAR(50)  NOT NULL,
  branch_id       INT REFERENCES branches(id),
  agent_id        INT REFERENCES agents(id) ON DELETE SET NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','assigned','in_transit','delivered','failed')),
  attempt_count   INT NOT NULL DEFAULT 0,
  failure_reason  TEXT,
  notes           TEXT,
  assigned_at     TIMESTAMP,
  delivered_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Delivery Status Log (full audit trail of every status change)
CREATE TABLE IF NOT EXISTS delivery_logs (
  id              SERIAL PRIMARY KEY,
  card_id         INT REFERENCES cards(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL,
  notes           TEXT,
  failure_reason  TEXT,
  updated_by      INT REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Notification Log
CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  card_id         INT REFERENCES cards(id) ON DELETE CASCADE,
  customer_name   VARCHAR(100),
  event_type      VARCHAR(30) NOT NULL,
  message         TEXT NOT NULL,
  channel         VARCHAR(10) NOT NULL CHECK (channel IN ('sms', 'push', 'email')),
  sent_at         TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cards_status    ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_agent     ON cards(agent_id);
CREATE INDEX IF NOT EXISTS idx_cards_region    ON cards(region);
CREATE INDEX IF NOT EXISTS idx_cards_branch    ON cards(branch_id);
CREATE INDEX IF NOT EXISTS idx_logs_card       ON delivery_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_notif_card      ON notifications(card_id);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cards_updated_at') THEN
    CREATE TRIGGER cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agents_updated_at') THEN
    CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
