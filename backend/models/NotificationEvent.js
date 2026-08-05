const mongoose = require('mongoose');

const notificationEventSchema = new mongoose.Schema({
  device: {type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true},
  packageName: {type: String, required: true, maxlength: 200},
  category: {type: String, default: '', maxlength: 80},
  title: {type: String, default: '', maxlength: 240},
  text: {type: String, default: '', maxlength: 240},
  postedAt: {type: Date, required: true},
}, {timestamps: true});

notificationEventSchema.index({device: 1, postedAt: -1});
notificationEventSchema.index({createdAt: 1}, {expireAfterSeconds: 30 * 24 * 60 * 60});

module.exports = mongoose.model('NotificationEvent', notificationEventSchema);
