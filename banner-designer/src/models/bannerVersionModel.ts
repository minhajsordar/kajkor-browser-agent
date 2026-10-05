import mongoose from 'mongoose';

const bannerVersionSchema = new mongoose.Schema({
  bannerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Banner',
  },
  version: {
    type: Number,
    required: true,
    default: 1,
  },
  builderData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  publishedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
}, {
  timestamps: true,
});

const BannerVersion = mongoose.models.BannerVersion || mongoose.model('BannerVersion', bannerVersionSchema);
export default BannerVersion;
