const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const categories = new Set(['books','clothes','food','medicine','blood','other']);
const types = new Set(['give','need']);

router.get('/', async (req, res, next) => {
  try {
    const where = ["l.status = 'active'"];
    const params = [];
    const type = String(req.query.type || '');
    const category = String(req.query.category || '');
    const q = String(req.query.q || '').trim();
    if (types.has(type)) { where.push('l.type = ?'); params.push(type); }
    if (categories.has(category)) { where.push('l.category = ?'); params.push(category); }
    if (q) { where.push('(l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const [rows] = await db.execute(
      `SELECT l.id, l.user_id AS userId, l.type, l.title, l.category, l.description, l.condition_label AS conditionLabel, l.quantity, l.location, l.image_url AS imageUrl, l.status, l.created_at AS createdAt, u.name AS ownerName FROM listings l JOIN users u ON u.id = l.user_id WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT ${limit}`,
      params
    );
    res.json({ listings: rows });
  } catch (err) { next(err); }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, user_id AS userId, type, title, category, description, condition_label AS conditionLabel, quantity, location, image_url AS imageUrl, status, created_at AS createdAt FROM listings WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ listings: rows });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT l.id, l.user_id AS userId, l.type, l.title, l.category, l.description, l.condition_label AS conditionLabel, l.quantity, l.location, l.image_url AS imageUrl, l.status, l.created_at AS createdAt, u.name AS ownerName FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ? AND l.status <> 'removed'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Listing not found.' });
    res.json({ listing: rows[0] });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const type = String(req.body.type || '');
    const title = String(req.body.title || '').trim();
    const category = String(req.body.category || '');
    const description = String(req.body.description || '').trim();
    const conditionLabel = String(req.body.conditionLabel || 'Good').trim().slice(0, 40);
    const quantity = String(req.body.quantity || '1').trim().slice(0, 80);
    const location = String(req.body.location || '').trim();
    const imageUrl = String(req.body.imageUrl || '').trim();
    if (!types.has(type)) return res.status(400).json({ message: 'Choose Give or Need.' });
    if (!categories.has(category)) return res.status(400).json({ message: 'Choose a valid category.' });
    if (title.length < 3 || title.length > 120) return res.status(400).json({ message: 'Title must be 3–120 characters.' });
    if (description.length < 10 || description.length > 5000) return res.status(400).json({ message: 'Description must be 10–5000 characters.' });
    if (location.length < 2 || location.length > 180) return res.status(400).json({ message: 'Enter a valid location.' });
    if (imageUrl && !/^https?:\/\/.+/i.test(imageUrl)) return res.status(400).json({ message: 'Image URL must start with http:// or https://.' });
    const [result] = await db.execute(
      'INSERT INTO listings (user_id, type, title, category, description, condition_label, quantity, location, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, type, title, category, description, conditionLabel, quantity, location, imageUrl || null]
    );
    res.status(201).json({ message: 'Listing published.', id: result.insertId });
  } catch (err) { next(err); }
});

router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!['active','completed','removed'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });
    const [result] = await db.execute('UPDATE listings SET status = ? WHERE id = ? AND user_id = ?', [status, req.params.id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Listing not found or you do not own it.' });
    res.json({ message: 'Listing status updated.' });
  } catch (err) { next(err); }
});

module.exports = router;
