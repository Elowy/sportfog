// Számlázz.hu (Számla Agent) integráció.
// XML alapú kérést küld a https://www.szamlazz.hu/szamla/ végpontra,
// "action-xmlagentxmlfile" multipart mezőben, és a válasz fejlécekből
// olvassa ki a számlaszámot, illetve a hibát.
//
// A megadott ár BRUTTÓ árként van kezelve; az ÁFA kulcs a configból jön.
const config = require('../config');

const ENDPOINT = 'https://www.szamlazz.hu/szamla/';
const FIELD_NAME = 'action-xmlagentxmlfile';

function isEnabled() {
  return config.szamlazz.enabled;
}

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ymd(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Bruttó árból nettó és ÁFA számítása az ÁFA kulcs alapján.
function splitVat(gross, vatRate) {
  const numeric = Number(vatRate);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    // Szöveges kulcs (AM/TAM) vagy 0% – nincs ÁFA
    return { net: gross, vat: 0, afakulcs: Number.isFinite(numeric) && numeric === 0 ? '0' : vatRate };
  }
  const net = Math.round(gross / (1 + numeric / 100));
  return { net, vat: gross - net, afakulcs: String(numeric) };
}

function buildInvoiceXml({ buyer, item, orderNumber, comment }) {
  const today = new Date();
  const { net, vat, afakulcs } = splitVat(item.grossUnitPrice, config.szamlazz.vatRate);
  const qty = item.quantity || 1;
  const netTotal = net * qty;
  const vatTotal = vat * qty;
  const grossTotal = item.grossUnitPrice * qty;

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
  <beallitasok>
    <szamlaagentkulcs>${esc(config.szamlazz.agentKey)}</szamlaagentkulcs>
    <eszamla>${config.szamlazz.eszamla ? 'true' : 'false'}</eszamla>
    <szamlaLetoltes>false</szamlaLetoltes>
  </beallitasok>
  <fejlec>
    <keltDatum>${ymd(today)}</keltDatum>
    <teljesitesDatum>${ymd(today)}</teljesitesDatum>
    <fizetesiHataridoDatum>${ymd(today)}</fizetesiHataridoDatum>
    <fizmod>${esc(config.szamlazz.paymentMethod)}</fizmod>
    <penznem>HUF</penznem>
    <szamlaNyelve>hu</szamlaNyelve>
    <megjegyzes>${esc(comment || '')}</megjegyzes>
    <rendelesSzam>${esc(orderNumber || '')}</rendelesSzam>
    <fizetve>true</fizetve>
    ${config.szamlazz.prefix ? `<szamlaszamElotag>${esc(config.szamlazz.prefix)}</szamlaszamElotag>` : ''}
  </fejlec>
  <elado></elado>
  <vevo>
    <nev>${esc(buyer.name)}</nev>
    <irsz>${esc(buyer.zip)}</irsz>
    <telepules>${esc(buyer.city)}</telepules>
    <cim>${esc(buyer.address)}</cim>
    <email>${esc(buyer.email)}</email>
    <sendEmail>${config.szamlazz.sendEmail ? 'true' : 'false'}</sendEmail>${buyer.taxNumber ? `\n    <adoszam>${esc(buyer.taxNumber)}</adoszam>` : ''}
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

// Számla kiállítása. Visszatérés: { success, invoiceNumber, error }.
async function issueInvoice({ buyer, item, orderNumber, comment }) {
  if (!isEnabled()) {
    return { success: false, error: 'A Számlázz.hu integráció nincs beállítva.' };
  }

  const xml = buildInvoiceXml({ buyer, item, orderNumber, comment });

  const form = new FormData();
  const blob = new Blob([xml], { type: 'application/xml' });
  form.append(FIELD_NAME, blob, 'szamla.xml');

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
    try {
      msg = decodeURIComponent((errorMsgRaw || '').replace(/\+/g, ' '));
    } catch (_) {
      /* hagyjuk az eredetit */
    }
    return { success: false, error: `Számlázz.hu hiba (${errorCode}): ${msg}` };
  }

  if (!invoiceNumber) {
    return { success: false, error: 'A Számlázz.hu nem adott vissza számlaszámot.' };
  }

  return { success: true, invoiceNumber };
}

module.exports = {
  isEnabled,
  issueInvoice,
  buildInvoiceXml,
  splitVat,
};
