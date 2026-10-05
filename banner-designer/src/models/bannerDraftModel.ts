import mongoose from 'mongoose';

const bannerDraftSchema = new mongoose.Schema({
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
}, {
  timestamps: true,
});

const BannerDraft = mongoose.models.BannerDraft || mongoose.model('BannerDraft', bannerDraftSchema);
export default BannerDraft;
