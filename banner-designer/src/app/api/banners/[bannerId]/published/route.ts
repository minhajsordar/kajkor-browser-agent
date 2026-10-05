import connectDB from '@/config/db';
import Banner from '@/models/bannerModel';
import BannerVersion from '@/models/bannerVersionModel';
import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  await connectDB();
  const { bannerId } = await params;
  const banner = await Banner.findById(bannerId).lean() as any;
  if (!banner) {
    return Response.json({ msg: 'Banner not found' }, { status: 404 });
  }
  if (!banner.publishedVersionId) {
    return Response.json({ msg: 'Banner has no published version' }, { status: 404 });
  }
  const publishedVersion = await BannerVersion.findById(banner.publishedVersionId).lean();
  return Response.json({ banner, publishedVersion });
}
