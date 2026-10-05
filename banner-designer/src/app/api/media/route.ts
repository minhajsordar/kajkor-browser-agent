import connectDB from '@/config/db';
import Media from '@/models/mediaModel';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  await connectDB();
  const query: Record<string, any> = {};
  const type = req.nextUrl.searchParams.get('type');
  if (type) {
    query.type = type;
  }
  const media = await Media.find(query).sort({ createdAt: -1 }).lean();
  return Response.json({ media });
}
