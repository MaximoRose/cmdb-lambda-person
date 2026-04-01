// scripts/fetch-airtable.js
// Nécessite Node.js 18+ (fetch natif)
// Exécuté uniquement côté serveur (GitHub Actions) — le token n'est jamais exposé

const TOKEN   = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const fs      = require('fs');
const path    = require('path');

if (!TOKEN || !BASE_ID) {
  console.error('❌  AIRTABLE_TOKEN ou AIRTABLE_BASE_ID manquant.');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

async function fetchTable(tableName) {
  const records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`);
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable ${tableName}: ${res.status} ${err}`);
    }

    const json = await res.json();
    records.push(...json.records);
    offset = json.offset ?? null;
  } while (offset);

  return records;
}

async function main() {
  console.log('📡  Récupération des données Airtable…');

  // ── Services ────────────────────────────────────────────────────────────────
  // Champs attendus dans la table "Services" :
  //   name (text), url (url), category (single select),
  //   description (long text), color (text, ex: #f76f4f),
  //   emoji (text), terminals (multiple select: pc | smartphone | tv)
  const rawServices = await fetchTable('Services');
  const services = rawServices.map(r => ({
    id:          r.id,
    name:        r.fields['name']        ?? '',
    url:         r.fields['url']         ?? '',
    category:    r.fields['category']    ?? '',
    description: r.fields['description'] ?? '',
    color:       r.fields['color']       ?? '#888',
    emoji:       r.fields['emoji']       ?? '🔗',
    terminals:   r.fields['terminals']   ?? [],
  }));

  // ── Relations ────────────────────────────────────────────────────────────────
  // Champs attendus dans la table "Relations" :
  //   source (link to Services → 1 enregistrement),
  //   target (link to Services → 1 enregistrement),
  //   type   (single select: auth | sync | depends)
  const rawRelations = await fetchTable('Relations');
  const relations = rawRelations
    .map(r => ({
      source: r.fields['source']?.[0] ?? null,
      target: r.fields['target']?.[0] ?? null,
      type:   r.fields['type']        ?? 'depends',
    }))
    .filter(r => r.source && r.target);

  // ── Machines ─────────────────────────────────────────────────────────────────
  // Champs attendus dans la table "Machines" :
  //   id (text: pc | smartphone | tv), name (text),
  //   emoji (text), description (long text)
  const rawMachines = await fetchTable('Machines');
  const machines = rawMachines.map(r => ({
    id:    r.fields['id']          ?? r.id,
    name:  r.fields['name']        ?? '',
    emoji: r.fields['emoji']       ?? '💻',
    desc:  r.fields['description'] ?? '',
    color: '#555b70',
  }));

  // ── Écriture ─────────────────────────────────────────────────────────────────
  const out = { generatedAt: new Date().toISOString(), machines, services, relations };
  const outPath = path.join(__dirname, '..', 'public', 'data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log(`✅  data.json écrit : ${machines.length} machines, ${services.length} services, ${relations.length} relations.`);
}

main().catch(err => { console.error(err); process.exit(1); });
