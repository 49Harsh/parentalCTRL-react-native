const mongoose = require('mongoose');

const callEventSchema = new mongoose.Schema({
  device: {type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true},
  number: {type: String, default: '', maxlength: 40},
  name: {type: String, default: '', maxlength: 120},
  type: {type: String, required: true, enum: ['incoming', 'outgoing', 'missed', 'unknown'], default: 'unknown'},
  duration: {type: Number, min: 0, default: 0}, // seconds
  occurredAt: {type: Date, required: true},
}, {timestamps: true});

callEventSchema.index({device: 1, occurredAt: -1});
// Dedup guard: the client may re-read the same last call after every IDLE event.
callEventSchema.index({device: 1, number: 1, occurredAt: 1, type: 1});
callEventSchema.index({createdAt: 1}, {expireAfterSeconds: 90 * 24 * 60 * 60}); // 90-day TTL

module.exports = mongoose.model('CallEvent', callEventSchema);
