const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = 'your-super-secret-jwt-key-2025';

// ✅ MIDDLEWARE LOGIN REQUIRED
function requireLogin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Login diperlukan untuk komen!' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token tidak valid' });
    req.user = user;
    next();
  });
}

// GET /ukm-komentar/:ukmId - Ambil komentar UKM + user info
router.get('/:ukmId', async (req, res) => {
  try {
    const { ukmId } = req.params;
    
    const result = await db.query(`
      SELECT k.*, u.nama as user_nama, u.nim 
      FROM komentar_ukm k 
      JOIN users u ON k.user_id = u.id 
      WHERE k.ukm_id = $1 AND k.is_active = true 
      ORDER BY k.created_at DESC
    `, [ukmId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching komentar:', error);
    res.status(500).json({ error: 'Gagal ambil komentar' });
  }
});

// POST /ukm-komentar/:ukmId - Tambah komentar (LOGIN REQUIRED)
router.post('/:ukmId', requireLogin, async (req, res) => {
  try {
    const { ukmId } = req.params;
    const { komentar, rating } = req.body;
    const userId = req.user.userId;
    
    // Validasi
    if (!komentar || komentar.trim().length < 10) {
      return res.status(400).json({ error: 'Komentar minimal 10 karakter' });
    }
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating 1-5 saja' });
    }
    
    // Cek sudah komen belum
    const existing = await db.query(
      'SELECT id FROM komentar_ukm WHERE ukm_id = $1 AND user_id = $2 AND is_active = true',
      [ukmId, userId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Sudah komen untuk UKM ini!' });
    }
    
    const result = await db.query(
      `INSERT INTO komentar_ukm (ukm_id, user_id, komentar, rating) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ukmId, userId, komentar.trim(), rating || 5]
    );
    
    res.status(201).json({
      message: '✅ Komentar berhasil ditambahkan!',
      komentar: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating komentar:', error);
    res.status(500).json({ error: 'Gagal tambah komentar' });
  }
});

// PUT /ukm-komentar/:id - Edit komentar (pemilik saja)
router.put('/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { komentar, rating } = req.body;
    const userId = req.user.userId;
    
    if (!komentar || komentar.trim().length < 10) {
      return res.status(400).json({ error: 'Komentar minimal 10 karakter' });
    }
    
    const result = await db.query(
      `UPDATE komentar_ukm 
       SET komentar = $1, rating = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [komentar.trim(), rating || 5, id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Komentar tidak ditemukan atau bukan milik Anda' });
    }
    
    res.json({
      message: '✅ Komentar diperbarui!',
      komentar: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal update komentar' });
  }
});

// DELETE /ukm-komentar/:id - Hapus komentar (pemilik/admin)
router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const result = await db.query(
      `UPDATE komentar_ukm SET is_active = false WHERE id = $1 AND (user_id = $2 OR $3 = 'admin') RETURNING id`,
      [id, userId, req.user.role]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Komentar tidak ditemukan' });
    }
    
    res.json({ message: '✅ Komentar dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal hapus komentar' });
  }
});

module.exports = router;
