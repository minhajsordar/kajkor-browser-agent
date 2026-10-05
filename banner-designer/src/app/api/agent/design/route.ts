import connectDB from '@/config/db';
import Banner from '@/models/bannerModel';
import BannerDraft from '@/models/bannerDraftModel';
import { normalizeBanner } from '@/utils/normalizeBanner';
import { BANNER_PRESETS } from '@/utils/bannerContent';
import { NextRequest } from 'next/server';
import http from 'http';
import https from 'https';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Same cap as POST /api/banner-drafts — this route creates drafts directly.
const MAX_DRAFTS_PER_BANNER = 20;

const SYSTEM_PROMPT = `You are a banner design agent. You output ONLY a JSON element tree — no markdown, no commentary.

Output shape:
{
  "styles": { "<css-prop>": "<value>" },
  "children": [
    {
      "tag": "h1",
      "text": "SUMMER SALE",
      "styles": { "position": "absolute", "left": "60px", "top": "70px", "font-size": "72px", "font-weight": "700", "color": "#ffffff" }
    },
    {
      "tag": "img",
      "attributes": { "src": "https://picsum.photos/seed/sale/1200/628", "alt": "background" },
      "styles": { "position": "absolute", "left": "0px", "top": "0px", "width": "1200px", "height": "628px", "object-fit": "cover" }
    }
  ]
}

Rules:
- The root object is the canvas; its "styles" are the banner background (color, gradient, or leave it to a full-bleed img child).
- "children" holds the design elements. Use "children" inside an element for grouped/nested content.
- Allowed tags: div, section, p, span, h1-h6, img, button, a, strong, em, ul, ol, li.
- EVERY element's styles MUST include "position": "absolute" plus numeric "left"/"top" in px. Give every element an explicit "width"/"height" where sensible.
- Keep all elements fully inside the canvas bounds.
- Compose real designs: a background, a headline, a subheading or paragraph, and a CTA (tag "button" with background-color, color, border-radius, padding).
- For images use "attributes": {"src": "<url>", "alt": "..."}; prefer https://picsum.photos/seed/<word>/<w>/<h> for placeholders.
- Fonts: system stacks only (e.g. "font-family": "Arial, sans-serif").
- Return ONLY the JSON object.`;

// Ollama exposes no capability flag — match known multimodal families.
// gemma3 needs a size guard: :1b and :270m are text-only (gemma3n:e2b/e4b
// are all multimodal, so only the explicit text sizes are excluded).
const isVisionModel = (name: string) => {
  if (/gemma3/i.test(name)) return !/:(1b|270m)/i.test(name);
  return /vl|vision|llava|pixtral|llama4|bakllava|moondream|minicpm-v|mistral-small3|glm-?4v/i.test(name);
};

async function pickModel(requested: string | undefined, needsVision = false): Promise<string | null> {
  if (needsVision) {
    // A text-only model is useless for image analysis — only honor
    // explicit choices that are actually vision-capable.
    if (requested && isVisionModel(requested)) return requested;
    if (process.env.OLLAMA_MODEL && isVisionModel(process.env.OLLAMA_MODEL)) {
      return process.env.OLLAMA_MODEL;
    }
  } else {
    if (requested) return requested;
    if (process.env.OLLAMA_MODEL) return process.env.OLLAMA_MODEL;
  }
  try {
    // no-store: Next route handlers can cache GET fetches — the installed
    // model list must be live (a freshly pulled vision model must be found).
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { cache: 'no-store' });
    const data = await res.json();
    const models: string[] = (data?.models || []).map((m: any) => String(m.name));
    // With images attached, a vision model is required — prefer the
    // SMALLEST one (faster: qwen2.5vl:3b over :7b).
    if (needsVision) {
      const vision = models.filter(isVisionModel).sort((a, b) => {
        const sa = a.match(/(\d+)b/i), sb = b.match(/(\d+)b/i);
        return (sa ? Number(sa[1]) : 99) - (sb ? Number(sb[1]) : 99);
      });
      // Never fall through to a text model — it cannot see the images.
      return vision[0] || null;
    }
    // Prefer 7b+ instruct models (better structured output), then coder,
    // then anything else installed.
    const score = (name: string) => {
      let s = 0;
      if (/instruct|chat/i.test(name)) s += 4;
      if (/coder/i.test(name)) s += 2;
      const size = name.match(/(\d+)b/i);
      if (size) s += Math.min(Number(size[1]), 14) / 10;
      return s;
    };
    return models.sort((a, b) => score(b) - score(a))[0] || null;
  } catch {
    return null;
  }
}

/** Counts unclosed { [ outside strings and returns the closers needed. */
function missingClosers(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  // The salvage cut can land inside a string literal — close it first or
  // the appended brackets land inside the string and JSON still won't parse.
  return (inStr ? '"' : '') + stack.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1) throw new Error('model returned no JSON object');

  const stripCommas = (x: string) => x.replace(/,\s*([}\]])/g, '$1');
  // Two candidate slices. `full` keeps everything after the first '{' — the
  // last '}' may sit mid-structure on truncated output, so bounding on it
  // would silently drop salvageable elements. `bounded` handles the other
  // shape: a complete JSON object followed by prose.
  const full = stripCommas(cleaned.slice(start));
  const bounded = end > start ? stripCommas(cleaned.slice(start, end + 1)) : null;
  const candidates = bounded && bounded !== full ? [full, bounded] : [full];

  const repair = (s: string): any => {
    try {
      return JSON.parse(s);
    } catch { /* needs repair */ }
    // Truncation often ends right after a complete pair — re-closing the
    // open brackets alone may fix it, and loses nothing. Cut only if not.
    try {
      return JSON.parse(s + missingClosers(s));
    } catch { /* needs trimming */ }
    // Small models truncate mid-structure — progressively drop the tail
    // from the last separator and re-close the brackets that are still open.
    for (let i = 0; i < 30; i++) {
      const cut = Math.max(s.lastIndexOf(','), s.lastIndexOf('",'), s.lastIndexOf('{'), s.lastIndexOf('['));
      if (cut <= 0) break;
      s = s.slice(0, cut) + missingClosers(s.slice(0, cut));
      try {
        return JSON.parse(s);
      } catch { /* keep trimming */ }
    }
    throw new Error('unrecoverable');
  };

  // Try exact-parse on each candidate first (prefers `full` — it preserves
  // the most model output), then fall back to repairs in the same order.
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch { /* try next */ }
  }
  for (const c of candidates) {
    try {
      return repair(c);
    } catch { /* try next */ }
  }
  throw new Error('model returned no JSON object');
}

/**
 * POST JSON via node's http module. fetch() (undici) has a ~300s
 * headersTimeout we cannot raise — local vision models routinely exceed
 * that, killing the socket mid-generation ("fetch failed" after ~5 min).
 */
function postJson(url: string, payload: any, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const data = JSON.stringify(payload);
    const req = (target.protocol === 'https:' ? https : http).request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res: any) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
      // A mid-response socket failure errors the res, not always the req —
      // without this the promise never settles and the route hangs forever.
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => {
      const err: any = new Error(`request timed out after ${timeoutMs / 1000}s`);
      err.name = 'TimeoutError';
      req.destroy(err);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  // Reference images for the vision model — data URLs or raw base64.
  const images: string[] = Array.isArray(body?.images)
    ? body.images
        .filter((i: any) => typeof i === 'string' && i.length)
        .slice(0, 4)
        // Strip any data-URL envelope ("data:", mediatype + params, ";base64,").
        // [^;]+ missed "data:;base64," and "data:image/png;charset=x;base64,"
        // — those went to Ollama still wrapped and failed decoding.
        .map((i: string) => i.replace(/^data:[^,]*;base64,/i, ''))
    : [];
  let instruction = String(body?.instruction || '').trim();
  if (!instruction && images.length) {
    instruction = 'Recreate the attached banner design as editable elements.';
  }
  if (!instruction) {
    return Response.json({ msg: 'instruction is required' }, { status: 400 });
  }

  // Resolve target banner + canvas size.
  let banner: any = null;
  let currentData: any = null;
  if (body?.bannerId) {
    // findById throws a CastError on malformed ids — turn it into a clean 404.
    if (!/^[0-9a-fA-F]{24}$/.test(String(body.bannerId))) {
      return Response.json({ msg: 'Banner not found' }, { status: 404 });
    }
    banner = await Banner.findById(String(body.bannerId)).lean();
    if (!banner) {
      return Response.json({ msg: 'Banner not found' }, { status: 404 });
    }
    currentData = (await BannerDraft.findOne({ bannerId: banner._id })
      .sort({ createdAt: -1 })
      .lean() as any)?.builderData;
  }

  const preset = BANNER_PRESETS[String(body?.preset || '')];
  const width = Number(body?.width) || preset?.width || banner?.width || 1200;
  const height = Number(body?.height) || preset?.height || banner?.height || 628;

  const requestedModel = typeof body?.model === 'string' ? body.model : undefined;
  const modelsUsed: string[] = [];

  // Stage 1 — with images attached, a VISION model describes the reference
  // (its strength: short reliable text). The design model then writes JSON
  // from that description — a small vision model asked for a full JSON tree
  // either truncates it or takes 10+ minutes.
  const warnings: string[] = [];
  let referenceDescription: string | null = null;
  if (images.length) {
    const visionModel = await pickModel(requestedModel, true);
    if (!visionModel) {
      return Response.json(
        { msg: 'No vision model installed — pull one first (e.g. ollama pull qwen2.5vl:3b).' },
        { status: 502 }
      );
    }
    try {
      const res = await postJson(`${OLLAMA_URL}/api/chat`, {
        model: visionModel,
        stream: false,
        messages: [{
          role: 'user',
          content: `Analyze the attached banner design reference${images.length > 1 ? 's' : ''} and describe the design precisely so it can be recreated with simple shapes and text: layout regions (what is left/right/center, how the space splits), background colors or gradient, EVERY text string verbatim with its approximate position/size/weight/color, the CTA button style, and decorative shapes as simple forms (rounded rect, circle, stripe). Under 250 words.`,
          images,
        }],
        options: { temperature: 0.2, num_predict: 1200 },
      }, 360_000);
      if (res.status < 200 || res.status >= 300) {
        return Response.json(
          { msg: `Vision model error ${res.status}: ${res.body.slice(0, 300)}` },
          { status: 502 }
        );
      }
      referenceDescription = String(JSON.parse(res.body)?.message?.content || '').trim() || null;
      modelsUsed.push(visionModel);
      // An empty description means stage 2 generates blind — tell the user
      // the reference was ignored rather than silently hallucinating it.
      if (!referenceDescription) {
        warnings.push('vision model returned no description — generated from the instruction alone');
      }
    } catch (error: any) {
      return Response.json(
        { msg: `Vision analysis failed: ${error?.name === 'TimeoutError' ? 'timed out' : error?.message || error}` },
        { status: 502 }
      );
    }
  }

  // Stage 2 — text model writes the builder JSON (proven reliable).
  const model = requestedModel || await pickModel(undefined, false);
  if (!model) {
    return Response.json(
      { msg: `No Ollama model available at ${OLLAMA_URL}. Pull one first (e.g. ollama pull llama3.1).` },
      { status: 502 }
    );
  }
  modelsUsed.push(model);

  const userPrompt = [
    `Canvas size: ${width}x${height}px.`,
    referenceDescription
      ? `Reference banner description (from image analysis):\n${referenceDescription}\n\nRecreate this design as builder JSON: text elements with the extracted strings, simple shapes for decorative art, placeholder img elements for photos/mockups (https://picsum.photos/seed/<word>/<w>/<h>).`
      : '',
    currentData
      ? `Revise this existing banner design per the instruction. Keep valid uids and structure.\nCurrent design JSON:\n${JSON.stringify(currentData)}\nInstruction: ${instruction}`
      : `Design a banner per this instruction: ${instruction}`,
  ].filter(Boolean).join('\n\n');

  let rawText: string;
  try {
    const res = await postJson(`${OLLAMA_URL}/api/chat`, {
      model,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      options: { temperature: 0.4, num_predict: 8192 },
    }, 600_000);
    if (res.status < 200 || res.status >= 300) {
      return Response.json(
        { msg: `Ollama error ${res.status}: ${res.body.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const data = JSON.parse(res.body);
    rawText = String(data?.message?.content || '');
  } catch (error: any) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return Response.json(
      { msg: timedOut
          ? 'Generation timed out after 10 minutes — the local model is too slow for this request.'
          : `Ollama not reachable at ${OLLAMA_URL}: ${error?.message || error}` },
      { status: 502 }
    );
  }

  let parsed: any;
  try {
    parsed = extractJson(rawText);
  } catch (error: any) {
    return Response.json(
      { msg: `Model returned invalid JSON: ${error?.message || error}`, raw: rawText.slice(0, 2000) },
      { status: 502 }
    );
  }

  const { builderData, warnings: repairWarnings } = normalizeBanner(parsed, { width, height });
  warnings.push(...repairWarnings);

  // A design with no elements on the canvas is a model failure — surface it
  // instead of wiping the artboard with an empty result.
  const bodyChildren = builderData?.body?.child || [];
  if (bodyChildren.length === 0) {
    return Response.json(
      { msg: 'Model produced an empty design (no elements). Try again or use a smaller/simpler instruction.', warnings, raw: rawText.slice(0, 1500) },
      { status: 502 }
    );
  }

  if (!banner) {
    const name = String(body?.name || instruction.slice(0, 60) || 'Untitled banner');
    banner = await Banner.create({ name, width, height });
  } else if (width !== banner.width || height !== banner.height) {
    await Banner.findByIdAndUpdate(banner._id, { width, height });
  }
  const count = await BannerDraft.countDocuments({ bannerId: banner._id });
  const draft = await BannerDraft.create({
    bannerId: banner._id,
    version: count + 1,
    builderData,
  });

  // Cap stored drafts (same rule as POST /api/banner-drafts) — every AI run
  // creates one, so without pruning they accumulate forever.
  const stale = await BannerDraft.find({ bannerId: banner._id })
    .sort({ createdAt: -1 })
    .skip(MAX_DRAFTS_PER_BANNER)
    .select('_id')
    .lean();
  if (stale.length) {
    await BannerDraft.deleteMany({ _id: { $in: stale.map((d: any) => d._id) } });
  }

  return Response.json({
    bannerId: banner._id,
    draftId: draft._id,
    builderData,
    warnings,
    model: modelsUsed.join(' + '),
    referenceDescription,
    editorUrl: `/?bannerId=${banner._id}`,
    previewUrl: `/?iframe=true&bannerId=${banner._id}`,
  });
}
