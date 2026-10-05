import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  // Canvas size in px. Presets are applied client-side; these are the truth.
  width: {
    type: Number,
    required: true,
    default: 1200,
  },
  height: {
    type: Number,
    required: true,
    default: 628,
  },
  publishedVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BannerVersion',
  },
  status: {
    type: String,
    default: 'draft',
  },
}, {
  timestamps: true,
});

const Banner = mongoose.models.Banner || mongoose.model('Banner', bannerSchema);
export default Banner;
