const mongoose = require('mongoose');

const locationEventSchema = new mongoose.Schema({
  device: {type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true},
  latitude: {type: Number, required: true, min: -90, max: 90},
  longitude: {type: Number, required: true, min: -180, max: 180},
  accuracy: {type: Number, min: 0},
  capturedAt: {type: Date, default: Date.now},
}, {timestamps: true});

locationEventSchema.index({device: 1, capturedAt: -1});

module.exports = mongoose.model('LocationEvent', locationEventSchema);
