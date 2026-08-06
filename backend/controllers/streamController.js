const Device = require('../models/Device');
const Command = require('../models/Command');
const mongoose = require('mongoose');
const {generateAdminToken, generateClientToken} = require('../utils/agoraToken');

const getAccessibleDevice = async (req) => {
  const deviceId = req.params.deviceId;
  const query = {
    $or: [{owner: req.user._id}, {sharedWith: req.user._id}],
    isActive: true,
  };
  
  // Check if deviceId is a valid ObjectId
  if (mongoose.Types.ObjectId.isValid(deviceId)) {
    query.$and = [{$or: [{_id: deviceId}, {uniqueId: String(deviceId).toUpperCase()}]}];
  } else {
    query.uniqueId = String(deviceId).toUpperCase();
  }
  
  return Device.findOne(query);
};

const verifyDevice = async (req, res) => {
  const device = await getAccessibleDevice(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});
  res.json({success: true, valid: true, device});
};

const getAdminToken = async (req, res) => {
  const device = await getAccessibleDevice(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});
  const approved = await Command.findOne({device: device._id, type: 'LIVE_SESSION_REQUEST', status: 'accepted', expiresAt: {$gt: new Date()}});
  if (!device.monitoringEnabled || !approved) return res.status(403).json({success: false, message: 'A visible live-session approval is required on the device'});
  res.json({success: true, ...generateAdminToken(device.uniqueId), device: {id: device._id, name: device.name, uniqueId: device.uniqueId}});
};

const getClientToken = async (req, res) => {
  const device = await getAccessibleDevice(req);
  if (!device) return res.status(404).json({success: false, message: 'Device not found'});
  if (!device.monitoringEnabled) return res.status(403).json({success: false, message: 'Monitoring is disabled on this device'});
  res.json({success: true, ...generateClientToken(device.uniqueId)});
};

module.exports = {verifyDevice, getAdminToken, getClientToken};
