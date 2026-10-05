import connectDB from '@/config/db';
import BannerVersion from '@/models/bannerVersionModel';
import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  await connectDB();
  const { bannerId } = await params;
  const versions = await BannerVersion.find({ bannerId })
    .sort({ version: -1 })
    .select('_id version publishedAt')
    .lean();
  return Response.json({ versions });
}
