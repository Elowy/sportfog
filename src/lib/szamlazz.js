// Számlázz.hu (Számla Agent) integráció. A beállításokat a beállítás-tárból
// olvassa (DB felülírja a .env-et). A megadott ár BRUTTÓ árként kezelendő.
const settings = require('../services/settings');

const ENDPOINT = 'https://www.szamlazz.hu/szamla/';
const FIELD_NAME = 'action-xmlagentxmlfile';

function isEnabled() {
  return Boolean(settings.get('SZAMLAZZ_AGENT_KEY'));
}

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function ymd(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function splitVat(gross, vatRate) {
  const numeric = Number(vatRate);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { net: gross, vat: 0, afakulcs: Number.isFinite(numeric) && numeric === 0 ? '0' : vatRate };
  }
  const net = Math.round(gross / (1 + numeric / 100));
  return { net, vat: gross - net, afakulcs: String(numeric) };
}

function buildInvoiceXml({ buyer, item, orderNumber, comment }) {
  const today = new Date();
  const { net, vat, afakulcs } = splitVat(item.grossUnitPrice, settings.get('SZAMLAZZ_VAT_RATE'));
  const qty = item.quantity || 1;
  const netTotal = net * qty;
  const vatTotal = vat * qty;
  const grossTotal = item.grossUnitPrice * qty;
  const prefix = settings.get('SZAMLAZZ_PREFIX');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
  <beallitasok>
    <szamlaagentkulcs>${esc(settings.get('SZAMLAZZ_AGENT_KEY'))}</szamlaagentkulcs>
    <eszamla>${settings.getBool('SZAMLAZZ_ESZAMLA') ? 'true' : 'false'}</eszamla>
    <szamlaLetoltes>false</szamlaLetoltes>
  </beallitasok>
  <fejlec>
    <keltDatum>${ymd(today)}</keltDatum>
    <teljesitesDatum>${ymd(today)}</teljesitesDatum>
    <fizetesiHataridoDatum>${ymd(today)}</fizetesiHataridoDatum>
    <fizmod>${esc(settings.get('SZAMLAZZ_PAYMENT_METHOD'))}</fizmod>
    <penznem>HUF</penznem>
    <szamlaNyelve>hu</szamlaNyelve>
    <megjegyzes>${esc(comment || '')}</megjegyzes>
    <rendelesSzam>${esc(orderNumber || '')}</rendelesSzam>
    <fizetve>true</fizetve>
    ${prefix ? `<szamlaszamElotag>${esc(prefix)}</szamlaszamElotag>` : ''}
  </fejlec>
  <elado></elado>
  <vevo>
    <nev>${esc(buyer.name)}</nev>
    <irsz>${esc(buyer.zip)}</irsz>
    <telepules>${esc(buyer.city)}</telepules>
    <cim>${esc(buyer.address)}</cim>
    <email>${esc(buyer.email)}</email>
    <sendEmail>${settings.getBool('SZAMLAZZ_SEND_EMAIL') ? 'true' : 'false'}</sendEmail>${buyer.taxNumber ? `\n    <adoszam>${esc(buyer.taxNumber)}</adoszam>` : ''}
  </vevo>
  <tetelek>
    <tetel>
      <megnevezes>${esc(item.name)}</megnevezes>
      <mennyiseg>${qty}</mennyiseg>
      <mennyisegiEgyseg>db</mennyisegiEgyseg>
      <nettoEgysegar>${net}</nettoEgysegar>
      <afakulcs>${esc(afakulcs)}</afakulcs>
      <nettoErtek>${netTotal}</nettoErtek>
      <afaErtek>${vatTotal}</afaErtek>
      <bruttoErtek>${grossTotal}</bruttoErtek>
    </tetel>
  </tetelek>
</xmlszamla>`;
}

async function issueInvoice({ buyer, item, orderNumber, comment }) {
  if (!isEnabled()) return { success: false, error: 'A Számlázz.hu integráció nincs beállítva.' };

  const xml = buildInvoiceXml({ buyer, item, orderNumber, comment });
  const form = new FormData();
  form.append(FIELD_NAME, new Blob([xml], { type: 'application/xml' }), 'szamla.xml');

  let response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', body: form });
  } catch (err) {
    return { success: false, error: `Hálózati hiba a Számlázz.hu felé: ${err.message}` };
  }

  const errorCode = response.headers.get('szlahu_error_code');
  const errorMsgRaw = response.headers.get('szlahu_error');
  const invoiceNumber = response.headers.get('szlahu_szamlaszam');

  if (errorCode) {
    let msg = errorMsgRaw || '';
    try { msg = decodeURIComponent((errorMsgRaw || '').replace(/\+/g, ' ')); } catch (_) { /* marad */ }
    return { success: false, error: `Számlázz.hu hiba (${errorCode}): ${msg}` };
  }
  if (!invoiceNumber) return { success: false, error: 'A Számlázz.hu nem adott vissza számlaszámot.' };
  return { success: true, invoiceNumber };
}

module.exports = { isEnabled, issueInvoice, buildInvoiceXml, splitVat };
