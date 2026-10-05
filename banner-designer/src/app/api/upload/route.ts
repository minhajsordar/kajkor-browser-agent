import connectDB from '@/config/db';
import Media from '@/models/mediaModel';
import filehandler from '@/utils/filehandler';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  await connectDB();

  const formData = await req.formData();
  const files = formData.getAll('file');
  if (!files.length) {
    return Response.json({ msg: 'No files provided' }, { status: 400 });
  }

  const uploadedMedia = [];
  for (const file of files) {
    if (!(file instanceof File)) {
      continue;
    }
    const filePath = await filehandler.saveFile(file);
    const url = filePath.replace(/^public/, '');
    const media = await Media.create({
      filename: filePath.split('/').pop(),
      originalName: file.name,
      url,
      path: filePath,
      mimeType: file.type,
      size: file.size,
      type: file.type.startsWith('image/') ? 'image' : 'file',
    });
    uploadedMedia.push(media);
  }

  if (!uploadedMedia.length) {
    return Response.json({ msg: 'No valid files uploaded' }, { status: 400 });
  }
  return Response.json({ media: uploadedMedia }, { status: 201 });
}
