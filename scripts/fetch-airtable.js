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

// ── Couleurs par catégorie ────────────────────────────────────────────────────
// Modifiez ici pour ajuster les couleurs selon vos catégories Airtable
const CATEGORY_COLORS = {
  'GAMAM':  '#f76f4f',
  'SaaSEU': '#4f8ef7',
  'Autre':  '#8b7cf8',
};
const DEFAULT_COLOR = '#888780';

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

  // ── Machines ──────────────────────────────────────────────────────────────────
  const rawMachines = await fetchTable('Machines');
  const machines = rawMachines.map(r => ({
    id:    r.fields['id']          ?? r.id,
    name:  r.fields['name']        ?? '',
    emoji: r.fields['emoji']       ?? '💻',
    desc:  r.fields['description'] ?? '',
    color: '#555b70',
  }));
  console.log(`🖥️  ${machines.length} machines chargées :`, machines.map(m => m.id));

  // ── Services ──────────────────────────────────────────────────────────────────
  // Le champ "id (from terminals)" est un lookup Airtable qui retourne
  // directement les valeurs texte (pc, smartphone, smart TV) — pas des recordIds.
  // C'est une valeur tableau même pour un seul terminal.
  const rawServices = await fetchTable('Services');
  const services = rawServices.map(r => {
    const category = r.fields['category'] ?? '';
    const color    = CATEGORY_COLORS[category] ?? DEFAULT_COLOR;

    // Lecture du champ lookup "id (from terminals)"
    // Airtable retourne ce champ sous forme de tableau de strings
    const terminals = r.fields['id (from terminals)'] ?? [];

    return {
      id:          r.id,
      name:        r.fields['name']        ?? '',
      url:         r.fields['URL']         ?? '',
      category,
      description: r.fields['description'] ?? '',
      color,
      emoji:       r.fields['emoji']       ?? '🔗',
      terminals:   Array.isArray(terminals) ? terminals : [terminals],
    };
  });
  console.log(`🔗  ${services.length} services chargés`);

  // ── Relations ─────────────────────────────────────────────────────────────────
  const rawRelations = await fetchTable('Relations');
  const relations = rawRelations
    .map(r => ({
      source: r.fields['source']?.[0] ?? null,
      target: r.fields['target']?.[0] ?? null,
      type:   r.fields['type']        ?? 'depends',
    }))
    .filter(r => r.source && r.target);
  console.log(`↔️  ${relations.length} relations chargées`);

  // ── Écriture ──────────────────────────────────────────────────────────────────
  const out = { generatedAt: new Date().toISOString(), machines, services, relations };
  const outPath = path.join(__dirname, '..', 'public', 'data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`✅  data.json écrit : ${machines.length} machines, ${services.length} services, ${relations.length} relations.`);
}

main().catch(err => { console.error(err); process.exit(1); });
