const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

/** Numbers for the dashboard home cards — all read live from MySQL. */
router.get('/summary', async (req, res, next) => {
  try {
    const me = req.user.id;
    const [[counts]] = await db.execute(
      `SELECT
         (SELECT COUNT(*) FROM listings WHERE user_id = ? AND status = 'active')    AS activeListings,
         (SELECT COUNT(*) FROM listings WHERE user_id = ? AND status = 'completed') AS completedListings,
         (SELECT COUNT(*) FROM saved_listings s JOIN listings l ON l.id = s.listing_id WHERE s.user_id = ? AND l.status = 'active') AS savedItems,
         (SELECT COUNT(*) FROM conversations WHERE participant_one = ? OR participant_two = ?) AS conversations,
         (SELECT COUNT(*) FROM listings WHERE status = 'active') AS communityListings`,
      [me, me, me, me, me]
    );
    const [recent] = await db.execute(
      `SELECT id, type, title, category, status, created_at AS createdAt FROM listings
       WHERE user_id = ? AND status <> 'removed' ORDER BY created_at DESC, id DESC LIMIT 5`,
      [me]
    );
    const summary = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)]));
    res.json({ summary, recent });
  } catch (err) { next(err); }
});

module.exports = router;
