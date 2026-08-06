const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
  device: {type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, unique: true},
  dailyLimitMinutes: {type: Number, min: 0, max: 1440, default: 180},
  bedtime: {
    enabled: {type: Boolean, default: false},
    start: {type: String, default: '21:00'},
    end: {type: String, default: '07:00'},
  },
  appLimits: [{packageName: String, label: String, minutes: {type: Number, min: 0, max: 1440}}],
  locationSharing: {type: Boolean, default: false},
  usageSharing: {type: Boolean, default: false},
  allowedCommands: [{type: String, enum: ['STATUS_REFRESH', 'RING', 'LOCATION_REFRESH', 'LIVE_SESSION_REQUEST', 'REMOTE_TOUCH', 'REMOTE_ACTION', 'SYNC_POLICY', 'END_SESSION']}],
}, {timestamps: true});

module.exports = mongoose.model('Policy', policySchema);
