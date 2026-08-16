const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const Device = require('../models/Device');
const {authenticate, requireRole} = require('../middleware/auth');
const relay = require('../utils/screenRelay');

const router = express.Router();

// Applied per-route so requests that fall through to the main device router
// do not pay for a second authentication pass.
const auth = [authenticate, requireRole('parent')];

// These routes are mounted before the global 15-minute limiter and the 256kb
// JSON cap because frames are large and high-frequency; they get their own
// limits and body size instead.
const frameLimiter = rateLimit({windowMs: 60 * 1000, limit: 1200, standardHeaders: true, legacyHeaders: false});
const streamLimiter = rateLimit({windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false});
const pollLimiter = rateLimit({windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false});
const frameBodyParser = express.json({limit: '3mb'});

const deviceIdentifierFilter = deviceId => {
  const value = String(deviceId || '').trim();
  const identifiers = mongoose.Types.ObjectId.isValid(value)
    ? [{_id: value}, {uniqueId: value.toUpperCase()}]
    : [{uniqueId: value.toUpperCase()}];
  return {$or: identifiers};
};

const findAccessible = async req => Device.findOne({
  $and: [
    deviceIdentifierFilter(req.params.deviceId),
    {$or: [{owner: req.user._id}, {sharedWith: req.user._id}]},
  ],
  isActive: true,
});

// ── Client → Server: upload one captured frame ──────────────────────────────

router.post('/:deviceId/frames', ...auth, frameLimiter, frameBodyParser, async (req, res) => {
  const device = await findAccessible(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});

  const image = req.body.image;
  if (typeof image !== 'string' || image.length < 100 || image.length > 3_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    return res.status(400).json({success: false, message: 'Invalid frame payload'});
  }

  const delivered = relay.publishFrame(device._id.toString(), {
    image,
    seq: Number(req.body.seq) || 0,
    timestamp: req.body.timestamp || Date.now(),
    width: Number(req.body.width) || 0,
    height: Number(req.body.height) || 0,
  });

  res.json({success: true, delivered});
});

// ── Server → Admin: polling endpoints (simple GET, no chunked/streaming) ──────

// Returns the latest frame JPEG (base64) for polling-based "See Screen".
router.get('/:deviceId/last-frame', ...auth, pollLimiter, async (req, res) => {
  const device = await findAccessible(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});

  const last = relay.getLastFrame(device._id.toString());
  if (!last || Date.now() - last.savedAt > relay.LAST_FRAME_TTL_MS) {
    return res.json({success: true, frame: null});
  }

  res.json({success: true, frame: {image: last.image, seq: last.seq, timestamp: last.timestamp, width: last.width, height: last.height}});
});

// Returns diagnostic info about the screen capture relay.
router.get('/:deviceId/screen-status', ...auth, pollLimiter, async (req, res) => {
  const device = await findAccessible(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});

  const deviceId = device._id.toString();
  const last = relay.getLastFrame(deviceId);

  res.json({
    success: true,
    subscribers: relay.subscriberCount(deviceId),
    lastFrame: last ? {
      seq: last.seq,
      timestamp: last.timestamp,
      width: last.width,
      height: last.height,
      ageMs: Date.now() - last.savedAt,
    } : null,
  });
});

// ── Server → Admin: chunked streaming (alternative to polling) ────────────────

// Parent dashboard subscribes to the frame stream (newline-delimited JSON
// over chunked HTTP; read it with fetch + ReadableStream, not EventSource,
// because the Authorization header is required).
router.get('/:deviceId/stream', ...auth, streamLimiter, async (req, res) => {
  const device = await findAccessible(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});

  const deviceId = device._id.toString();
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  relay.addSubscriber(deviceId, res);
  const ping = setInterval(() => {
    if (relay.isSubscribed(deviceId, res)) {
      relay.writePing(deviceId, res);
    } else {
      clearInterval(ping);
    }
  }, 15000);
  if (ping.unref) ping.unref();

  req.on('close', () => {
    clearInterval(ping);
    relay.removeSubscriber(deviceId, res);
  });
});

module.exports = router;
