// Sincronización entre dispositivos (y lista de la compra compartida) con Supabase.
// Cada «espacio» se identifica por un código secreto largo: quien lo conoce puede leerlo y escribirlo.
import { db, update, subscribe, exportJSON, importJSON } from './store.js';
import { mergeShopping } from './modules/shopping.js';

export const SETUP_SQL = `create table if not exists midia_spaces (
  code text primary key check (length(code) >= 24),
  data jsonb not null,
  updated_at bigint not null
);
alter table midia_spaces enable row level security;
-- Sin políticas: la tabla no se puede leer directamente, solo con las funciones y el código secreto.

create or replace function midia_get(p_code text)
returns table(data jsonb, updated_at bigint)
language sql security definer set search_path = public as $$
  select data, updated_at from midia_spaces where code = p_code;
$$;

create or replace function midia_put(p_code text, p_data jsonb, p_updated bigint)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if length(p_code) < 24 then raise exception 'codigo no valido'; end if;
  insert into midia_spaces(code, data, updated_at) values (p_code, p_data, p_updated)
  on conflict (code) do update set data = excluded.data, updated_at = excluded.updated_at
    where midia_spaces.updated_at <= excluded.updated_at;
  return (select s.updated_at from midia_spaces s where s.code = p_code);
end $$;

grant execute on function midia_get(text) to anon;
grant execute on function midia_put(text, jsonb, bigint) to anon;`;

export const newCode = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => abc[b % abc.length]).join('');
};

export const configured = () => !!(db().settings.syncUrl && db().settings.syncKey);

async function rpc(fn, body) {
  const { syncUrl, syncKey } = db().settings;
  const res = await fetch(`${syncUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    // Las claves antiguas (JWT «eyJ…») van también como Bearer; las nuevas «sb_publishable_…» solo en apikey
    headers: { apikey: syncKey, ...(syncKey.startsWith('eyJ') ? { Authorization: `Bearer ${syncKey}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(res.status === 404 ? 'Falta crear las funciones en Supabase (ejecuta el SQL de Ajustes)' : `Supabase respondió ${res.status} ${txt.slice(0, 120)}`);
  }
  return res.json();
}
const getSpace = async (code) => (await rpc('midia_get', { p_code: code }))[0] || null;
const putSpace = (code, data, updated) => rpc('midia_put', { p_code: code, p_data: data, p_updated: updated });

let running = false;
let lastError = '';
export const syncError = () => lastError;

async function syncPersonal(retry = true) {
  const s = db().settings;
  if (!s.syncCode) return;
  const remote = await getSpace(s.syncCode);
  const local = db().modifiedAt || 0;
  const pulled = s.syncPulledAt || 0;
  if (remote && remote.updated_at > pulled && (local <= pulled || remote.updated_at >= local)) {
    // Hay una versión más nueva en otro dispositivo: traerla
    importJSON(remote.data, { fromSync: true });
    update((d) => { d.modifiedAt = remote.updated_at; d.settings.syncPulledAt = remote.updated_at; }, { fromSync: true });
    window.dispatchEvent(new Event('midia:synced'));
  } else if (local > pulled || !remote) {
    const sent = local || Date.now();
    const stored = await putSpace(s.syncCode, JSON.parse(exportJSON()), sent);
    // Si el servidor tenía algo más nuevo, no se ha sobrescrito: traerlo
    if (stored !== sent) return retry && syncPersonal(false);
    update((d) => (d.settings.syncPulledAt = stored), { fromSync: true });
  }
}

let lastSharedJson = '';
async function syncSharedList() {
  const code = db().settings.shareCode;
  if (!code) return;
  const remote = await getSpace(code);
  if (remote && mergeShopping(remote.data)) window.dispatchEvent(new Event('midia:synced'));
  const mine = { items: db().shopping, deleted: db().shoppingDeleted };
  const json = JSON.stringify(mine);
  if (!remote || json !== JSON.stringify({ items: remote.data.items, deleted: remote.data.deleted })) {
    // Ya está mezclada producto a producto: escribir siempre por encima (aunque el reloj del otro móvil vaya adelantado)
    if (json !== lastSharedJson || !remote) await putSpace(code, mine, Math.max(Date.now(), (remote?.updated_at || 0) + 1));
  }
  lastSharedJson = json;
}

export async function syncNow() {
  if (!configured() || running || !navigator.onLine) return;
  running = true;
  try {
    await syncPersonal();
    await syncSharedList();
    lastError = '';
  } catch (e) {
    lastError = e.message;
    throw e;
  } finally {
    running = false;
  }
}

let timer = null;
export function initSync() {
  const run = () => syncNow().catch((e) => console.warn('Sincronización:', e.message));
  run();
  // Tras un cambio local, sincronizar a los 2,5 s
  let lastSeen = db().modifiedAt;
  subscribe((d) => {
    if (!configured() || d.modifiedAt === lastSeen) return;
    lastSeen = d.modifiedAt;
    clearTimeout(timer);
    timer = setTimeout(run, 2500);
  });
  // Mientras la app está abierta, comprobar cambios de los demás cada 20 s
  setInterval(() => document.visibilityState === 'visible' && run(), 20_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
  window.addEventListener('online', run);
}
