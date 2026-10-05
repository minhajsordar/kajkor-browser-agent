# banner-designer

Standalone AI banner-design agent + Canva-like visual editor. The kajkor
browser agent calls it as a sub-agent to produce banner designs; a human
designer then refines them in the editor.

## Run

```bash
npm install --legacy-peer-deps
# .env needs MONGO_URI (shared Mongo, db `banner_designer`)
npm run dev        # http://localhost:5456
```

## For the kajkor agent

```http
POST http://localhost:5456/api/agent/design
{ "instruction": "summer sale banner, dark gradient, orange CTA",
  "width": 1200, "height": 628 }
```

Returns `{ bannerId, builderData, editorUrl, previewUrl, model, warnings }`.
Open `previewUrl` (`/?iframe=true&bannerId=…`) in a tab to screenshot the
design. Pass `bannerId` to revise an existing banner.

## For designers

Open `http://localhost:5456/?bannerId=<id>` — drag/resize elements on the
canvas, edit styles in the right panel, insert text/image/button/container
blocks, upload assets, generate or revise with AI, export PNG/JPG, save
drafts, publish, restore versions.

See `AGENTS.md` for architecture and gotchas.
