const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const AdmZip = require('adm-zip');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB || 'browser_agent';
const BACKUP_ZIP = process.env.BACKUP_ZIP || path.join(__dirname, 'browser_agent_dump.zip');
const BACKUP_DIR = process.env.BACKUP_DIR || process.env.MONGODB_DUMP_DIR || path.join(__dirname, 'data', 'data', 'browser_agent');
const COLLECTIONS = ['pages', 'page-details', 'crm', 'tasks', 'schemas', 'skills', 'debug_items'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { stdio: 'inherit' }, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function findMongoDumpRoot(startDir) {
  const candidates = [path.join(startDir, 'data'), startDir];
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const stack = [candidate];
    while (stack.length) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.bson')) {
          return candidate;
        }
      }
    }
  }
  return null;
}

function buildStoreEnvelope(docs) {
  const updatedAt = docs.reduce((max, doc) => {
    if (doc.updatedAt && (!max || doc.updatedAt > max)) return doc.updatedAt;
    return max;
  }, null);

  return { updatedAt, count: docs.length, pages: docs };
}

async function connectDb() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  return { client, db };
}

async function dumpToZip() {
  const { client, db } = await connectDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const workDir = path.join(__dirname, '.backup-work', stamp);
  const dataDir = path.join(workDir, 'data');
  ensureDir(dataDir);

  try {
    for (const name of COLLECTIONS) {
      const docs = await db.collection(name).find({}, { projection: { _id: 0 } }).toArray();
      const filePath = path.join(dataDir, `${name}.json`);
      if (name === 'pages' || name === 'page-details' || name === 'crm') {
        writeJson(filePath, buildStoreEnvelope(docs));
      } else {
        writeJson(filePath, docs);
      }
    }

    const zip = new AdmZip();
    zip.addLocalFolder(dataDir, 'data');
    zip.writeZip(BACKUP_ZIP);

    console.log(`Backup created at ${path.relative(__dirname, BACKUP_ZIP)}`);
  } finally {
    await client.close();
  }
}

function buildRestoreArgs(sourcePath) {
  const args = ['--drop'];
  if (MONGODB_URI) {
    args.push('--uri', MONGODB_URI);
  } else {
    args.push('--db', DB_NAME);
  }
  if (DB_NAME) {
    args.push('--nsInclude', `${DB_NAME}.*`);
  }
  args.push(sourcePath);
  return args;
}

async function restoreFromBackup() {
  const sourcePath = fs.existsSync(BACKUP_ZIP) ? BACKUP_ZIP : BACKUP_DIR;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup source not found: ${sourcePath}`);
  }

  const { client, db } = await connectDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const restoreDir = path.join(__dirname, '.restore-work', stamp);
  ensureDir(restoreDir);

  try {
    const sourceIsZip = fs.lstatSync(sourcePath).isFile() && sourcePath.toLowerCase().endsWith('.zip');
    let restoreRoot = sourcePath;

    if (sourceIsZip) {
      const zip = new AdmZip(sourcePath);
      zip.extractAllTo(restoreDir, true);
      const dataDir = path.join(restoreDir, 'data');
      if (!fs.existsSync(dataDir)) {
        throw new Error(`Backup archive does not contain a data folder: ${sourcePath}`);
      }
      restoreRoot = findMongoDumpRoot(restoreDir) || restoreDir;
    }

    const mongoDumpRoot = findMongoDumpRoot(restoreRoot);
    if (mongoDumpRoot) {
      const mongorestore = process.platform === 'win32' ? 'mongorestore.exe' : 'mongorestore';
      await runCommand(mongorestore, buildRestoreArgs(mongoDumpRoot));
      console.log(`Mongo dump restored from ${path.relative(__dirname, sourcePath)}`);
      return;
    }

    const dataDir = path.join(restoreRoot, 'data');
    if (!fs.existsSync(dataDir)) {
      throw new Error(`Backup source does not contain a data folder: ${sourcePath}`);
    }

    for (const name of COLLECTIONS) {
      const filePath = path.join(dataDir, `${name}.json`);
      if (!fs.existsSync(filePath)) {
        console.log(`skip ${name}: no file`);
        continue;
      }

      const payload = readJson(filePath);
      const docs = Array.isArray(payload) ? payload : payload.pages || [];
      const coll = db.collection(name);

      await coll.deleteMany({});
      if (docs.length) {
        await coll.insertMany(docs);
      }

      if (name === 'pages' || name === 'page-details' || name === 'crm') {
        await coll.createIndex({ url: 1 }, { unique: true });
      } else if (name === 'tasks') {
        await coll.createIndex({ taskId: 1 }, { unique: true });
        await coll.createIndex({ createdAt: -1 });
      } else if (name === 'schemas') {
        await coll.createIndex({ schemaId: 1 }, { unique: true });
        await coll.createIndex({ slug: 1 }, { unique: true });
      } else if (name === 'skills') {
        await coll.createIndex({ skillId: 1 }, { unique: true });
        await coll.createIndex({ host: 1 });
      } else if (name === 'debug_items') {
        await coll.createIndex({ taskId: 1 });
      }

      console.log(`${name}: restored ${docs.length}`);
    }

    console.log(`Restore completed from ${path.relative(__dirname, sourcePath)}`);
  } finally {
    await client.close();
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'dump') {
    await dumpToZip();
    return;
  }

  if (command === 'restore') {
    await restoreFromBackup();
    return;
  }

  console.log('Usage: node backup.js <dump|restore>');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
