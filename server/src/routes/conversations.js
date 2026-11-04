const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { positiveId } = require('../utils/security');
const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const listingId = positiveId(req.body.listingId);
    if (!listingId) return res.status(400).json({ message: 'Invalid listing id.' });
    const [rows] = await db.execute("SELECT id, user_id FROM listings WHERE id = ? AND status = 'active'", [listingId]);
    if (!rows.length) return res.status(404).json({ message: 'Listing not found or inactive.' });
    const ownerId = Number(rows[0].user_id);
    if (ownerId === req.user.id) return res.status(400).json({ message: 'This is your own listing.' });
    const one = Math.min(ownerId, req.user.id), two = Math.max(ownerId, req.user.id);
    await db.execute('INSERT IGNORE INTO conversations (listing_id, participant_one, participant_two) VALUES (?, ?, ?)', [listingId, one, two]);
    const [convos] = await db.execute('SELECT id FROM conversations WHERE listing_id = ? AND participant_one = ? AND participant_two = ?', [listingId, one, two]);
    res.status(201).json({ conversationId: convos[0].id });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const me = req.user.id;
    const [rows] = await db.execute(
      `SELECT c.id, c.listing_id AS listingId, l.title AS listingTitle, l.category AS listingCategory,
              u.name AS otherUser, c.created_at AS createdAt,
              lm.body AS lastMessage, lm.created_at AS lastMessageAt, lm.sender_id AS lastSenderId,
              COALESCE(lm.created_at, c.created_at) AS activityAt
       FROM conversations c
       JOIN listings l ON l.id = c.listing_id
       JOIN users u ON u.id = IF(c.participant_one = ?, c.participant_two, c.participant_one)
       LEFT JOIN messages lm ON lm.id = (SELECT m.id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1)
       WHERE c.participant_one = ? OR c.participant_two = ?
       ORDER BY activityAt DESC`,
      [me, me, me]
    );
    res.json({ conversations: rows });
  } catch (err) { next(err); }
});

async function isParticipant(conversationId, userId) {
  const [rows] = await db.execute('SELECT id FROM conversations WHERE id = ? AND (participant_one = ? OR participant_two = ?)', [conversationId, userId, userId]);
  return rows.length > 0;
}

router.get('/:id/messages', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid conversation id.' });
    if (!(await isParticipant(id, req.user.id))) return res.status(403).json({ message: 'You are not part of this conversation.' });
    const [rows] = await db.execute(
      `SELECT * FROM (SELECT id, sender_id AS senderId, body, created_at AS createdAt FROM messages
        WHERE conversation_id = ? ORDER BY id DESC LIMIT 300) recent ORDER BY id ASC`,
      [id]
    );
    res.json({ messages: rows });
  } catch (err) { next(err); }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid conversation id.' });
    if (!(await isParticipant(id, req.user.id))) return res.status(403).json({ message: 'You are not part of this conversation.' });
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 3000) return res.status(400).json({ message: 'Message must be between 1 and 3000 characters.' });
    const [result] = await db.execute('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)', [id, req.user.id, body]);
    res.status(201).json({ id: result.insertId, message: 'Message sent.' });
  } catch (err) { next(err); }
});

module.exports = router;
