// One-off migration: import the legacy data/*.json stores into MongoDB.
// Safe to re-run — upserts by url. Run: node migrate.js

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB || 'browser_agent';
const DATA_DIR = path.join(__dirname, 'data');

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  for (const name of ['pages', 'page-details', 'crm']) {
    const file = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(file)) { console.log(`skip ${name}: no file`); continue; }
    const store = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pages = store.pages || [];
    const coll = db.collection(name);
    await coll.createIndex({ url: 1 }, { unique: true });
    let n = 0;
    for (const p of pages) {
      if (!p || !p.url) continue;
      await coll.updateOne({ url: p.url }, { $set: p }, { upsert: true });
      n++;
    }
    console.log(`${name}: imported ${n}`);
  }

  await client.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
