import fs from 'fs/promises';
import path from 'path';
import { unlink } from 'fs';
const filehandler = {};
// save as file
// filehandler.saveFile = async (file) => {
//   const DESTINATION_PATH = 'public/uploads';
//   const destinationDirPath = path.join(process.cwd(), DESTINATION_PATH);
//   const fileArrayBuffer = await file.arrayBuffer();
//   await fs.mkdir(destinationDirPath, { recursive: true });
//   await fs.writeFile(
//     path.join(destinationDirPath, Date.now() + '_' + file.name),
//     Buffer.from(fileArrayBuffer),
//   );
//   return DESTINATION_PATH + '/' + Date.now() + '_' + file.name;
// };
filehandler.saveFile = async (file) => {
  const DESTINATION_PATH = 'public/uploads';
  const destinationDirPath = path.join(/*turbopackIgnore: true*/ process.cwd(), DESTINATION_PATH);
  const timestamp = Date.now();
  const fileName = `${timestamp}_${file.name}`;
  const filePath = path.join(destinationDirPath, fileName);

  try {
    const fileArrayBuffer = await file.arrayBuffer();

    await fs.mkdir(destinationDirPath, { recursive: true });
    await fs.writeFile(filePath, Buffer.from(fileArrayBuffer));

    return `${DESTINATION_PATH}/${fileName}`;
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('File could not be saved.');
  }
};
// save as data
// filehandler.saveFileAsBinary = async (file) => {
//   const fileArrayBuffer = await file.arrayBuffer();
//   const base64Data = Buffer.from(fileArrayBuffer);
//   const filedata = await file;
//   const opobj = {
//     name: filedata.name,
//     data: `data:${filedata.type};base64,${base64Data.toString('base64')}`,
//     encoding: 'base64',
//     mimetype: filedata.type,
//     size: filedata.size,
//   };
//   return opobj;
// };

// Save file as base64-encoded binary data
filehandler.saveFileAsBinary = async (file) => {
  try {
    const fileArrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(fileArrayBuffer).toString('base64');

    const opObj = {
      name: file.name,
      data: `data:${file.type};base64,${base64Data}`,
      encoding: 'base64',
      mimetype: file.type,
      size: file.size,
    };

    return opObj;
  } catch (error) {
    console.error('Error saving file as binary:', error);
    throw new Error('File could not be processed.');
  }
};

// Delete a file
// filehandler.deleteFile = function (filename) {
//   if (filename instanceof Object) {
//     return
//   }
//   const destinationDirPath = path.join(process.cwd(), filename);
//   unlink(destinationDirPath, function (err) {
//     if (err) {
//       return 'file not found';
//     }
//   });
// };

// Delete a file
filehandler.deleteFile = async (filename) => {
  if (typeof filename !== 'string') {
    throw new Error('Invalid filename');
  }

  const destinationFilePath = path.join(/*turbopackIgnore: true*/ process.cwd(), filename);

  try {
    await fs.unlink(destinationFilePath);
    return 'File deleted successfully';
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 'File not found';
    } else {
      console.error('Error deleting file:', error);
      throw new Error('Failed to delete file');
    }
  }
};

export default filehandler;
