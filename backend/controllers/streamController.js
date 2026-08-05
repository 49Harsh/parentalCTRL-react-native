const Device = require('../models/Device');
const Command = require('../models/Command');
const {generateAdminToken, generateClientToken} = require('../utils/agoraToken');

const getOwnedDevice = async (req) => Device.findOne({
  $or: [{_id: req.params.deviceId}, {uniqueId: String(req.params.deviceId).toUpperCase()}],
  owner: req.user._id,
  isActive: true,
});

const verifyDevice = async (req, res) => {
  const device = await getOwnedDevice(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});
  res.json({success: true, valid: true, device});
};

const getAdminToken = async (req, res) => {
  const device = await getOwnedDevice(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});
  const approved = await Command.findOne({device: device._id, type: 'LIVE_SESSION_REQUEST', status: 'accepted', expiresAt: {$gt: new Date()}});
  if (!device.monitoringEnabled || !approved) return res.status(403).json({success: false, message: 'A visible live-session approval is required on the device'});
  res.json({success: true, ...generateAdminToken(device.uniqueId), device: {id: device._id, name: device.name, uniqueId: device.uniqueId}});
};

const getClientToken = async (req, res) => {
  const device = await getOwnedDevice(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});
  if (!device.monitoringEnabled) return res.status(403).json({success: false, message: 'Monitoring is disabled on this device'});
  res.json({success: true, ...generateClientToken(device.uniqueId)});
};

module.exports = {verifyDevice, getAdminToken, getClientToken};
