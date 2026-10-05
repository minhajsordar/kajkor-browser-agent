import connectDB from '@/config/db';
import Banner from '@/models/bannerModel';
import BannerDraft from '@/models/bannerDraftModel';
import BannerVersion from '@/models/bannerVersionModel';
import { NextRequest } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> }
) {
  await connectDB();
  const { bannerId } = await params;
  const body = await req.json().catch(() => ({}));
  const versionId = String(body?.versionId || '');
  if (!versionId) {
    return Response.json({ msg: 'versionId is required' }, { status: 400 });
  }

  const source = await BannerVersion.findOne({ _id: versionId, bannerId }).lean() as any;
  if (!source) {
    return Response.json({ msg: 'Version not found' }, { status: 404 });
  }

  // Republish as a new version and drop it into a fresh draft for editing.
  const restored = await BannerVersion.create({
    bannerId,
    version: (await BannerVersion.countDocuments({ bannerId })) + 1,
    builderData: source.builderData,
    publishedAt: new Date(),
  });
  await Banner.findByIdAndUpdate(bannerId, {
    publishedVersionId: restored._id,
    status: 'published',
  });
  const count = await BannerDraft.countDocuments({ bannerId });
  await BannerDraft.create({
    bannerId,
    version: count + 1,
    builderData: source.builderData,
  });

  return Response.json({ version: restored }, { status: 201 });
}
