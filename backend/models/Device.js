const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  owner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  name: {type: String, required: true, trim: true, maxlength: 80},
  platform: {type: String, default: 'android', enum: ['android']},
  uniqueId: {type: String, required: true, unique: true, uppercase: true, trim: true, minlength: 10, maxlength: 10},
  isActive: {type: Boolean, default: true},
  monitoringEnabled: {type: Boolean, default: false},
  lastSeenAt: Date,
  status: {
    batteryLevel: {type: Number, min: 0, max: 100},
    networkType: String,
    appVersion: String,
    permissions: {type: Map, of: Boolean},
  },
  persistentAccess: {
    granted: {type: Boolean, default: false},
    grantedAt: Date,
    accessToken: String,
    expiresAt: Date,
  },
}, {timestamps: true});

deviceSchema.index({owner: 1, createdAt: -1});

module.exports = mongoose.model('Device', deviceSchema);
