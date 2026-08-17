const crypto = require('crypto');
const mongoose = require('mongoose');
const Device = require('../models/Device');
const Policy = require('../models/Policy');
const Command = require('../models/Command');
const LocationEvent = require('../models/LocationEvent');
const UsageSnapshot = require('../models/UsageSnapshot');
const NotificationEvent = require('../models/NotificationEvent');

const makeId = () => crypto.randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();

const deviceIdentifierFilter = deviceId => {
  const value = String(deviceId || '').trim();
  const identifiers = mongoose.Types.ObjectId.isValid(value)
    ? [{_id: value}, {uniqueId: value.toUpperCase()}]
    : [{uniqueId: value.toUpperCase()}];
  return {$or: identifiers};
};

const findOwned = async (req, res) => {
  const device = await Device.findOne({
    $and: [
      deviceIdentifierFilter(req.params.deviceId),
      {owner: req.user._id},
    ],
    isActive: true,
  });
  if (!device) res.status(404).json({success: false, message: 'Device not found'});
  return device;
};

const findAccessible = async (req, res) => {
  const device = await Device.findOne({
    $and: [
      deviceIdentifierFilter(req.params.deviceId),
      {$or: [{owner: req.user._id}, {sharedWith: req.user._id}]},
    ],
    isActive: true,
  });
  if (!device) res.status(404).json({success: false, message: 'Device not found'});
  return device;
};

exports.list = async (req, res) => {
  const devices = await Device.find({
    $or: [{owner: req.user._id}, {sharedWith: req.user._id}],
    isActive: true,
  }).sort({createdAt: -1});
  res.json({success: true, devices});
};

exports.enroll = async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({success: false, message: 'Device name is required'});
  let uniqueId;
  do uniqueId = makeId(); while (await Device.exists({uniqueId}));
  const device = await Device.create({owner: req.user._id, name, uniqueId});
  const policy = await Policy.create({device: device._id, allowedCommands: ['STATUS_REFRESH', 'RING', 'SYNC_POLICY', 'END_SESSION']});
  res.status(201).json({success: true, device, policy});
};

exports.pair = async (req, res) => {
  const uniqueId = String(req.body.uniqueId || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(uniqueId)) {
    return res.status(400).json({success: false, message: 'Enter the device pairing ID shown in the client app'});
  }

  const device = await Device.findOne({uniqueId, isActive: true});
  if (!device) return res.status(404).json({success: false, message: 'No active device was found for that pairing ID'});
  if (device.owner.equals(req.user._id)) {
    return res.status(400).json({success: false, message: 'This device already belongs to your account'});
  }

  await Device.updateOne({_id: device._id}, {$addToSet: {sharedWith: req.user._id}});
  const pairedDevice = await Device.findById(device._id);
  res.json({success: true, device: pairedDevice, message: 'Device paired successfully'});
};

exports.get = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;
  const policy = await Policy.findOne({device: device._id});
  res.json({success: true, device, policy});
};

exports.update = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;
  if (req.body.name) device.name = String(req.body.name).trim();
  if (typeof req.body.monitoringEnabled === 'boolean') device.monitoringEnabled = req.body.monitoringEnabled;
  await device.save();
  res.json({success: true, device});
};

exports.revoke = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  device.isActive = false;
  device.monitoringEnabled = false;
  await device.save();
  res.json({success: true, message: 'Device access revoked'});
};

exports.heartbeat = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;

  const completedCommandIds = Array.isArray(req.body.completedCommandIds)
    ? req.body.completedCommandIds.filter(id => mongoose.Types.ObjectId.isValid(id)).slice(0, 50)
    : [];
  if (req.body.lastCommandStatus === 'executed' && mongoose.Types.ObjectId.isValid(req.body.lastCommandId)) {
    completedCommandIds.push(req.body.lastCommandId);
  }

  if (completedCommandIds.length) {
    await Command.updateMany(
      {
        _id: {$in: completedCommandIds},
        device: device._id,
        type: {$in: ['REMOTE_TOUCH', 'REMOTE_ACTION', 'SCREEN_STREAM_START', 'SCREEN_STREAM_STOP']},
        status: 'pending',
      },
      {status: 'completed', acknowledgedAt: new Date()},
    );
  }

  const {completedCommandIds: ignoredCompletedIds, lastCommandId, lastCommandStatus, ...status} = req.body;
  device.lastSeenAt = new Date();
  device.status = {...device.status?.toObject?.(), ...status};
  await device.save();

  await Command.updateMany(
    {device: device._id, status: 'pending', expiresAt: {$lte: new Date()}},
    {status: 'expired'},
  );
  const policy = await Policy.findOne({device: device._id});
  const commands = await Command.find({device: device._id, status: 'pending', expiresAt: {$gt: new Date()}}).sort({createdAt: 1});
  const activeLiveRequest = await Command.findOne({
    device: device._id,
    type: 'LIVE_SESSION_REQUEST',
    status: 'accepted',
    expiresAt: {$gt: new Date()},
  }).sort({acknowledgedAt: -1});

  res.json({success: true, policy, commands, activeLiveRequest});
};

exports.approveLiveSession = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;

  let command;
  if (req.body.requestId && mongoose.Types.ObjectId.isValid(req.body.requestId)) {
    command = await Command.findOne({
      _id: req.body.requestId,
      device: device._id,
      type: 'LIVE_SESSION_REQUEST',
      status: 'pending',
      expiresAt: {$gt: new Date()},
    });
  }

  // Fallback: If specific requestId is not found or not provided, find the latest pending live session request for this device
  if (!command) {
    command = await Command.findOne({
      device: device._id,
      type: 'LIVE_SESSION_REQUEST',
      status: 'pending',
      expiresAt: {$gt: new Date()},
    }).sort({createdAt: -1});
  }

  if (!command) {
    return res.status(404).json({
      success: false,
      message: 'No pending live-session request was found. Ask the parent to request a new session.',
    });
  }

  command.status = 'accepted';
  command.acknowledgedAt = new Date();
  command.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  command.payload = {...command.payload, approvedOnDevice: true};
  await command.save();

  device.monitoringEnabled = true;
  await device.save();

  res.json({success: true, device, command});
};

/**
 * Mark any active (accepted) LIVE_SESSION_REQUEST as 'completed' so the
 * client-side MonitoringService sees activeLiveRequest = null and stops
 * publishing camera/mic via Agora. Called when the admin navigates away
 * from CameraView / MicView.
 */
exports.endLiveSession = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;

  const result = await Command.updateMany(
    {device: device._id, type: 'LIVE_SESSION_REQUEST', status: 'accepted', expiresAt: {$gt: new Date()}},
    {$set: {status: 'completed'}},
  );

  res.json({success: true, ended: result.modifiedCount});
};

exports.updatePolicy = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const allowed = ['dailyLimitMinutes', 'bedtime', 'appLimits', 'locationSharing', 'usageSharing', 'allowedCommands'];
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const policy = await Policy.findOneAndUpdate({device: device._id}, update, {new: true, runValidators: true, upsert: true});
  res.json({success: true, policy});
};

exports.createCommand = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;
  const policy = await Policy.findOne({device: device._id});
  const alwaysAllowed = ['LIVE_SESSION_REQUEST', 'END_SESSION', 'SCREEN_STREAM_START', 'SCREEN_STREAM_STOP'];
  if (!alwaysAllowed.includes(req.body.type) && !policy?.allowedCommands.includes(req.body.type)) {
    return res.status(403).json({success: false, message: 'Command is not allowed by device policy'});
  }
  if (req.body.type === 'LIVE_SESSION_REQUEST') {
    // AirDroid style: Auto-enable monitoring and auto-approve live session request
    device.monitoringEnabled = true;
    await device.save();

    const activeSession = await Command.findOne({
      device: device._id,
      type: 'LIVE_SESSION_REQUEST',
      status: {$in: ['accepted', 'pending']},
      expiresAt: {$gt: new Date()},
    }).sort({createdAt: -1});

    if (activeSession) {
      if (activeSession.status !== 'accepted') {
        activeSession.status = 'accepted';
        activeSession.acknowledgedAt = new Date();
        activeSession.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await activeSession.save();
      }
      return res.status(200).json({success: true, command: activeSession});
    }

    const command = await Command.create({
      device: device._id,
      requestedBy: req.user._id,
      type: 'LIVE_SESSION_REQUEST',
      status: 'accepted',
      acknowledgedAt: new Date(),
      payload: req.body.payload || {},
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    return res.status(201).json({success: true, command});
  }
  const command = await Command.create({device: device._id, requestedBy: req.user._id, type: req.body.type, payload: req.body.payload || {}, expiresAt: new Date(Date.now() + 5 * 60 * 1000)});
  res.status(201).json({success: true, command});
};

exports.listCommands = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;
  const commands = await Command.find({device: device._id}).sort({createdAt: -1}).limit(100);
  res.json({success: true, commands});
};

exports.getCommand = async (req, res) => {
  const device = await findAccessible(req, res);
  if (!device) return;

  const command = await Command.findOne({_id: req.params.commandId, device: device._id});
  if (!command) return res.status(404).json({success: false, message: 'Command not found'});

  if (command.status === 'pending' && command.expiresAt <= new Date()) {
    command.status = 'expired';
    await command.save();
  }

  res.json({success: true, command});
};

exports.addLocation = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const policy = await Policy.findOne({device: device._id});
  if (!policy?.locationSharing) return res.status(403).json({success: false, message: 'Location sharing is disabled'});
  const event = await LocationEvent.create({...req.body, device: device._id});
  res.status(201).json({success: true, event});
};

exports.listLocations = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const locations = await LocationEvent.find({device: device._id}).sort({capturedAt: -1}).limit(200);
  res.json({success: true, locations});
};

exports.addUsage = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const policy = await Policy.findOne({device: device._id});
  if (!policy?.usageSharing) return res.status(403).json({success: false, message: 'Usage sharing is disabled'});
  const snapshot = await UsageSnapshot.findOneAndUpdate({device: device._id, date: req.body.date}, {...req.body, device: device._id}, {new: true, runValidators: true, upsert: true});
  res.json({success: true, snapshot});
};

exports.listUsage = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const usage = await UsageSnapshot.find({device: device._id}).sort({date: -1}).limit(90);
  res.json({success: true, usage});
};

exports.addNotifications = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const events = Array.isArray(req.body.events) ? req.body.events.slice(0, 50) : [];
  if (!events.length) return res.status(400).json({success: false, message: 'Notification events are required'});

  const clean = events.map(event => ({
    device: device._id,
    packageName: String(event.packageName || '').slice(0, 200),
    category: String(event.category || '').slice(0, 80),
    title: String(event.title || '').slice(0, 240),
    text: String(event.text || '').slice(0, 240),
    postedAt: new Date(event.postedAt),
  })).filter(event => event.packageName && !Number.isNaN(event.postedAt.getTime()));

  if (!clean.length) return res.status(400).json({success: false, message: 'No valid notification events supplied'});
  await NotificationEvent.insertMany(clean, {ordered: false});
  res.status(201).json({success: true, accepted: clean.length});
};

exports.listNotifications = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const notifications = await NotificationEvent.find({device: device._id})
    .sort({postedAt: -1})
    .limit(100);
  res.json({success: true, notifications});
};

// Grant persistent remote access (one-time setup)
exports.grantPersistentAccess = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;

  const accessToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  device.persistentAccess = {
    granted: true,
    grantedAt: new Date(),
    accessToken,
    expiresAt,
  };
  device.monitoringEnabled = true;
  await device.save();

  res.json({success: true, accessToken, expiresAt});
};

// Revoke persistent access
exports.revokePersistentAccess = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;

  device.persistentAccess = {
    granted: false,
    grantedAt: null,
    accessToken: null,
    expiresAt: null,
  };
  await device.save();

  res.json({success: true, message: 'Persistent access revoked'});
};

// Validate persistent access token (for client app)
exports.validatePersistentAccess = async (req, res) => {
  const {uniqueId, accessToken} = req.body;
  
  const device = await Device.findOne({
    uniqueId: String(uniqueId).toUpperCase(),
    isActive: true,
    'persistentAccess.granted': true,
    'persistentAccess.accessToken': accessToken,
    'persistentAccess.expiresAt': {$gt: new Date()},
  });

  if (!device) {
    return res.status(401).json({success: false, message: 'Invalid or expired access token'});
  }

  res.json({success: true, device: {id: device._id, name: device.name, uniqueId: device.uniqueId}});
};
