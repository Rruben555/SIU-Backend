const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken'); // ✅ DIRECT REQUIRE
const router = express.Router();

const JWT_SECRET = 'your-super-secret-jwt-key-2025';

// ✅ MIDDLEWARE JWT INLINE (NO IMPORT)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// ✅ FIXED: GET /pendaftar/user/:userId - ALL REGISTRATIONS (anggota + kegiatan)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.userId != userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await db.query(`
      SELECT r.*, 
             u.nama as ukm_nama,
             k.nama as kegiatan_nama,
             k.link_wa,
             CASE 
               WHEN r.status = 'accepted' THEN 'accepted'
               WHEN r.status = 'rejected' THEN 'rejected' 
               ELSE 'pending'
             END as status
      FROM user_ukm_registrations r
      JOIN ukm u ON r.ukm_id = u.id
      LEFT JOIN kegiatan k ON r.kegiatan_id = k.id
      WHERE r.user_id = $1
      ORDER BY r.registered_at DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

// ✅ GET /pendaftar/kegiatan/user/:userId - USER KEGIATAN REGISTRATIONS
router.get('/kegiatan/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.userId != userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await db.query(`
      SELECT r.*, u.nama as ukm_nama, k.nama as kegiatan_nama
      FROM user_ukm_registrations r
      JOIN ukm u ON r.ukm_id = u.id
      JOIN kegiatan k ON r.kegiatan_id = k.id
      WHERE r.user_id = $1 AND r.type = 'kegiatan'
      ORDER BY r.registered_at DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching kegiatan registrations:', error);
    res.status(500).json({ error: 'Failed to fetch kegiatan registrations' });
  }
});

// GET /pendaftar (Admin lihat semua)
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    
    const result = await db.query(`
      SELECT r.*, u.nama as user_nama, u.nim, u.fakultas, 
             uk.nama as ukm_nama, k.nama as kegiatan_nama
      FROM user_ukm_registrations r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN ukm uk ON r.ukm_id = uk.id
      LEFT JOIN kegiatan k ON r.kegiatan_id = k.id
      ORDER BY r.registered_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /pendaftar (User daftar)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Admin cannot register' });
    }
    
    const userId = req.user.userId;
    const { ukm_id, kegiatan_id, type } = req.body;
    
    if (!ukm_id || !type || !['anggota', 'kegiatan'].includes(type)) {
      return res.status(400).json({ error: 'ukm_id dan type wajib diisi' });
    }
    
    const ukmCheck = await db.query('SELECT id FROM ukm WHERE id = $1', [ukm_id]);
    if (ukmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'UKM not found' });
    }
    
    const existing = await db.query(
      'SELECT id FROM user_ukm_registrations WHERE user_id = $1 AND ukm_id = $2 AND type = $3',
      [userId, ukm_id, type]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Sudah terdaftar' });
    }
    
    const result = await db.query(
      'INSERT INTO user_ukm_registrations (user_id, ukm_id, kegiatan_id, type) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, ukm_id, kegiatan_id || null, type]
    );
    
    res.status(201).json({ 
      message: '✅ Berhasil daftar! Menunggu konfirmasi admin',
      registration: result.rows[0] 
    });
  } catch (error) {
    console.error('Error creating registration:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// PATCH /pendaftar/:id (Admin approve)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status harus accepted atau rejected' });
    }
    
    const regResult = await db.query('SELECT * FROM user_ukm_registrations WHERE id = $1', [id]);
    if (regResult.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    
    const registration = regResult.rows[0];
    const updateResult = await db.query(
      'UPDATE user_ukm_registrations SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    // AUTO ADD KE ANGGOTA
    if (status === 'accepted' && registration.type === 'anggota') {
      const userResult = await db.query('SELECT nama, nim FROM users WHERE id = $1', [registration.user_id]);
      const user = userResult.rows[0];
      
      const existingAnggota = await db.query(
        'SELECT id FROM anggota WHERE ukm_id = $1 AND nim = $2',
        [registration.ukm_id, user.nim]
      );
      
      if (existingAnggota.rows.length === 0) {
        await db.query(
          'INSERT INTO anggota (ukm_id, nama, nim, jabatan) VALUES ($1, $2, $3, $4)',
          [registration.ukm_id, user.nama, user.nim, 'Anggota']
        );
        await db.query('UPDATE ukm SET terdaftarAnggota = true WHERE id = $1', [registration.ukm_id]);
      }
    }
    
    res.json({ message: `✅ Status diubah ke ${status}`, registration: updateResult.rows[0] });
  } catch (error) {
    console.error('Error updating registration:', error);
    res.status(500).json({ error: 'Failed to update registration' });
  }
});

module.exports = router;
