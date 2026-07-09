const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ===== DATABASE (In-memory) =====
const licenses = {};

// ===== PLAN CONFIGURATION =====
const PLANS = {
  '24h': { name: '24 Hours', days: 1, price: 50 },
  '3d': { name: '3 Days', days: 3, price: 150 },
  '7d': { name: '7 Days', days: 7, price: 350 },
  '15d': { name: '15 Days', days: 15, price: 750 },
  '30d': { name: '30 Days', days: 30, price: 1500 },
  'lifetime': { name: 'Life Time', days: 99999, price: 8000 }
};

// ===== GENERATE LICENSE =====
app.post('/api/generate-license', (req, res) => {
  const { plan, email, transactionId } = req.body;
  
  if (!plan || !PLANS[plan]) {
    return res.json({ success: false, message: 'Invalid plan selected' });
  }
  
  if (!email) {
    return res.json({ success: false, message: 'Email is required' });
  }
  
  const licenseKey = 'LIC-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  
  const now = new Date();
  let expiresAt = new Date(now);
  const planData = PLANS[plan];
  
  if (plan === 'lifetime') {
    expiresAt.setFullYear(now.getFullYear() + 100);
  } else {
    expiresAt.setDate(now.getDate() + planData.days);
  }
  
  licenses[licenseKey] = {
    key: licenseKey,
    email: email,
    plan: planData.name,
    planCode: plan,
    price: planData.price,
    deviceId: null,
    createdAt: now,
    expiresAt: expiresAt,
    status: 'active',
    transactionId: transactionId || 'manual'
  };
  
  res.json({
    success: true,
    licenseKey: licenseKey,
    plan: planData.name,
    price: planData.price,
    expiresAt: expiresAt,
    message: `License generated successfully!`
  });
});

// ===== VERIFY LICENSE =====
app.post('/api/verify-license', (req, res) => {
  const { licenseKey, deviceId } = req.body;
  
  if (!licenseKey) {
    return res.json({ success: false, message: 'License key required' });
  }
  
  const license = licenses[licenseKey];
  if (!license) {
    return res.json({ success: false, message: 'Invalid license key' });
  }
  
  const now = new Date();
  if (license.planCode !== 'lifetime' && now > new Date(license.expiresAt)) {
    license.status = 'expired';
    return res.json({ 
      success: false, 
      message: 'License expired',
      expired: true
    });
  }
  
  if (license.deviceId && license.deviceId !== deviceId) {
    return res.json({ 
      success: false, 
      message: 'Already used on another device',
      deviceLocked: true
    });
  }
  
  if (!license.deviceId) {
    license.deviceId = deviceId;
    license.activatedAt = now;
  }
  
  const diff = new Date(license.expiresAt) - now;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const remaining = license.planCode === 'lifetime' ? 'Lifetime' : `${days}d ${hours}h`;
  
  res.json({
    success: true,
    plan: license.plan,
    expiresAt: license.expiresAt,
    remaining: remaining,
    isLifetime: license.planCode === 'lifetime'
  });
});

// ===== GET ALL LICENSES =====
app.get('/api/licenses', (req, res) => {
  const list = Object.values(licenses).map(l => ({
    key: l.key,
    email: l.email,
    plan: l.plan,
    price: l.price,
    expiresAt: l.expiresAt,
    status: l.status,
    deviceId: l.deviceId || 'Not activated'
  }));
  res.json({ success: true, licenses: list });
});

// ===== GET STATS =====
app.get('/api/stats', (req, res) => {
  const total = Object.keys(licenses).length;
  const active = Object.values(licenses).filter(l => l.status === 'active').length;
  const expired = Object.values(licenses).filter(l => l.status === 'expired').length;
  const totalRevenue = Object.values(licenses).reduce((sum, l) => sum + (l.price || 0), 0);
  
  res.json({
    success: true,
    total,
    active,
    expired,
    totalRevenue
  });
});

// ===== REVOKE LICENSE =====
app.post('/api/revoke-license', (req, res) => {
  const { licenseKey } = req.body;
  const license = licenses[licenseKey];
  if (!license) {
    return res.json({ success: false, message: 'License not found' });
  }
  license.status = 'revoked';
  res.json({ success: true, message: 'License revoked' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ License server running on port ${PORT}`);
});

module.exports = app;