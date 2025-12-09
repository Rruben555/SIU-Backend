const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken'); // ✅ JWT untuk protection
const router = express.Router();

const JWT_SECRET = 'your-super-secret-jwt-key-2025';

// ✅ MIDDLEWARE ADMIN ONLY
function adminOnly(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Login required (Admin only)' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    req.user = user;
    next();
  });
}

// ✅ PUBLIC: GET /ukm - Semua orang bisa lihat
router.get('/', async (req, res) => {
  try {
    const ukmResult = await db.query('SELECT * FROM ukm ORDER BY created_at DESC');

    const ukmList = await Promise.all(ukmResult.rows.map(async (ukm) => {
      const kegiatanResult = await db.query('SELECT * FROM kegiatan WHERE ukm_id = $1', [ukm.id]);
      const anggotaResult = await db.query('SELECT * FROM anggota WHERE ukm_id = $1', [ukm.id]);
      const laporanResult = await db.query('SELECT * FROM laporan WHERE ukm_id = $1', [ukm.id]);

      return {
        ...ukm,
        kegiatan: kegiatanResult.rows,
        anggota: anggotaResult.rows,
        laporan: laporanResult.rows
      };
    }));

    res.json(ukmList);
  } catch (error) {
    console.error('Error fetching UKM:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ PUBLIC: GET /ukm/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ukmResult = await db.query('SELECT * FROM ukm WHERE id = $1', [id]);
    
    if (ukmResult.rows.length === 0) {
      return res.status(404).json({ error: 'UKM not found' });
    }

    const ukm = ukmResult.rows[0];
    const kegiatanResult = await db.query('SELECT * FROM kegiatan WHERE ukm_id = $1', [id]);
    const anggotaResult = await db.query('SELECT * FROM anggota WHERE ukm_id = $1', [id]);
    const laporanResult = await db.query('SELECT * FROM laporan WHERE ukm_id = $1', [id]);

    res.json({
      ...ukm,
      kegiatan: kegiatanResult.rows,
      anggota: anggotaResult.rows,
      laporan: laporanResult.rows
    });
  } catch (error) {
    console.error('Error fetching UKM:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ADMIN ONLY: CRUD UKM ==========
router.post('/', adminOnly, async (req, res) => {
  try {
    const { nama, deskripsi, gambar, wa_group } = req.body;
    const result = await db.query(
      'INSERT INTO ukm (nama, deskripsi, gambar, wa_group) VALUES ($1, $2, $3, $4) RETURNING *',
      [nama, deskripsi, gambar, wa_group]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating UKM:', error);
    res.status(500).json({ error: 'Failed to create UKM' });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, deskripsi, gambar, wa_group } = req.body;
    
    const anggotaCount = await db.query('SELECT COUNT(*) as count FROM anggota WHERE ukm_id = $1', [id]);
    const hasAnggota = parseInt(anggotaCount.rows[0].count) > 0;
    
    const result = await db.query(
      'UPDATE ukm SET nama=$1, deskripsi=$2, gambar=$3, wa_group=$4, terdaftarAnggota=$5 WHERE id=$6 RETURNING *',
      [nama, deskripsi, gambar, wa_group, hasAnggota, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'UKM not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating UKM:', error);
    res.status(500).json({ error: 'Failed to update UKM' });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM ukm WHERE id = $1', [id]);
    res.json({ message: 'UKM deleted successfully' });
  } catch (error) {
    console.error('Error deleting UKM:', error);
    res.status(500).json({ error: 'Failed to delete UKM' });
  }
});

// ========== ADMIN ONLY: CRUD KEGIATAN ==========
// POST /ukm/:ukmId/kegiatan - TAMBAH link_wa
router.post('/:ukmId/kegiatan', adminOnly, async (req, res) => {
  try {
    const { ukmId } = req.params;
    const { nama, deskripsi, tanggal, link_wa } = req.body; // ✅ TAMBAH link_wa
    
    const ukmCheck = await db.query('SELECT id FROM ukm WHERE id = $1', [ukmId]);
    if (ukmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'UKM not found' });
    }

    const result = await db.query(
      'INSERT INTO kegiatan (ukm_id, nama, deskripsi, tanggal, link_wa) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [ukmId, nama, deskripsi, tanggal, link_wa] // ✅ link_wa
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create kegiatan' });
  }
});

// PUT /ukm/:ukmId/kegiatan/:kegId - UPDATE link_wa
router.put('/:ukmId/kegiatan/:kegId', adminOnly, async (req, res) => {
  try {
    const { ukmId, kegId } = req.params;
    const { nama, deskripsi, tanggal, link_wa } = req.body; // ✅ TAMBAH link_wa
    
    const result = await db.query(
      'UPDATE kegiatan SET nama=$1, deskripsi=$2, tanggal=$3, link_wa=$4 WHERE id=$5 AND ukm_id=$6 RETURNING *',
      [nama, deskripsi, tanggal, link_wa, kegId, ukmId] // ✅ link_wa
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kegiatan not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update kegiatan' });
  }
});

router.delete('/:ukmId/kegiatan/:kegId', adminOnly, async (req, res) => {
  try {
    const { ukmId, kegId } = req.params;
    await db.query('DELETE FROM kegiatan WHERE id=$1 AND ukm_id=$2', [kegId, ukmId]);
    res.json({ message: 'Kegiatan deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete kegiatan' });
  }
});

// ========== ADMIN ONLY: CRUD LAPORAN ==========
router.post('/:ukmId/laporan', adminOnly, async (req, res) => {
  try {
    const { ukmId } = req.params;
    const { kegiatan, peserta, biaya } = req.body;
    
    const ukmCheck = await db.query('SELECT id FROM ukm WHERE id = $1', [ukmId]);
    if (ukmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'UKM not found' });
    }

    const result = await db.query(
      'INSERT INTO laporan (ukm_id, kegiatan, peserta, biaya) VALUES ($1, $2, $3, $4) RETURNING *',
      [ukmId, kegiatan, peserta, biaya]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create laporan' });
  }
});

router.put('/:ukmId/laporan/:lapId', adminOnly, async (req, res) => {
  try {
    const { ukmId, lapId } = req.params;
    const { kegiatan, peserta, biaya } = req.body;
    
    const result = await db.query(
      'UPDATE laporan SET kegiatan=$1, peserta=$2, biaya=$3 WHERE id=$4 AND ukm_id=$5 RETURNING *',
      [kegiatan, peserta, biaya, lapId, ukmId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Laporan not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update laporan' });
  }
});

router.delete('/:ukmId/laporan/:lapId', adminOnly, async (req, res) => {
  try {
    const { ukmId, lapId } = req.params;
    await db.query('DELETE FROM laporan WHERE id=$1 AND ukm_id=$2', [lapId, ukmId]);
    res.json({ message: 'Laporan deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete laporan' });
  }
});

// ========== ADMIN ONLY: CRUD ANGGOTA ==========
router.post('/:ukmId/anggota', adminOnly, async (req, res) => {
  try {
    const { ukmId } = req.params;
    const { nama, nim, jabatan } = req.body;
    
    const ukmCheck = await db.query('SELECT id FROM ukm WHERE id = $1', [ukmId]);
    if (ukmCheck.rows.length === 0) {
      return res.status(404).json({ error: 'UKM not found' });
    }

    const result = await db.query(
      'INSERT INTO anggota (ukm_id, nama, nim, jabatan) VALUES ($1, $2, $3, $4) RETURNING *',
      [ukmId, nama, nim, jabatan]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create anggota' });
  }
});

router.put('/:ukmId/anggota/:angId', adminOnly, async (req, res) => {
  try {
    const { ukmId, angId } = req.params;
    const { nama, nim, jabatan } = req.body;
    
    const result = await db.query(
      'UPDATE anggota SET nama=$1, nim=$2, jabatan=$3 WHERE id=$4 AND ukm_id=$5 RETURNING *',
      [nama, nim, jabatan, angId, ukmId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anggota not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update anggota' });
  }
});

router.delete('/:ukmId/anggota/:angId', adminOnly, async (req, res) => {
  try {
    const { ukmId, angId } = req.params;
    await db.query('DELETE FROM anggota WHERE id=$1 AND ukm_id=$2', [angId, ukmId]);
    res.json({ message: 'Anggota deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete anggota' });
  }
});

module.exports = router;
