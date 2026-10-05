import connectDB from '@/config/db';
import Banner from '@/models/bannerModel';
import BannerDraft from '@/models/bannerDraftModel';
import { emptyBannerContent } from '@/utils/bannerContent';
import { NextRequest } from 'next/server';

export async function GET() {
  await connectDB();
  const banners = await Banner.find({}).sort({ updatedAt: -1 }).lean();
  return Response.json({ banners });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  if (!name) {
    return Response.json({ msg: 'Banner name is required' }, { status: 400 });
  }
  const width = Number(body?.width) || 1200;
  const height = Number(body?.height) || 628;

  const banner = await Banner.create({ name, width, height });
  const builderData = body?.builderData && typeof body.builderData === 'object'
    ? body.builderData
    : emptyBannerContent(width, height);
  await BannerDraft.create({ bannerId: banner._id, version: 1, builderData });

  return Response.json({ banner }, { status: 201 });
}
