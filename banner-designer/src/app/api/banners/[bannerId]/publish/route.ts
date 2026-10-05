import connectDB from '@/config/db';
import Banner from '@/models/bannerModel';
import BannerVersion from '@/models/bannerVersionModel';
import { NextRequest } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  await connectDB();
  const { bannerId } = await params;
  const body = await req.json().catch(() => ({}));
  const builderData = body?.builderData;
  if (!builderData || typeof builderData !== 'object') {
    return Response.json({ msg: 'builderData is required' }, { status: 400 });
  }
  const banner = await Banner.findById(bannerId);
  if (!banner) {
    return Response.json({ msg: 'Banner not found' }, { status: 404 });
  }

  const latest = await BannerVersion.findOne({ bannerId })
    .sort({ version: -1 })
    .lean() as any;
  const version = await BannerVersion.create({
    bannerId,
    version: (latest?.version || 0) + 1,
    builderData,
    publishedAt: new Date(),
  });

  banner.publishedVersionId = version._id;
  banner.status = 'published';
  await banner.save();

  return Response.json({ version }, { status: 201 });
}
