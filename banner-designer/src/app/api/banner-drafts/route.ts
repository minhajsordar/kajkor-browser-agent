import connectDB from '@/config/db';
import Banner from '@/models/bannerModel';
import BannerDraft from '@/models/bannerDraftModel';
import { NextRequest } from 'next/server';

const MAX_DRAFTS_PER_BANNER = 20;

export async function GET(req: NextRequest) {
  await connectDB();
  const bannerId = req.nextUrl.searchParams.get('bannerId');
  if (!bannerId) {
    return Response.json({ msg: 'bannerId is required' }, { status: 400 });
  }
  const drafts = await BannerDraft.find({ bannerId })
    .sort({ createdAt: -1 })
    .lean();
  return Response.json({ drafts });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const bannerId = String(body?.bannerId || '');
  const builderData = body?.builderData;
  if (!bannerId || !builderData || typeof builderData !== 'object') {
    return Response.json({ msg: 'bannerId and builderData are required' }, { status: 400 });
  }
  const banner = await Banner.findById(bannerId).lean();
  if (!banner) {
    return Response.json({ msg: 'Banner not found' }, { status: 404 });
  }

  const count = await BannerDraft.countDocuments({ bannerId });
  const draft = await BannerDraft.create({
    bannerId,
    version: count + 1,
    builderData,
  });

  // Cap stored drafts; oldest first.
  const stale = await BannerDraft.find({ bannerId })
    .sort({ createdAt: -1 })
    .skip(MAX_DRAFTS_PER_BANNER)
    .select('_id')
    .lean();
  if (stale.length) {
    await BannerDraft.deleteMany({ _id: { $in: stale.map((d: any) => d._id) } });
  }

  return Response.json({ draft }, { status: 201 });
}
