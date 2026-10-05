import connectDB from '@/config/db';
import Banner from '@/models/bannerModel';
import BannerDraft from '@/models/bannerDraftModel';
import BannerVersion from '@/models/bannerVersionModel';
import { NextRequest } from 'next/server';

type Params = { params: Promise<{ bannerId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectDB();
  const { bannerId } = await params;
  const banner = await Banner.findById(bannerId).lean();
  if (!banner) {
    return Response.json({ msg: 'Banner not found' }, { status: 404 });
  }
  const latestDraft = await BannerDraft.findOne({ bannerId })
    .sort({ createdAt: -1 })
    .lean();
  return Response.json({ banner, draft: latestDraft });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  await connectDB();
  const { bannerId } = await params;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, any> = {};
  if (typeof body?.name === 'string' && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (Number(body?.width) > 0) update.width = Number(body.width);
  if (Number(body?.height) > 0) update.height = Number(body.height);
  const banner = await Banner.findByIdAndUpdate(bannerId, update, { new: true }).lean();
  if (!banner) {
    return Response.json({ msg: 'Banner not found' }, { status: 404 });
  }
  return Response.json({ banner });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectDB();
  const { bannerId } = await params;
  // findByIdAndDelete throws a CastError on malformed ids — clean 404.
  if (!/^[0-9a-fA-F]{24}$/.test(bannerId)) {
    return Response.json({ msg: 'Banner not found' }, { status: 404 });
  }
  const banner = await Banner.findByIdAndDelete(bannerId).lean();
  if (!banner) {
    return Response.json({ msg: 'Banner not found' }, { status: 404 });
  }
  await BannerDraft.deleteMany({ bannerId });
  await BannerVersion.deleteMany({ bannerId });
  return Response.json({ ok: true });
}
