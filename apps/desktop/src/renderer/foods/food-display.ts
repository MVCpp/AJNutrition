/**
 * Pure display helpers for the foods list (extracted for unit testing):
 * category chip coloring. Pagination lives in ../ui/paginate, shared with
 * the patients list.
 */

// Category chips get a stable, meaningful color: keyword rules for the
// common groups (matching the bundled catalog's Spanish categories plus
// likely user-typed ones), then a deterministic fallback so any custom
// category keeps one color across renders.
const CATEGORY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/restaurante/, 'bg-indigo-100 text-indigo-800'],
  [/verdura|vegetal|hortaliza/, 'bg-emerald-100 text-emerald-800'],
  [/fruta|jugo/, 'bg-orange-100 text-orange-800'],
  [/cereal|pasta|panificado|\bpan\b|tortilla|arroz|avena|grano/, 'bg-amber-100 text-amber-800'],
  [/lacteo|leche|queso|yogur|huevo/, 'bg-sky-100 text-sky-800'],
  [/leguminosa|frijol|lenteja|garbanzo|soya/, 'bg-lime-100 text-lime-800'],
  [/nuez|nueces|semilla|almendra|cacahuate/, 'bg-yellow-100 text-yellow-800'],
  [/pescado|marisco|atun|camaron|salmon/, 'bg-cyan-100 text-cyan-800'],
  [/carne|\bres\b|cerdo|cordero|caza|embutido|\baves?\b|pollo|pavo/, 'bg-rose-100 text-rose-800'],
  [/grasa|aceite|manteca|mantequilla/, 'bg-amber-100 text-amber-900'],
  [/especia|hierba|condimento/, 'bg-teal-100 text-teal-800'],
  [/sopa|salsa|caldo|aderezo/, 'bg-fuchsia-100 text-fuchsia-800'],
  [/bebida|refresco|cafe|\bte\b/, 'bg-violet-100 text-violet-800'],
  [/dulce|azucar|postre|miel|chocolate/, 'bg-pink-100 text-pink-800'],
];

const CATEGORY_FALLBACKS = [
  'bg-slate-100 text-slate-600',
  'bg-stone-100 text-stone-600',
  'bg-purple-100 text-purple-800',
  'bg-blue-100 text-blue-800',
];

export function categoryChipClass(category: string): string {
  const normalized = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  for (const [pattern, className] of CATEGORY_RULES) {
    if (pattern.test(normalized)) return className;
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return (
    CATEGORY_FALLBACKS[Math.abs(hash) % CATEGORY_FALLBACKS.length] ?? 'bg-slate-100 text-slate-600'
  );
}
