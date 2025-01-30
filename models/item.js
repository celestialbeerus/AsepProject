import mongoose from 'mongoose';  // Import mongoose

const emailSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  opened: { type: Boolean, default: false }
});

const Email = mongoose.model('Email', emailSchema);

export default Email;  // Export the model
