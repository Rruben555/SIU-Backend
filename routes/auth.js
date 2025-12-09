const express = require('express');
const db = require('../db');
const bcrypt = require('bcryptjs'); // npm install bcryptjs jsonwebtoken
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = 'your-super-secret-jwt-key-2025'; // Ganti di .env

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { nama, nim, email, fakultas, password } = req.body;
    
    // Validasi
    if (!nama || !nim || !email || !password) {
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    }

    // Cek email/nim duplicate
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 OR nim = $2',
      [email, nim]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email atau NIM sudah terdaftar' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await db.query(
      'INSERT INTO users (nama, nim, email, fakultas, password) VALUES ($1, $2, $3, $4, $5) RETURNING id, nama, nim, email, fakultas, role',
      [nama, nim, email, fakultas, hashedPassword]
    );

    // JWT Token
    const token = jwt.sign({ userId: result.rows[0].id, role: result.rows[0].role }, JWT_SECRET);

    res.status(201).json({
      message: 'Registrasi berhasil',
      token,
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal registrasi' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Email/password salah' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
    
    res.json({
      message: 'Login berhasil',
      token,
      user: { id: user.id, nama: user.nama, nim: user.nim, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal login' });
  }
});

// GET USER PROFILE (protected)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await db.query(
      'SELECT id, nama, nim, email, fakultas, role FROM users WHERE id = $1',
      [userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Gagal load profile' });
  }
});

// TAMBAH INI di auth.js (setelah POST /register biasa)
router.post('/register-admin', async (req, res) => {
  try {
    const { nama, nim, email, fakultas, password } = req.body;
    
    // Validasi
    if (!nama || !nim || !email || !password) {
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    }

    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 OR nim = $2',
      [email, nim]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email atau NIM sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ role = 'admin' EKSPLISIT!
    const result = await db.query(
      'INSERT INTO users (nama, nim, email, fakultas, password, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nama, nim, email, fakultas, role',
      [nama, nim, email, fakultas, hashedPassword, 'admin']  // ✅ role: 'admin'
    );

    const token = jwt.sign({ userId: result.rows[0].id, role: result.rows[0].role }, JWT_SECRET);

    res.status(201).json({
      message: '✅ Admin registrasi berhasil',
      token,
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal registrasi admin' });
  }
});

// GET /auth/profile - USER SPECIFIC DATA
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // User data
    const userResult = await db.query(
      'SELECT id, nama, nim, email, fakultas, role FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // ✅ KEGIATAN TERDAFTAR + WA LINK
    const kegiatanTerdaftar = await db.query(`
      SELECT DISTINCT k.*, r.status, ukm.nama as ukm_nama
      FROM user_ukm_registrations r
      JOIN kegiatan k ON r.kegiatan_id = k.id
      JOIN ukm ON k.ukm_id = ukm.id
      WHERE r.user_id = $1 AND r.type = 'kegiatan' AND r.status = 'accepted'
      ORDER BY k.tanggal DESC
    `, [userId]);
    
    // ANGGOTA status
    const anggotaStatus = await db.query(`
      SELECT COUNT(*) as count 
      FROM user_ukm_registrations 
      WHERE user_id = $1 AND type = 'anggota' AND status = 'accepted'
    `, [userId]);
    
    res.json({
      ...user,
      anggotaTerdaftar: parseInt(anggotaStatus.rows[0].count) > 0,
      kegiatanTerdaftar: kegiatanTerdaftar.rows,
      waLinks: kegiatanTerdaftar.rows.map(k => k.link_wa).filter(Boolean)
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== FORGOT PASSWORD ==========
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email wajib diisi' });
    }
    
    // Cek email ada di database
    const userResult = await db.query('SELECT id, nama FROM users WHERE email = $1 AND is_active = true', [email]);
    
    if (userResult.rows.length === 0) {
      // ✅ SECURITY: Jangan bilang email tidak ada (prevent enumeration)
      return res.json({ 
        message: 'Jika email terdaftar, link reset akan dikirim. Cek inbox/spam.' 
      });
    }
    
    const user = userResult.rows[0];
    
    // ✅ GENERATE RESET TOKEN (expired 1 jam)
    const resetToken = jwt.sign(
      { userId: user.id, type: 'reset' }, 
      JWT_SECRET, 
      { expiresIn: '1h' }
    );
    
    // ✅ RESET URL (ganti dengan frontend URL)
    const resetUrl = `http://localhost:3000/reset-password?token=${resetToken}&userId=${user.id}`;
    
    // ✅ EMAIL CONTENT (gunakan nodemailer atau EmailJS)
    const emailContent = `
      <h2>Reset Password SIU UKM</h2>
      <p>Halo ${user.nama},</p>
      <p>Klik link di bawah untuk reset password Anda:</p>
      <a href="${resetUrl}" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
      <p>Link expired dalam 1 jam.</p>
      <p>Jika Anda tidak meminta reset, abaikan email ini.</p>
      <hr>
      <p>Salam,<br>Tim SIU UKM</p>
    `;
    
    console.log(`🔗 Reset URL untuk ${email}: ${resetUrl}`);
    console.log('📧 Email content:', emailContent);
    
    // ✅ MOCK EMAIL - GANTI DENGAN nodemailer nanti
    res.json({ 
      message: 'Jika email terdaftar, link reset telah dikirim. Cek inbox/spam folder.' 
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== RESET PASSWORD ==========
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, token, newPassword } = req.body;
    
    if (!userId || !token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Data tidak lengkap atau password terlalu pendek' });
    }
    
    // Verify reset token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err || decoded.userId != userId || decoded.type !== 'reset') {
        return res.status(400).json({ error: 'Token tidak valid atau expired' });
      }
    });
    
    // Hash password baru
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
      [hashedPassword, userId]
    );
    
    res.json({ message: '✅ Password berhasil direset! Silakan login.' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Gagal reset password' });
  }
});

// Middleware JWT
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

module.exports = router;
