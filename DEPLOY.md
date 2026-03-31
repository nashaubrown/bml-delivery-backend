# BML Card Delivery Platform — Deployment Guide

## What You're Deploying

| Part        | Technology          | Where it lives                     |
|-------------|---------------------|------------------------------------|
| **Backend** | Node.js + Express   | Railway or Render (cloud server)   |
| **Database**| PostgreSQL          | Railway or Render (managed DB)     |
| **Frontend**| HTML file           | Netlify Drop (or any static host)  |

---

## Step 1 — Deploy the Backend on Railway (Recommended)

Railway is the easiest option — free tier, automatic deploys, managed PostgreSQL.

### 1.1 Create a GitHub Repository

1. Go to https://github.com and create a new **private** repository named `bml-delivery-backend`
2. Upload all the files from this `bml-backend` folder into that repo
3. Your repo should look like this:
   ```
   bml-delivery-backend/
   ├── package.json
   ├── .env.example
   ├── src/
   │   ├── index.js
   │   ├── db/
   │   │   ├── pool.js
   │   │   ├── schema.sql
   │   │   ├── setup.js
   │   │   └── seed.js
   │   ├── middleware/
   │   │   └── auth.js
   │   └── routes/
   │       ├── auth.js
   │       ├── cards.js
   │       ├── agents.js
   │       ├── notifications.js
   │       ├── inventory.js
   │       └── reports.js
   ```

### 1.2 Sign Up & Deploy on Railway

1. Go to https://railway.app and sign up with your GitHub account
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `bml-delivery-backend` repository
4. Railway will auto-detect it's a Node.js app and deploy it

### 1.3 Add a PostgreSQL Database

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**
2. Railway automatically adds `DATABASE_URL` to your environment — you don't need to set this manually

### 1.4 Set Environment Variables

In Railway ₒ your backend service → **Variables**, add:

| Variable        | Value                                          |
|-----------------|-----------------------------------------------|
| `JWT_SECRET`    | (generate one: open terminal, run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `JWT_EXPIRES_IN`| `24h`                                         |
| `NODE_ENV`      | `production`                                  |
| `FRONTEND_URL`  | *(add this after deploying frontend in Step 3)* |

### 1.5 Run Database Setup & Seed

In Railway → your service → **Settings** → temporarily set **Start Command** to:
```
node src/db/setup.js && node src/db/seed.js && node src/index.js
```
Deploy once, then change it back to just `node src/index.js` for future deploys.

Alternatively, use the Railway shell:
```bash
node src/db/setup.js
node src/db/seed.js
```

### 1.6 Get Your Backend URL

Railway gives you a public URL like: `https://bml-delivery-backend-production.up.railway.app`

Test it works by visiting: `https://your-railway-url.up.railway.app/health`

You should see: `{"status":"ok","db":"connected"}`

---

## Step 3 — Deploy the Frontend

The frontend is a single HTML file — dead simple to host.

### Option A: Netlify Drop (Easiest — no account needed)

1. Go to https://app.netlify.com/drop
2. Drag and drop `bml-card-delivery-app.html` onto the page
3. Netlify gives you a public URL instantly (e.g. `https://wonderful-name-123.netlify.app`)

### Step 4 — Connect Frontend to Backend

1. Open `bml-card-delivery-app.html` in a text editor
2. Find this line:
   ```js
   const API_BASE_URL = 'http://localhost:3001';
   ```
3. Replace with your Railway URL:
   ```js
   const API_BASE_URL = 'https://your-railway-url.up.railway.app';
   ```
4. Re-upload to Netlify
5. In Railway Variables, set `FPONTEND_URL` to your Netlify URL

---

## Security Checklist

- [ ] Change `JWT_SECRET` to a long random string
- [ ] Change all default passwords in the seed data
- [ ] Set `NODE_ENV=production`
- [ ] Restrict `FPONTEND_URL` to only your actual frontend domain
- [ ] Enable HTTPS (Railway does this automatically)
