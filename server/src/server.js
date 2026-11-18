const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

// Directories
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Database files
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const VISITOR_TOKENS_FILE = path.join(DATA_DIR, 'visitor-qr-tokens.json');
const VISITOR_DEVICE_TOKENS_FILE = path.join(DATA_DIR, 'visitor-device-tokens.json');

// Initialize local DB files if not exist
function readJson(file, defaultValue) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`Error reading ${file}:`, e);
  }
  return defaultValue;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error writing ${file}:`, e);
  }
}




// API to view visitor data
app.get("/api/visitors", (req, res) => {
    try {
        const visitorsFile = path.join(
            __dirname,
            "..",
            "data",
            "visitors.json"
        );

        const data = fs.readFileSync(visitorsFile, "utf8");
        const visitors = JSON.parse(data);

        res.json({
            success: true,
            total: Array.isArray(visitors) ? visitors.length : 0,
            visitors: visitors
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching visitor data",
            error: error.message
        });
    }
    
});

// In-Memory state loaded from storage
let visitors = readJson(VISITORS_FILE, []);
let visitorQrTokens = readJson(VISITOR_TOKENS_FILE, {});
// Persistent device association: the common QR is shared, but a returning visitor's
// browser stores a random device token that maps to only their profile.
let visitorDeviceTokens = readJson(VISITOR_DEVICE_TOKENS_FILE, {});
let photos = readJson(PHOTOS_FILE, [
  {
    id: 'p1',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1920&q=80',
    title: 'Luxury Residence Exterior',
    uploadedAt: new Date().toISOString()
  },
  {
    id: 'p2',
    url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1920&q=80',
    title: 'Grand Living Hall & Chandelier',
    uploadedAt: new Date().toISOString()
  },
  {
    id: 'p3',
    url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1920&q=80',
    title: 'Garden Courtyard & Lounge',
    uploadedAt: new Date().toISOString()
  }
]);

let settings = readJson(SETTINGS_FILE, {
  autoApprove: true,
  priorityWelcomeDurationSeconds: 300, // 5 minutes
  ambientSlideIntervalSeconds: 8,
  residenceName: 'Patel Villa & Residence'
});

// TV State Tracking
const connectedTVs = {
  tv1: { id: 'tv1', name: 'Living Room TV', location: 'Living Room (Primary)', status: 'offline', lastSeen: null, currentMode: 'ambient' },
  tv2: { id: 'tv2', name: 'Dining Hall TV', location: 'Formal Dining', status: 'offline', lastSeen: null, currentMode: 'ambient' },
  tv3: { id: 'tv3', name: 'Lounge TV', location: 'Upper Lounge', status: 'offline', lastSeen: null, currentMode: 'ambient' }
};

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static asset folders
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/tv', express.static(path.join(__dirname, '..', '..', 'tv_display_webos')));
app.use('/gate', express.static(path.join(__dirname, '..', 'public', 'gate')));
app.use('/qr', express.static(path.join(__dirname, '..', 'public', 'qr')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'visitor-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 5 }, // max 5 photos, 25MB each
  fileFilter: (req, file, cb) => {
    // Basic server-side type/extension allowlist (client checks are not trusted).
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMime.includes(file.mimetype) && allowedExt.includes(ext)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
  }
});

function hasValidImageSignature(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 12) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isGif || isWebp;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function visitorPhotoHistory(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const matching = visitors.filter(v => normalizePhone(v.phone) === normalized);
  const urls = matching.flatMap(v => Array.isArray(v.photoHistory) ? v.photoHistory : (v.photos || []));
  return [...new Set(urls)];
}

// Helper: Broadcast welcome to TVs
function triggerWelcomeShow(visitor) {
  const duration = settings.priorityWelcomeDurationSeconds || 300;
  const payload = {
    visitorId: visitor.id,
    name: visitor.name,
    phone: visitor.phone,
    photos: visitor.photos,
    durationSeconds: duration,
    residenceName: settings.residenceName,
    triggeredAt: new Date().toISOString()
  };

  console.log(`[REALTIME] Broadcasting Welcome Show to ALL 3 TVs for: ${visitor.name} (${duration}s)`);
  io.emit('TRIGGER_WELCOME_SHOW', payload);

  // Update TV state
  Object.keys(connectedTVs).forEach(k => {
    connectedTVs[k].currentMode = 'priority_welcome';
  });
  io.emit('TV_STATUS_UPDATE', connectedTVs);

  // Auto revert mode after 5 minutes
  setTimeout(() => {
    Object.keys(connectedTVs).forEach(k => {
      connectedTVs[k].currentMode = 'ambient';
    });
    io.emit('TV_STATUS_UPDATE', connectedTVs);
    console.log(`[REALTIME] Priority welcome time ended. TVs returned to ambient mode.`);
  }, duration * 1000);
}

// ======================== API ROUTES ========================

// Common household QR flow: visitors choose their existing profile from this directory.
// Demo implementation exposes names and IDs; add OTP/authentication before public deployment.
app.get('/api/visitor/profiles', (req, res) => {
  const byPhone = new Map();
  visitors.forEach(v => {
    const phone = normalizePhone(v.phone);
    if (!phone) return;
    if (!byPhone.has(phone)) byPhone.set(phone, {
      profileId: v.profileId || ('profile_' + phone), name: v.name,
      phone: v.phone, photoCount: visitorPhotoHistory(phone).length
    });
  });
  res.json({ success: true, profiles: [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name)) });
});

// Visitor self-registration on the shared household QR page. A profile is created once per mobile number.
// A random persistent device token links future scans on this browser to that profile.
app.post('/api/visitor/register-profile', (req, res) => {
  const name = String(req.body.name || '').trim();
  const phoneRaw = String(req.body.phone || '').trim();
  const phone = normalizePhone(phoneRaw);
  if (name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: 'Enter a name between 2 and 100 characters.' });
  if (phone.length !== 10) return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number.' });
  const existing = visitors.find(v => normalizePhone(v.phone) === phone && v.isProfileRegistration);
  if (existing) return res.status(409).json({ success: false, message: 'This mobile number already has a profile. Use the same registered device, or ask the admin to help verify this visitor on a new device.', profileId: existing.profileId || ('profile_' + phone), name: existing.name });
  const profile = {
    id: 'profile_' + crypto.randomBytes(8).toString('hex'), profileId: 'profile_' + phone,
    name, phone: phoneRaw, photos: [], photoHistory: [], status: 'registered',
    registeredAt: new Date().toISOString(), consentToDisplay: false, isProfileRegistration: true
  };
  const deviceToken = crypto.randomBytes(32).toString('hex');
  visitorDeviceTokens[deviceToken] = phone;
  visitors.unshift(profile);
  writeJson(VISITORS_FILE, visitors);
  writeJson(VISITOR_DEVICE_TOKENS_FILE, visitorDeviceTokens);
  io.emit('VISITOR_PROFILE_CREATED', { profile: { profileId: profile.profileId, name: profile.name, photoCount: 0 } });
  res.status(201).json({ success: true, message: 'Visitor profile registered and this browser linked to it.', deviceToken, profile: { profileId: profile.profileId, name: profile.name, phone: profile.phone, photos: [] } });
});

// Resolve the visitor automatically from the registered browser/device token.
app.get('/api/visitor/device-profile', (req, res) => {
  const token = String(req.query.deviceToken || '').trim();
  const phone = visitorDeviceTokens[token];
  if (!token || !phone) return res.status(401).json({ success: false, message: 'This device is not linked to a visitor profile.' });
  const profile = visitors.find(v => v.isProfileRegistration && normalizePhone(v.phone) === normalizePhone(phone));
  if (!profile) return res.status(404).json({ success: false, message: 'Visitor profile not found.' });
  res.json({ success: true, profileId: profile.profileId, name: profile.name, phone: profile.phone, photos: visitorPhotoHistory(phone), consentToDisplay: !!profile.consentToDisplay });
});

// Self-service profile editing is authorized by the persistent device token linked at registration.
app.put('/api/visitor/update-profile', (req, res) => {
  const token = String(req.body.deviceToken || '').trim();
  const phone = visitorDeviceTokens[token];
  const name = String(req.body.name || '').trim();
  if (!token || !phone) return res.status(401).json({ success:false, message:'This device is not linked to a visitor profile.' });
  if (name.length < 2 || name.length > 100) return res.status(400).json({ success:false, message:'Name must be between 2 and 100 characters.' });
  const profile = visitors.find(v => v.isProfileRegistration && normalizePhone(v.phone) === normalizePhone(phone));
  if (!profile) return res.status(404).json({ success:false, message:'Registered profile not found.' });
  profile.name = name;
  visitors.filter(v => normalizePhone(v.phone) === normalizePhone(phone)).forEach(v => { v.name = name; });
  writeJson(VISITORS_FILE, visitors);
  io.emit('VISITOR_PROFILE_UPDATED', { profileId:profile.profileId, name });
  res.json({ success:true, message:'Visitor profile updated.', profile:{ profileId:profile.profileId, name:profile.name, phone:profile.phone } });
});

// Add photos permanently to the visitor's own profile from mobile gallery or camera.
app.post('/api/visitor/profile-photos', upload.array('photos', 10), (req, res) => {
  const token = String(req.body.deviceToken || '').trim();
  const phone = visitorDeviceTokens[token];
  if (!token || !phone) {
    (req.files || []).forEach(file => { try { fs.unlinkSync(file.path); } catch (_) {} });
    return res.status(401).json({ success:false, message:'This device is not linked to a visitor profile.' });
  }
  const invalidFiles = (req.files || []).filter(file => !hasValidImageSignature(file.path));
  if (invalidFiles.length) {
    invalidFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (_) {} });
    return res.status(400).json({ success:false, message:'One or more uploads are not valid supported image files.' });
  }
  if (!(req.files || []).length) return res.status(400).json({ success:false, message:'Choose at least one photo from the gallery.' });
  const profile = visitors.find(v => v.isProfileRegistration && normalizePhone(v.phone) === normalizePhone(phone));
  if (!profile) return res.status(404).json({ success:false, message:'Registered profile not found.' });
  const current = visitorPhotoHistory(phone);
  const added = (req.files || []).map(file => `/uploads/${file.filename}`);
  const merged = [...new Set([...current, ...added])];
  visitors.filter(v => normalizePhone(v.phone) === normalizePhone(phone)).forEach(v => { v.photoHistory = merged; v.photos = merged; });
  writeJson(VISITORS_FILE, visitors);
  io.emit('VISITOR_PROFILE_PHOTOS_UPDATED', { profileId:profile.profileId, photoCount:merged.length });
  res.status(201).json({ success:true, message:`Added ${added.length} photo(s) to your profile.`, addedPhotos:added, photos:merged });
});

// Returning visitor scan: if consent was saved during an earlier check-in, broadcast their
// stored photos immediately without showing the directory of all visitor profiles.
app.post('/api/visitor/auto-checkin', (req, res) => {
  const token = String(req.body.deviceToken || '').trim();
  const phone = visitorDeviceTokens[token];
  if (!token || !phone) return res.status(401).json({ success: false, message: 'This device is not linked to a visitor profile.' });
  const profile = visitors.find(v => v.isProfileRegistration && normalizePhone(v.phone) === normalizePhone(phone));
  if (!profile) return res.status(404).json({ success: false, message: 'Visitor profile not found.' });
  const savedPhotos = visitorPhotoHistory(phone);
  if (!profile.consentToDisplay) return res.status(409).json({ success: false, needsConsent: true, message: 'Please confirm consent on this visit before displaying photos.' });
  if (!savedPhotos.length) return res.status(409).json({ success: false, needsPhotos: true, message: 'Your profile has no saved photos yet. Add photos for this visit.' });
  const visitor = { id: 'vis_' + Date.now(), profileId: profile.profileId, name: profile.name, phone: profile.phone, photos: savedPhotos, photoHistory: savedPhotos, consentToDisplay: true, status: settings.autoApprove ? 'approved' : 'pending', timestamp: new Date().toISOString() };
  visitors.unshift(visitor); writeJson(VISITORS_FILE, visitors);
  if (visitor.status === 'approved') triggerWelcomeShow(visitor);
  io.emit('VISITOR_EVENT', { type: visitor.status === 'approved' ? 'AUTO_APPROVED' : 'NEW_PENDING', visitor });
  res.json({ success: true, message: `Welcome back, ${profile.name}. Your saved photos are being shown on the TVs.`, visitor });
});

// Admin profile management endpoints (admin UI is a local/demo controller; secure it before public deployment).
app.get('/api/admin/profiles', (req, res) => {
  const byPhone = new Map();
  visitors.forEach(v => {
    const phone = normalizePhone(v.phone); if (!phone) return;
    if (!byPhone.has(phone)) byPhone.set(phone, { profileId: v.profileId || ('profile_' + phone), name: v.name, phone: v.phone, photoCount: visitorPhotoHistory(phone).length, registeredAt: v.registeredAt || v.timestamp || null });
  });
  res.json({ success: true, profiles: [...byPhone.values()].sort((a,b) => a.name.localeCompare(b.name)) });
});
app.put('/api/admin/profiles/:phone', (req, res) => {
  const phone = normalizePhone(req.params.phone); const name = String(req.body.name || '').trim();
  if (phone.length !== 10 || name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: 'Valid phone and name are required.' });
  const matches = visitors.filter(v => normalizePhone(v.phone) === phone);
  if (!matches.length) return res.status(404).json({ success: false, message: 'Profile not found.' });
  matches.forEach(v => { v.name = name; }); writeJson(VISITORS_FILE, visitors);
  io.emit('VISITOR_PROFILE_UPDATED', { profileId: 'profile_' + phone, name });
  res.json({ success: true, message: 'Profile updated.' });
});
app.delete('/api/admin/profiles/:phone', (req, res) => {
  const phone = normalizePhone(req.params.phone);
  if (phone.length !== 10) return res.status(400).json({ success: false, message: 'Invalid mobile number.' });
  const before = visitors.length; visitors = visitors.filter(v => normalizePhone(v.phone) !== phone);
  Object.keys(visitorQrTokens).forEach(token => { if (normalizePhone(visitorQrTokens[token]) === phone) delete visitorQrTokens[token]; });
  writeJson(VISITORS_FILE, visitors); writeJson(VISITOR_TOKENS_FILE, visitorQrTokens);
  if (visitors.length === before) return res.status(404).json({ success: false, message: 'Profile not found.' });
  res.json({ success: true, message: 'Visitor profile and profile references deleted.' });
});

// 1. Profile lookup: by mobile, common-QR selected profile, or secure personal QR token
app.get('/api/visitor/profile', (req, res) => {
  const requestedProfileId = String(req.query.profileId || '').trim();
  if (requestedProfileId) {
    const matches = visitors.filter(v => (v.profileId || ('profile_' + normalizePhone(v.phone))) === requestedProfileId);
    if (!matches.length) return res.status(404).json({ success: false, message: 'Selected visitor profile not found.' });
    const phone = normalizePhone(matches[0].phone);
    return res.json({ success: true, returningVisitor: true, profileId: requestedProfileId, name: matches[0].name, phone: matches[0].phone, photos: visitorPhotoHistory(phone) });
  }

  const token = String(req.query.token || '').trim();
  if (token) {
    const phone = visitorQrTokens[token];
    if (!phone) return res.status(404).json({ success: false, message: 'This personal QR is invalid or has been revoked.' });
    const matches = visitors.filter(v => normalizePhone(v.phone) === normalizePhone(phone));
    if (!matches.length) return res.status(404).json({ success: false, message: 'Visitor profile not found.' });
    return res.json({ success: true, returningVisitor: true, name: matches[0].name, phone: matches[0].phone, photos: visitorPhotoHistory(phone) });
  }
  const phone = normalizePhone(req.query.phone);
  if (phone.length !== 10) return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number.' });
  const matches = visitors.filter(v => normalizePhone(v.phone) === phone);
  if (!matches.length) return res.json({ success: true, returningVisitor: false, name: '', photos: [] });
  const latest = matches[0];
  res.json({ success: true, returningVisitor: true, name: latest.name, phone: latest.phone, photos: visitorPhotoHistory(phone) });
});

// Admin demo endpoint: generate/reuse a personal QR token for an existing visitor by mobile number.
app.post('/api/admin/visitor-qr', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (phone.length !== 10) return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number.' });
  const matches = visitors.filter(v => normalizePhone(v.phone) === phone);
  if (!matches.length) return res.status(404).json({ success: false, message: 'No registered visitor found for this mobile number.' });
  let token = Object.keys(visitorQrTokens).find(key => normalizePhone(visitorQrTokens[key]) === phone);
  if (!token) { token = crypto.randomBytes(24).toString('hex'); visitorQrTokens[token] = phone; fs.writeFileSync(VISITOR_TOKENS_FILE, JSON.stringify(visitorQrTokens, null, 2)); }
  const baseUrl = String(req.body.baseUrl || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) return res.status(400).json({ success: false, message: 'Provide a valid base URL such as http://192.168.1.10:5000.' });
  res.json({ success: true, name: matches[0].name, qrUrl: `${baseUrl}/gate/?token=${token}`, token });
});

// 2. Visitor Gate Check-in: combine selected previous photos with newly uploaded photos
app.post('/api/visitor/checkin', upload.array('photos', 5), (req, res) => {
  try {
    let { name, phone, selectedPhotoUrls, consentToDisplay, visitorToken, selectedProfileId, deviceToken } = req.body;
    if (deviceToken && !visitorToken && !selectedProfileId) {
      const tokenPhone = visitorDeviceTokens[String(deviceToken).trim()];
      if (!tokenPhone) return res.status(401).json({ success: false, message: 'This device is not linked to a visitor profile.' });
      phone = tokenPhone;
      const known = visitors.find(v => v.isProfileRegistration && normalizePhone(v.phone) === normalizePhone(phone));
      if (!known) return res.status(404).json({ success: false, message: 'Visitor profile not found.' });
      name = known.name;
    }
    if (selectedProfileId && !visitorToken) {
      const known = visitors.find(v => (v.profileId || ('profile_' + normalizePhone(v.phone))) === String(selectedProfileId).trim());
      if (!known) return res.status(404).json({ success: false, message: 'Selected visitor profile not found.' });
      phone = known.phone; name = known.name;
    }
    if (visitorToken) {
      const tokenPhone = visitorQrTokens[String(visitorToken).trim()];
      if (!tokenPhone) return res.status(401).json({ success: false, message: 'Personal QR is invalid or revoked.' });
      phone = tokenPhone;
      const known = visitors.find(v => normalizePhone(v.phone) === normalizePhone(phone));
      if (!known) return res.status(404).json({ success: false, message: 'Visitor profile not found.' });
      name = known.name;
    }
    const invalidFiles = (req.files || []).filter(file => !hasValidImageSignature(file.path));
    if (invalidFiles.length) {
      invalidFiles.forEach(file => { try { fs.unlinkSync(file.path); } catch (_) {} });
      return res.status(400).json({ success: false, message: 'An uploaded file is not a valid supported image.' });
    }
    if (!name || name.trim() === '') return res.status(400).json({ success: false, message: 'Visitor name is required.' });
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== 10) return res.status(400).json({ success: false, message: 'A valid 10-digit mobile number is required to find your profile.' });
    if (consentToDisplay !== 'true') return res.status(400).json({ success: false, message: 'Consent is required before displaying photos on the TV.' });

    let selected = [];
    try { selected = JSON.parse(selectedPhotoUrls || '[]'); } catch (_) { selected = []; }
    if (!Array.isArray(selected)) selected = [];
    const previousPhotos = visitorPhotoHistory(normalizedPhone);
    // Only accept old-photo URLs that are already associated with this visitor profile.
    const safePreviousSelection = selected.filter(url => typeof url === 'string' && previousPhotos.includes(url));
    const uploadedPhotoUrls = (req.files || []).map(file => `/uploads/${file.filename}`);
    const profilePhotoHistory = [...new Set([...previousPhotos, ...uploadedPhotoUrls])];
    const displayPhotos = [...new Set([...safePreviousSelection, ...uploadedPhotoUrls])];
    if (!displayPhotos.length) return res.status(400).json({ success: false, message: 'Select at least one previous photo or upload a new photo.' });

    const newVisitor = {
      id: 'vis_' + Date.now(),
      profileId: 'profile_' + normalizedPhone,
      name: name.trim(),
      phone: String(phone).trim(),
      photos: displayPhotos,
      photoHistory: profilePhotoHistory,
      consentToDisplay: true,
      status: settings.autoApprove ? 'approved' : 'pending',
      timestamp: new Date().toISOString()
    };
    visitors.unshift(newVisitor);
    // Keep the registered profile record's permanent photo history up to date.
    const profileRecord = visitors.find(v => v.isProfileRegistration && normalizePhone(v.phone) === normalizedPhone);
    if (profileRecord) {
      profileRecord.photoHistory = profilePhotoHistory;
      profileRecord.photos = profilePhotoHistory;
      profileRecord.consentToDisplay = true;
      profileRecord.name = newVisitor.name;
    }
    writeJson(VISITORS_FILE, visitors);

    if (newVisitor.status === 'approved') {
      uploadedPhotoUrls.forEach(url => photos.unshift({
        id: 'p_' + Date.now() + Math.random().toString(36).substring(7),
        url,
        title: `Visitor: ${newVisitor.name}`,
        uploadedAt: new Date().toISOString()
      }));
      writeJson(PHOTOS_FILE, photos);
      triggerWelcomeShow(newVisitor);
    }

    io.emit('VISITOR_EVENT', { type: newVisitor.status === 'approved' ? 'AUTO_APPROVED' : 'NEW_PENDING', visitor: newVisitor });
    res.json({ success: true, message: 'Check-in successful!', visitor: newVisitor, returningVisitor: previousPhotos.length > 0, mode: newVisitor.status });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ success: false, message: 'Server error during check-in.' });
  }
});

// 2. Admin: Get all visitors
app.get('/api/admin/visitors', (req, res) => {
  res.json({ success: true, visitors });
});

// 3. Admin: Approve visitor
app.post('/api/admin/approve/:id', (req, res) => {
  const visitor = visitors.find(v => v.id === req.params.id);
  if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });

  visitor.status = 'approved';
  writeJson(VISITORS_FILE, visitors);

  // Add photos to ambient library
  visitor.photos.forEach(url => {
    photos.unshift({
      id: 'p_' + Date.now() + Math.random().toString(36).substring(7),
      url: url,
      title: `Visitor: ${visitor.name}`,
      uploadedAt: new Date().toISOString()
    });
  });
  writeJson(PHOTOS_FILE, photos);

  triggerWelcomeShow(visitor);
  io.emit('VISITOR_EVENT', { type: 'MANUALLY_APPROVED', visitor });

  res.json({ success: true, visitor });
});

// 4. Admin: Reject visitor
app.post('/api/admin/reject/:id', (req, res) => {
  visitors = visitors.filter(v => v.id !== req.params.id);
  writeJson(VISITORS_FILE, visitors);
  io.emit('VISITOR_EVENT', { type: 'REJECTED', visitorId: req.params.id });
  res.json({ success: true, message: 'Visitor rejected and removed.' });
});

// 5. Ambient Photos: List & Delete
app.get('/api/photos/ambient', (req, res) => {
  res.json({ success: true, photos });
});

app.delete('/api/photos/:id', (req, res) => {
  photos = photos.filter(p => p.id !== req.params.id);
  writeJson(PHOTOS_FILE, photos);
  io.emit('AMBIENT_PHOTOS_UPDATED', photos);
  res.json({ success: true, message: 'Photo deleted' });
});

// 6. TV Status API
app.get('/api/tv/status', (req, res) => {
  res.json({ success: true, tvs: connectedTVs });
});

// 7. Instant Broadcast text alert to TVs
app.post('/api/admin/broadcast-message', (req, res) => {
  const { message, durationSeconds } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

  io.emit('BROADCAST_MESSAGE', {
    message,
    durationSeconds: durationSeconds || 15
  });
  res.json({ success: true, message: 'Broadcast sent to TVs' });
});

// 8. Settings API
app.get('/api/admin/settings', (req, res) => {
  res.json({ success: true, settings });
});

app.post('/api/admin/settings', (req, res) => {
  settings = { ...settings, ...req.body };
  writeJson(SETTINGS_FILE, settings);
  io.emit('SETTINGS_UPDATED', settings);
  res.json({ success: true, settings });
});

// Root Redirect to Admin or Info
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Smart TV Visitor Sync Hub</title></head>
      <body style="font-family: Arial, sans-serif; background: #0f172a; color: white; padding: 40px; text-align: center;">
        <h1 style="color: #f59e0b;">🏛️ Smart TV Visitor & Welcome System</h1>
        <p style="color: #94a3b8;">Central Hub Running for 3x LG webOS 22 TVs</p>
        <div style="margin-top: 30px; display: flex; justify-content: center; gap: 20px;">
          <a href="/qr" style="background: #a855f7; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">🔳 Generate Visitor QR Code</a>
          <a href="/gate" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">📱 Gate QR Portal (Visitor Check-in)</a>
          <a href="/admin" style="background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">🎛️ Admin Control Dashboard</a>
          <a href="/tv" style="background: #f59e0b; color: black; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">📺 Launch TV Display (Simulator/TV)</a>
        </div>
      </body>
    </html>
  `);
});

// ======================== SOCKET.IO REALTIME ========================
io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  // Register TV
  socket.on('REGISTER_TV', (data) => {
    const tvId = data.tvId || 'tv1';
    if (connectedTVs[tvId]) {
      connectedTVs[tvId].status = 'online';
      connectedTVs[tvId].socketId = socket.id;
      connectedTVs[tvId].lastSeen = new Date().toISOString();
      console.log(`[TV CONNECTED] ${connectedTVs[tvId].name} (${tvId}) is now ONLINE.`);
      io.emit('TV_STATUS_UPDATE', connectedTVs);
    }
  });

  // TV Heartbeat
  socket.on('TV_HEARTBEAT', (data) => {
    const tvId = data.tvId;
    if (connectedTVs[tvId]) {
      connectedTVs[tvId].status = 'online';
      connectedTVs[tvId].lastSeen = new Date().toISOString();
      if (data.currentMode) connectedTVs[tvId].currentMode = data.currentMode;
    }
  });

  // Client disconnect
  socket.on('disconnect', () => {
    Object.keys(connectedTVs).forEach(k => {
      if (connectedTVs[k].socketId === socket.id) {
        connectedTVs[k].status = 'offline';
        console.log(`[TV DISCONNECTED] ${connectedTVs[k].name} went OFFLINE.`);
        io.emit('TV_STATUS_UPDATE', connectedTVs);
      }
    });
  });
});

// Periodic offline check (marks offline if no heartbeat in 20s)
setInterval(() => {
  const now = Date.now();
  let changed = false;
  Object.keys(connectedTVs).forEach(k => {
    if (connectedTVs[k].status === 'online' && connectedTVs[k].lastSeen) {
      const diff = now - new Date(connectedTVs[k].lastSeen).getTime();
      if (diff > 25000) {
        connectedTVs[k].status = 'offline';
        changed = true;
      }
    }
  });
  if (changed) io.emit('TV_STATUS_UPDATE', connectedTVs);
}, 10000);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be 25MB or smaller.' : 'Upload limit reached (maximum 5 photos).' });
  if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
  next();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Smart TV Visitor Sync Hub is LIVE on Port ${PORT}`);
  console.log(`📱 Visitor Gate Check-in: http://localhost:${PORT}/gate`);
  console.log(`🎛️ Admin Dashboard:        http://localhost:${PORT}/admin`);
  console.log(`📺 webOS 22 TV Display:    http://localhost:${PORT}/tv`);
  console.log(`====================================================`);
});
