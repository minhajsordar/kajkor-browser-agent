// CRM message templates + business config.
// EDIT the BUSINESS object below once with your real details — every template
// pulls from it. Templates are also editable per-message in the CRM UI.

const BUSINESS = {
  name: 'Ecomify.Cloud',
  senderName: 'Minhaj Sordar',
  website: 'https://ecomify.cloud',
  phone: '+8801835158205',
  // one-liners used inside the proposal
  saasPitch: 'a ready-to-launch online store (SaaS) — no tech hassle, monthly plan',
  selfHostPitch: 'or self-hosted ecommerce software you fully own and control',
  region: 'Bangladesh'
};

// Available template keys, in pipeline order.
const TEMPLATE_ORDER = ['welcome', 'proposal', 'followup', 'closing'];

// Each template: { label, stage (status it advances to), subject (email), body }.
// Placeholders: {{name}} {{firstName}} {{category}} {{businessName}}
// {{senderName}} {{website}} {{phone}} {{saasPitch}} {{selfHostPitch}} {{region}}
const TEMPLATES = {
  welcome: {
    label: 'Welcome / Intro',
    stage: 'welcomed',
    subject: 'Helping {{name}} sell more online',
    body:
`Hi {{name}} team,

I came across {{name}} on Facebook — love what you're doing in {{category}}. I'm {{senderName}} from {{businessName}}.

We help online businesses like yours move from manual Facebook orders to a proper ecommerce store — with order, inventory, delivery and payment management built for {{region}}.

Would you be open to a quick chat this week?

{{senderName}}
{{website}}`
  },

  proposal: {
    label: 'Proposal',
    stage: 'proposed',
    subject: 'A proposal for {{name}}',
    body:
`Hi {{name}} team,

Following up with how {{businessName}} can help {{name}} grow:

• {{saasPitch}}
• {{selfHostPitch}}
• Order, inventory, delivery & payment integrations built for {{region}}

Many shops like yours cut order-loss significantly after moving off manual FB order-taking. Can I send you a short demo?

{{senderName}}
{{businessName}} — {{website}}
{{phone}}`
  },

  followup: {
    label: 'Follow-up',
    stage: 'followup',
    subject: 'Re: {{name}} online store',
    body:
`Hi {{name}} team,

Just checking if you saw my message about setting up an online store for {{name}}. Happy to give you a free walkthrough this week — what time works for you?

{{senderName}}
{{businessName}}`
  },

  closing: {
    label: 'Closing',
    stage: '', // closing doesn't auto-set won/lost; you decide the outcome
    subject: 'Ready when you are, {{name}}',
    body:
`Hi {{name}} team,

I'll keep this short — we can get {{name}} live on a full ecommerce store within a few days. If you're interested, just reply "YES" and I'll set up your demo account today.

If now isn't the right time, no worries — I'll check back later.

{{senderName}}
{{businessName}} — {{website}}`
  }
};

// Render a template string against a lead + BUSINESS config.
function renderTemplate(str, lead) {
  const firstName = (lead.name || '').trim().split(/\s+/)[0] || 'there';
  const map = {
    name: lead.name || 'your page',
    firstName,
    category: lead.category || 'your business',
    businessName: BUSINESS.name,
    senderName: BUSINESS.senderName,
    website: BUSINESS.website,
    phone: BUSINESS.phone,
    saasPitch: BUSINESS.saasPitch,
    selfHostPitch: BUSINESS.selfHostPitch,
    region: BUSINESS.region
  };
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : `{{${k}}}`));
}

function renderMessage(key, lead) {
  const t = TEMPLATES[key];
  if (!t) return { subject: '', body: '' };
  return {
    subject: renderTemplate(t.subject, lead),
    body: renderTemplate(t.body, lead),
    stage: t.stage
  };
}
