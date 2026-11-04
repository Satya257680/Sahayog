const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { positiveId } = require('../utils/security');
const router = express.Router();

const categories = new Set(['books', 'clothes', 'food', 'medicine', 'blood', 'other']);
const types = new Set(['give', 'need']);
const statuses = new Set(['active', 'completed', 'removed']);

const LISTING_COLUMNS = `l.id, l.user_id AS userId, l.type, l.title, l.category, l.description,
  l.condition_label AS conditionLabel, l.quantity, l.location, l.image_url AS imageUrl,
  l.status, l.created_at AS createdAt, u.name AS ownerName`;
// Saved state comes from the database so hearts are correct after reload (F-10).
const SAVED_COLUMN = 'EXISTS(SELECT 1 FROM saved_listings s WHERE s.listing_id = l.id AND s.user_id = ?) AS isSaved';

function shape(row) { return { ...row, isSaved: Boolean(Number(row.isSaved || 0)) }; }

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const where = ["l.status = 'active'"];
    const params = [req.user?.id || 0];
    const type = String(req.query.type || '');
    const category = String(req.query.category || '');
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (types.has(type)) { where.push('l.type = ?'); params.push(type); }
    if (categories.has(category)) { where.push('l.category = ?'); params.push(category); }
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`;
      where.push('(l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ?)');
      params.push(like, like, like);
    }
    const limit = Math.min(Math.max(Math.floor(Number(req.query.limit)) || 50, 1), 100);
    const [rows] = await db.execute(
      `SELECT ${LISTING_COLUMNS}, ${SAVED_COLUMN} FROM listings l JOIN users u ON u.id = l.user_id
       WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC, l.id DESC LIMIT ${limit}`,
      params
    );
    res.json({ listings: rows.map(shape) });
  } catch (err) { next(err); }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const params = [req.user.id, req.user.id];
    let filter = "AND l.status <> 'removed'";
    if (statuses.has(status)) { filter = 'AND l.status = ?'; params.push(status); }
    const [rows] = await db.execute(
      `SELECT ${LISTING_COLUMNS}, ${SAVED_COLUMN},
         (SELECT COUNT(*) FROM conversations c WHERE c.listing_id = l.id) AS conversationCount
       FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.user_id = ? ${filter} ORDER BY l.created_at DESC, l.id DESC`,
      params
    );
    res.json({ listings: rows.map(r => ({ ...shape(r), conversationCount: Number(r.conversationCount) })) });
  } catch (err) { next(err); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid listing id.' }); // F-13
    const [rows] = await db.execute(
      `SELECT ${LISTING_COLUMNS}, ${SAVED_COLUMN} FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ? AND l.status <> 'removed'`,
      [req.user?.id || 0, id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Listing not found.' });
    res.json({ listing: shape(rows[0]) });
  } catch (err) { next(err); }
});

function readListing(body) {
  return {
    type: String(body.type || ''),
    title: String(body.title || '').trim(),
    category: String(body.category || ''),
    description: String(body.description || '').trim(),
    conditionLabel: String(body.conditionLabel || 'Good').trim().slice(0, 40) || 'Good',
    quantity: String(body.quantity || '1').trim().slice(0, 80) || '1',
    location: String(body.location || '').trim(),
    imageUrl: String(body.imageUrl || '').trim()
  };
}
function listingProblem(l) {
  if (!types.has(l.type)) return 'Choose Give or Need.';
  if (!categories.has(l.category)) return 'Choose a valid category.';
  if (l.title.length < 3 || l.title.length > 120) return 'Title must be 3–120 characters.';
  if (l.description.length < 10 || l.description.length > 5000) return 'Description must be 10–5000 characters.';
  if (l.location.length < 2 || l.location.length > 180) return 'Enter a valid location.';
  if (l.imageUrl && (!/^https?:\/\/\S+$/i.test(l.imageUrl) || l.imageUrl.length > 1000)) return 'Image URL must start with http:// or https://.';
  return null;
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const l = readListing(req.body);
    const problem = listingProblem(l);
    if (problem) return res.status(400).json({ message: problem });
    const [result] = await db.execute(
      'INSERT INTO listings (user_id, type, title, category, description, condition_label, quantity, location, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, l.type, l.title, l.category, l.description, l.conditionLabel, l.quantity, l.location, l.imageUrl || null]
    );
    res.status(201).json({ message: 'Listing published.', id: result.insertId });
  } catch (err) { next(err); }
});

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid listing id.' });
    const l = readListing(req.body);
    const problem = listingProblem(l);
    if (problem) return res.status(400).json({ message: problem });
    const [result] = await db.execute(
      `UPDATE listings SET type = ?, title = ?, category = ?, description = ?, condition_label = ?, quantity = ?, location = ?, image_url = ?
       WHERE id = ? AND user_id = ? AND status <> 'removed'`,
      [l.type, l.title, l.category, l.description, l.conditionLabel, l.quantity, l.location, l.imageUrl || null, id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Listing not found or you do not own it.' });
    res.json({ message: 'Listing updated.', id });
  } catch (err) { next(err); }
});

router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid listing id.' });
    const status = String(req.body.status || '');
    if (!statuses.has(status)) return res.status(400).json({ message: 'Invalid status.' });
    const [result] = await db.execute('UPDATE listings SET status = ? WHERE id = ? AND user_id = ?', [status, id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Listing not found or you do not own it.' });
    res.json({ message: status === 'removed' ? 'Listing removed.' : 'Listing status updated.' });
  } catch (err) { next(err); }
});

module.exports = router;
