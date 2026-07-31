import type { Customer, Device, Event, Licence, Store } from './db.ts';

/**
 * The console, rendered on the server as plain HTML.
 *
 * No build step, no framework, no client JavaScript. This is a handful of
 * tables and some POST buttons for one operator; a single-page app would be
 * more moving parts than the thing it displays.
 */

/** Everything interpolated into HTML goes through this. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STYLE = `
:root { color-scheme: light dark; --bg:#f8fafc; --fg:#0f172a; --mut:#64748b; --line:#e2e8f0; --card:#fff; --accent:#047857; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0b1220; --fg:#e2e8f0; --mut:#94a3b8; --line:#1e293b; --card:#111a2e; --accent:#10b981; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
header { background:var(--card); border-bottom:1px solid var(--line); padding:14px 24px; display:flex; gap:20px; align-items:center; flex-wrap:wrap; }
header b { font-size:16px; }
header a { color:var(--fg); text-decoration:none; font-size:14px; }
header a:hover { text-decoration:underline; }
main { max-width:1100px; margin:0 auto; padding:24px; }
h1 { font-size:20px; margin:0 0 16px; }
h2 { font-size:15px; margin:28px 0 10px; color:var(--mut); text-transform:uppercase; letter-spacing:.04em; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:18px; margin-bottom:18px; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--mut); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
tr:last-child td { border-bottom:none; }
code,.mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
.pill { display:inline-block; border-radius:999px; padding:2px 10px; font-size:12px; font-weight:600; }
.ok { background:#d1fae5; color:#065f46; } .warn { background:#fef3c7; color:#92400e; } .bad { background:#fee2e2; color:#991b1b; }
input,select,textarea { font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:7px; background:var(--bg); color:var(--fg); width:100%; }
label { display:block; font-size:13px; color:var(--mut); margin:10px 0 4px; }
button { font:inherit; font-weight:600; padding:8px 14px; border-radius:7px; border:1px solid var(--line); background:var(--card); color:var(--fg); cursor:pointer; }
button.primary { background:var(--accent); color:#fff; border-color:transparent; }
button.danger { color:#b91c1c; }
.row { display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
.muted { color:var(--mut); font-size:13px; }
.overflow { overflow-x:auto; }
form.inline { display:inline; }
.tokenbox { width:100%; font-family:ui-monospace,monospace; font-size:11px; word-break:break-all; background:var(--bg); border:1px solid var(--line); border-radius:7px; padding:10px; }
`;

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — NutriPlan licencias</title><style>${STYLE}</style></head><body>
<header><b>NutriPlan · licencias</b>
<a href="/admin">Clientes</a><a href="/admin/events">Actividad</a>
<form method="post" action="/admin/logout" class="inline" style="margin-left:auto">
<button>Salir</button></form></header>
<main>${body}</main></body></html>`;
}

export function loginPage(error?: string): string {
  return layout(
    'Entrar',
    `<div class="card" style="max-width:380px;margin:60px auto">
      <h1>Entrar</h1>
      ${error ? `<p class="pill bad" style="display:block;padding:8px 12px">${esc(error)}</p>` : ''}
      <form method="post" action="/admin/login">
        <label for="p">Contraseña</label>
        <input id="p" name="password" type="password" autofocus autocomplete="current-password">
        <div style="margin-top:14px"><button class="primary" type="submit">Entrar</button></div>
      </form>
    </div>`,
  );
}

function statusPill(licence: Licence, nowMs: number): string {
  if (licence.status === 'revoked') return `<span class="pill bad">revocada</span>`;
  if (licence.status === 'suspended') return `<span class="pill bad">suspendida</span>`;
  if (Date.parse(licence.expiresAt) < nowMs) return `<span class="pill warn">vencida</span>`;
  return `<span class="pill ok">activa</span>`;
}

export function customersPage(store: Store, nowMs: number): string {
  const customers = store.listCustomers();
  const rows = customers
    .map((customer) => {
      const licences = store.licencesForCustomer(customer.id);
      const current = licences[0];
      const devices = current ? store.deviceCount(current.id) : 0;
      // Many machines on one licence is the only sharing signal available —
      // and it is a prompt to look, never grounds to switch someone off.
      const flag = devices > 2 ? ` <span class="pill warn">${devices} equipos</span>` : '';
      return `<tr>
        <td><a href="/admin/customer?id=${encodeURIComponent(customer.id)}"><b>${esc(customer.name)}</b></a>
            <div class="muted">${esc(customer.email)}${customer.rfc ? ` · RFC ${esc(customer.rfc)}` : ''}</div></td>
        <td>${current ? esc(current.plan) : '<span class="muted">sin licencia</span>'}</td>
        <td>${current ? statusPill(current, nowMs) : ''}</td>
        <td class="mono">${current ? esc(current.expiresAt.slice(0, 10)) : ''}</td>
        <td>${devices || ''}${flag}</td>
      </tr>`;
    })
    .join('');

  return layout(
    'Clientes',
    `<h1>Clientes</h1>
    <div class="card overflow">
      <table><thead><tr><th>Cliente</th><th>Plan</th><th>Estado</th><th>Vence</th><th>Equipos</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="muted">Todavía no hay clientes.</td></tr>`}</tbody></table>
    </div>

    <h2>Nuevo cliente</h2>
    <div class="card">
      <form method="post" action="/admin/customer/create">
        <div class="grid">
          <div><label for="n">Nombre</label><input id="n" name="name" required></div>
          <div><label for="e">Correo</label><input id="e" name="email" type="email" required></div>
          <div><label for="r">RFC (opcional)</label><input id="r" name="rfc"></div>
        </div>
        <label for="no">Notas</label><textarea id="no" name="notes" rows="2"></textarea>
        <div style="margin-top:12px"><button class="primary" type="submit">Crear cliente</button></div>
      </form>
    </div>`,
  );
}

export function customerPage(
  customer: Customer,
  licences: Licence[],
  devicesByLicence: Map<string, Device[]>,
  nowMs: number,
  issued?: Licence,
): string {
  const licenceCards = licences
    .map((licence) => {
      const devices = devicesByLicence.get(licence.id) ?? [];
      const deviceRows = devices
        .map(
          (device) => `<tr>
            <td class="mono">${esc(device.deviceId)}</td>
            <td class="mono">${esc(device.firstSeenAt.slice(0, 10))}</td>
            <td class="mono">${esc(device.lastSeenAt.slice(0, 16).replace('T', ' '))}</td>
            <td class="mono">${esc(device.appVersion)}</td>
            <td><form method="post" action="/admin/device/forget" class="inline">
              <input type="hidden" name="licenceId" value="${esc(licence.id)}">
              <input type="hidden" name="deviceId" value="${esc(device.deviceId)}">
              <button class="danger">Olvidar</button></form></td>
          </tr>`,
        )
        .join('');

      const actions =
        licence.status === 'revoked'
          ? `<span class="muted">Revocada. No se emiten más tokens; la app sigue funcionando hasta que venza el que tenga.</span>`
          : `
        <form method="post" action="/admin/licence/renew" class="inline">
          <input type="hidden" name="licenceId" value="${esc(licence.id)}">
          <button>Renovar</button></form>
        ${
          licence.status === 'suspended'
            ? `<form method="post" action="/admin/licence/reinstate" class="inline">
                 <input type="hidden" name="licenceId" value="${esc(licence.id)}">
                 <button class="primary">Reactivar</button></form>`
            : `<form method="post" action="/admin/licence/suspend" class="inline">
                 <input type="hidden" name="licenceId" value="${esc(licence.id)}">
                 <button class="danger">Suspender</button></form>`
        }
        <form method="post" action="/admin/licence/revoke" class="inline"
              onsubmit="return confirm('Revocar es permanente. ¿Continuar?')">
          <input type="hidden" name="licenceId" value="${esc(licence.id)}">
          <button class="danger">Revocar</button></form>`;

      return `<div class="card">
        <div class="row" style="justify-content:space-between">
          <div><code>${esc(licence.id)}</code> ${statusPill(licence, nowMs)}
            <div class="muted">${esc(licence.plan)} · vence ${esc(licence.expiresAt.slice(0, 10))} · emitida ${esc(licence.issuedAt.slice(0, 16).replace('T', ' '))}</div></div>
          <div class="row">${actions}</div>
        </div>
        <h2>Equipos</h2>
        <div class="overflow"><table>
          <thead><tr><th>Identificador</th><th>Primera vez</th><th>Última vez</th><th>Versión</th><th></th></tr></thead>
          <tbody>${deviceRows || `<tr><td colspan="5" class="muted">Sin equipos registrados todavía.</td></tr>`}</tbody>
        </table></div>
      </div>`;
    })
    .join('');

  const issuedBlock = issued
    ? `<div class="card">
        <h2>Licencia emitida — envíe este texto</h2>
        <div class="tokenbox">${esc(issued.token)}</div>
        <p class="muted">Se pega en Ajustes → Suscripción. Se muestra una vez aquí; siempre puede volver a emitirla con «Renovar».</p>
      </div>`
    : '';

  return layout(
    customer.name,
    `<h1>${esc(customer.name)}</h1>
    <p class="muted">${esc(customer.email)}${customer.rfc ? ` · RFC ${esc(customer.rfc)}` : ''}</p>
    ${customer.notes ? `<p class="muted">${esc(customer.notes)}</p>` : ''}
    ${issuedBlock}
    ${licenceCards || '<div class="card muted">Sin licencias todavía.</div>'}

    <h2>Emitir licencia nueva</h2>
    <div class="card">
      <form method="post" action="/admin/licence/issue">
        <input type="hidden" name="customerId" value="${esc(customer.id)}">
        <div class="grid">
          <div><label for="h">A nombre de</label><input id="h" name="holder" value="${esc(customer.name)}" required></div>
          <div><label for="pl">Plan</label><select id="pl" name="plan">
            <option value="annual">Anual</option><option value="monthly">Mensual</option>
            <option value="perpetual">Permanente</option></select></div>
          <div><label for="d">Días de vigencia (opcional)</label><input id="d" name="days" inputmode="numeric"></div>
        </div>
        <div style="margin-top:12px"><button class="primary" type="submit">Emitir</button></div>
      </form>
    </div>`,
  );
}

export function eventsPage(events: Event[]): string {
  const rows = events
    .map(
      (event) => `<tr>
        <td class="mono">${esc(event.at.slice(0, 19).replace('T', ' '))}</td>
        <td class="mono">${esc(event.licenceId ?? '')}</td>
        <td>${esc(event.action)}</td>
        <td class="muted">${esc(event.detail)}</td>
      </tr>`,
    )
    .join('');
  return layout(
    'Actividad',
    `<h1>Actividad</h1>
    <div class="card overflow"><table>
      <thead><tr><th>Cuándo</th><th>Licencia</th><th>Acción</th><th>Detalle</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="muted">Sin actividad.</td></tr>`}</tbody>
    </table></div>`,
  );
}
