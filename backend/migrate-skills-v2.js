// One-time migration: legacy skills -> introduced elements + v2 element refs.
// (docs/skill-redesign-plan.md, phase 1)
//
//   node backend/migrate-skills-v2.js          # dry run (prints what it would do)
//   node backend/migrate-skills-v2.js --apply  # write changes
//
// For each legacy skill (no `elements` refs yet):
//   collection: item selector -> an 'item' element; each field -> a 'field' /
//               'action' element with parentId = the item element.
//   action:     one 'action' element.
// The skill doc gets `elements` refs; its legacy selectors/item/fields are KEPT
// untouched for rollback (the resolver prefers `elements` when present).
// Re-running is safe: skills that already have refs are skipped.

const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://minhaj:m1nh8j@mdb.softrking.com:27017/browser_agent?authSource=admin&directConnection=true';
const DB_NAME = process.env.MONGODB_DB || 'browser_agent';
const APPLY = process.argv.includes('--apply');

const nowIso = () => new Date().toISOString();
const snakeName = (n) => String(n || '').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'element';

// urlPattern ('facebook.com/*') -> route ('/*'), host prefix stripped.
function routeFromUrlPattern(pattern, host) {
  let p = String(pattern || '').trim().replace(/^https?:\/\//, '');
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  const low = p.toLowerCase();
  for (const pre of [h, 'www.' + h]) {
    if (low === pre || low === pre + '/*') return '/*';
    if (low.startsWith(pre + '/')) { p = p.slice(low.startsWith('www.') ? pre.length + 4 : pre.length); break; }
  }
  if (!p) return '/*';
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const skillsColl = db.collection('skills');
  const elementsColl = db.collection('elements');

  const taken = new Set((await elementsColl.find({}, { projection: { host: 1, name: 1 } }).toArray())
    .map((e) => e.host + '|' + e.name));
  const unique = (host, wanted) => {
    const base = snakeName(wanted);
    let name = base, i = 2;
    while (taken.has(host + '|' + name)) name = `${base}_${i++}`;
    taken.add(host + '|' + name);
    return name;
  };

  const legacy = await skillsColl.find({ $or: [{ elements: null }, { elements: { $exists: false } }, { elements: { $size: 0 } }] }).toArray();
  console.log(`${legacy.length} legacy skill(s) to migrate${APPLY ? '' : ' (DRY RUN — pass --apply to write)'}\n`);

  let madeElements = 0, updatedSkills = 0;
  for (const s of legacy) {
    if (s.kind !== 'collection' && s.kind !== 'action') { console.log(`- skip "${s.name}" (kind ${s.kind})`); continue; }
    const host = String(s.host || '').replace(/^www\./, '');
    const route = routeFromUrlPattern(s.urlPattern, host);
    const newEls = [];
    const refs = [];

    if (s.kind === 'collection') {
      const itemEl = {
        elementId: crypto.randomUUID(), host, route,
        name: unique(host, s.name + '_item'),
        details: `Repeating item of skill "${s.name}"`,
        type: 'item', action: null, attr: null, parentId: null,
        selectors: (s.item && s.item.selectors) || [],
        sample: s.sample || null, sampleHtml: s.sampleHtml || null,
        version: 1, createdAt: nowIso(), updatedAt: nowIso(),
      };
      newEls.push(itemEl); refs.push({ elementId: itemEl.elementId, order: 0 });
      (s.fields || []).forEach((f, i) => {
        const el = {
          elementId: crypto.randomUUID(), host, route,
          name: unique(host, f.name),
          details: `Field "${f.name}" of skill "${s.name}"`,
          type: f.attr === 'click' ? 'action' : 'field',
          action: f.attr === 'click' ? 'click' : null,
          attr: f.attr === 'click' ? null : (f.attr || 'text'),
          parentId: itemEl.elementId,
          selectors: f.selectors || [],
          sample: null, sampleHtml: null,
          version: 1, createdAt: nowIso(), updatedAt: nowIso(),
        };
        newEls.push(el); refs.push({ elementId: el.elementId, order: i + 1 });
      });
    } else {
      const el = {
        elementId: crypto.randomUUID(), host, route,
        name: unique(host, s.name),
        details: `Target of action skill "${s.name}" (${s.action || 'click'})`,
        type: 'action', action: s.action || 'click', attr: null, parentId: null,
        selectors: s.selectors || [],
        sample: s.sample || null, sampleHtml: s.sampleHtml || null,
        version: 1, createdAt: nowIso(), updatedAt: nowIso(),
      };
      newEls.push(el); refs.push({ elementId: el.elementId, order: 0 });
    }

    console.log(`- "${s.name}" (${s.kind}) [${host}${route}] -> ${newEls.length} element(s): ${newEls.map((e) => e.name).join(', ')}`);
    if (APPLY) {
      if (newEls.length) await elementsColl.insertMany(newEls);
      await skillsColl.updateOne({ skillId: s.skillId }, { $set: { elements: refs, details: s.details || '', updatedAt: nowIso() } });
    }
    madeElements += newEls.length; updatedSkills++;
  }

  console.log(`\n${APPLY ? 'Done' : 'Would do'}: ${madeElements} element(s), ${updatedSkills} skill(s) updated.`);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
