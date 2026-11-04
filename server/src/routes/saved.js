const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT l.id, l.user_id AS userId, l.type, l.title, l.category, l.description, l.condition_label AS conditionLabel, l.quantity, l.location, l.image_url AS imageUrl, l.status, l.created_at AS createdAt, u.name AS ownerName FROM saved_listings s JOIN listings l ON l.id=s.listing_id JOIN users u ON u.id=l.user_id WHERE s.user_id=? AND l.status='active' ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ listings: rows });
  } catch (err) { next(err); }
});
router.post('/:listingId', async (req, res, next) => {
  try {
    const [rows] = await db.execute("SELECT id FROM listings WHERE id=? AND status='active'", [req.params.listingId]);
    if (!rows.length) return res.status(404).json({ message: 'Listing not found.' });
    await db.execute('INSERT IGNORE INTO saved_listings (user_id, listing_id) VALUES (?, ?)', [req.user.id, req.params.listingId]);
    res.status(201).json({ message: 'Listing saved.' });
  } catch (err) { next(err); }
});
router.delete('/:listingId', async (req, res, next) => {
  try {
    await db.execute('DELETE FROM saved_listings WHERE user_id=? AND listing_id=?', [req.user.id, req.params.listingId]);
    res.json({ message: 'Listing removed from saved items.' });
  } catch (err) { next(err); }
});
module.exports = router;
