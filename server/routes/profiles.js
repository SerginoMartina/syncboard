import express from 'express';
import { pool } from '../db.js';

const MAX_AVATAR_BYTES = 512 * 1024;
const avatarDataUrlPattern = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const displayNameIsValid = (name) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 32;
const colorIsValid = (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);

const toProfile = (row) => ({
  id: row.id,
  displayName: row.displayName,
  color: row.color,
  avatarUrl: row.avatarMime
    ? `/api/profiles/${encodeURIComponent(row.id)}/avatar?v=${encodeURIComponent(new Date(row.updatedAt).getTime())}`
    : null,
  updatedAt: row.updatedAt,
});

const profileColumns = `
  id,
  display_name AS "displayName",
  color,
  avatar_mime AS "avatarMime",
  updated_at AS "updatedAt"
`;

const suggestAvailableName = async (name, userId) => {
  for (let suffix = 2; suffix <= 1000; suffix++) {
    const tail = ` ${suffix}`;
    const candidate = `${name.slice(0, 32 - tail.length).trimEnd()}${tail}`;
    const { rowCount } = await pool.query(
      `SELECT 1 FROM syncboard.profiles
       WHERE lower(btrim(display_name)) = lower(btrim($1)) AND id <> $2`,
      [candidate, userId],
    );
    if (!rowCount) return candidate;
  }
  return null;
};

const createProfilesRouter = () => {
  const router = express.Router();

  router.get('/:userId/avatar', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT avatar_mime AS mime, avatar_data AS data
         FROM syncboard.profiles WHERE id = $1 AND avatar_data IS NOT NULL`,
        [req.params.userId],
      );
      if (!rows.length) return res.status(404).end();
      res.set('Cache-Control', 'private, max-age=300');
      res.type(rows[0].mime).send(rows[0].data);
    } catch (error) {
      console.error('Failed to fetch profile image:', error);
      res.status(500).json({ error: 'Could not load profile image.' });
    }
  });

  router.get('/:userId', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${profileColumns} FROM syncboard.profiles WHERE id = $1`,
        [req.params.userId],
      );
      if (!rows.length) return res.status(404).json({ error: 'Profile not found.' });
      res.json(toProfile(rows[0]));
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      res.status(500).json({ error: 'Could not load your profile.' });
    }
  });

  router.put('/:userId', async (req, res) => {
    const userId = req.params.userId.trim();
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const { color, avatarData } = req.body ?? {};
    if (!userId || userId.length > 128 || !displayNameIsValid(displayName) || !colorIsValid(color)) {
      return res.status(400).json({ error: 'Choose a display name (up to 32 characters) and a valid profile color.' });
    }

    let avatarMime = null;
    let avatarBuffer = null;
    const hasAvatarUpdate = Object.hasOwn(req.body ?? {}, 'avatarData');
    if (hasAvatarUpdate && avatarData !== null) {
      const match = typeof avatarData === 'string' ? avatarDataUrlPattern.exec(avatarData) : null;
      if (!match) {
        return res.status(400).json({ error: 'Choose a PNG, JPEG, or WebP profile image.' });
      }
      avatarMime = match[1];
      avatarBuffer = Buffer.from(match[2], 'base64');
      if (!avatarBuffer.length || avatarBuffer.length > MAX_AVATAR_BYTES ||
          avatarBuffer.toString('base64') !== match[2]) {
        return res.status(400).json({ error: 'Profile images must be smaller than 512 KB.' });
      }
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO syncboard.profiles (id, display_name, color, avatar_mime, avatar_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           color = EXCLUDED.color,
           avatar_mime = CASE WHEN $6 THEN EXCLUDED.avatar_mime ELSE profiles.avatar_mime END,
           avatar_data = CASE WHEN $6 THEN EXCLUDED.avatar_data ELSE profiles.avatar_data END,
           updated_at = now()
         RETURNING ${profileColumns}`,
        [userId, displayName, color, avatarMime, avatarBuffer, hasAvatarUpdate],
      );
      res.json(toProfile(rows[0]));
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'profiles_display_name_unique_idx') {
        let suggestion;
        try {
          suggestion = await suggestAvailableName(displayName, userId);
        } catch (suggestionError) {
          console.error('Failed to suggest an available display name:', suggestionError);
          return res.status(500).json({ error: 'That display name is taken. Please choose another one.' });
        }
        return res.status(409).json({
          error: 'That display name is already taken. Choose something else.',
          suggestion,
        });
      }
      console.error('Failed to save profile:', error);
      res.status(500).json({ error: 'Could not save your profile.' });
    }
  });

  return router;
};

export default createProfilesRouter;
