const crypto = require('crypto');
const Device = require('../models/Device');
const Policy = require('../models/Policy');
const Command = require('../models/Command');
const LocationEvent = require('../models/LocationEvent');
const UsageSnapshot = require('../models/UsageSnapshot');

const makeId = () => crypto.randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();

const findOwned = async (req, res) => {
  const device = await Device.findOne({_id: req.params.deviceId, owner: req.user._id, isActive: true});
  if (!device) res.status(404).json({success: false, message: 'Device not found'});
  return device;
};

exports.list = async (req, res) => {
  const devices = await Device.find({owner: req.user._id, isActive: true}).sort({createdAt: -1});
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

exports.get = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const policy = await Policy.findOne({device: device._id});
  res.json({success: true, device, policy});
};

exports.update = async (req, res) => {
  const device = await findOwned(req, res);
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
  const device = await findOwned(req, res);
  if (!device) return;
  device.lastSeenAt = new Date();
  device.status = {...device.status?.toObject?.(), ...req.body};
  await device.save();
  const policy = await Policy.findOne({device: device._id});
  const commands = await Command.find({device: device._id, status: 'pending', expiresAt: {$gt: new Date()}}).sort({createdAt: 1});
  res.json({success: true, policy, commands});
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
  const device = await findOwned(req, res);
  if (!device) return;
  const policy = await Policy.findOne({device: device._id});
  if (!policy?.allowedCommands.includes(req.body.type)) return res.status(403).json({success: false, message: 'Command is not allowed by device policy'});
  const command = await Command.create({device: device._id, requestedBy: req.user._id, type: req.body.type, payload: req.body.payload || {}, expiresAt: new Date(Date.now() + 5 * 60 * 1000)});
  res.status(201).json({success: true, command});
};

exports.listCommands = async (req, res) => {
  const device = await findOwned(req, res);
  if (!device) return;
  const commands = await Command.find({device: device._id}).sort({createdAt: -1}).limit(100);
  res.json({success: true, commands});
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
