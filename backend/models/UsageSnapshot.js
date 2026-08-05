const mongoose = require('mongoose');

const usageSnapshotSchema = new mongoose.Schema({
  device: {type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true},
  date: {type: String, required: true},
  totalMinutes: {type: Number, min: 0, default: 0},
  apps: [{packageName: String, label: String, minutes: {type: Number, min: 0}}],
}, {timestamps: true});

usageSnapshotSchema.index({device: 1, date: 1}, {unique: true});

module.exports = mongoose.model('UsageSnapshot', usageSnapshotSchema);
