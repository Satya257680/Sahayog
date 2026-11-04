# Sahayog — React + Node.js + Express + MySQL

A full-stack starter for the Sahayog community-help platform: people can give items for free or publish requests for things they need.

## Stack
- Frontend: React + Vite + React Router
- Backend: Node.js + Express
- Database: MySQL (`mysql2`)
- Security foundation: bcrypt password hashing, JWT authentication middleware, input validation, Helmet, CORS, rate limiting
- UI: responsive pastel pink/lavender design inspired by the supplied reference

## Pages / workflows
- Home: hero, search, category cards, nearby listings
- Give Something and Need Help pages
- Create a donation or need request
- Browse/search/filter listings
- Listing detail page and contact action
- Login and register
- My Listings dashboard; mark a listing completed
- Saved listings
- Messages API foundation (conversation creation and message send/list)

## Requirements
- Node.js 20+ recommended
- MySQL 8+
- npm

## 1. Create the database
Open MySQL Workbench and run `database/schema.sql`.

## 2. Configure the backend
Copy `server/.env.example` to `server/.env`, then update the MySQL credentials and JWT secret.

```env
PORT=5000
CLIENT_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=sahayog
JWT_SECRET=replace_with_a_long_random_secret
```

## 3. Install and run

From the project root:

```bash
npm install
npm --prefix server install
npm --prefix client install
npm run dev
```

- Frontend: http://localhost:5173
- API health check: http://localhost:5000/api/health

If you prefer separate terminals:
```bash
npm run dev:server
npm run dev:client
```

## Demo flow
1. Register a user.
2. Log in.
3. Open Give or Need Help and publish a listing.
4. Browse listings and open the detail page.
5. Save a listing or contact its owner.
6. Open My Listings to manage your posts.

## API overview
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (JWT)
- `GET /api/listings?type=give|need&category=books&q=...`
- `GET /api/listings/:id`
- `POST /api/listings` (JWT)
- `PATCH /api/listings/:id/status` (JWT, owner only)
- `GET /api/saved` (JWT)
- `POST /api/saved/:listingId` (JWT)
- `DELETE /api/saved/:listingId` (JWT)
- `POST /api/conversations` (JWT)
- `GET /api/conversations` (JWT)
- `GET /api/conversations/:id/messages` (JWT participant only)
- `POST /api/conversations/:id/messages` (JWT participant only)

## Important production notes
This is a development-ready starter, not a fully audited production service. Before public launch:
- Use HTTPS and a strong unique JWT secret.
- Configure exact CORS origins, secure deployment environment variables and backups.
- Add email/phone verification, password reset, account moderation, reporting and audit logs.
- Add real image uploads with validation and object storage (currently accepts an image URL).
- Add privacy controls and abuse prevention.
- Blood and medicine listings require careful legal/safety review, moderation and local policy checks. Do not use this demo to coordinate urgent medical care without appropriate verification.
- Messages are persisted in MySQL but do not use WebSockets for real-time delivery yet.
