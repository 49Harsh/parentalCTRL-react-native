const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  device: {type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true},
  requestedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  type: {type: String, required: true, enum: ['STATUS_REFRESH', 'RING', 'LOCATION_REFRESH', 'LIVE_SESSION_REQUEST', 'SYNC_POLICY', 'END_SESSION']},
  status: {type: String, enum: ['pending', 'accepted', 'completed', 'rejected', 'expired'], default: 'pending'},
  payload: {type: mongoose.Schema.Types.Mixed, default: {}},
  expiresAt: {type: Date, required: true},
  acknowledgedAt: Date,
}, {timestamps: true});

commandSchema.index({device: 1, status: 1, createdAt: -1});

module.exports = mongoose.model('Command', commandSchema);
