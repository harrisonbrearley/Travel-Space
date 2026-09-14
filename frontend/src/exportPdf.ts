import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import type { Attraction, Flight, Stay, Ticket, Transport, Trip } from "@/src/api";
import { convert, formatMoney, type Rates } from "@/src/currency";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => (s || "").replace(/[&<>"']/g, (c) => ESC[c]);

function niceDay(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function niceTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function niceRange(a: string, b: string) {
  if (a && b) return `${niceDay(a)} — ${niceDay(b)}`;
  return niceDay(a) || niceDay(b) || "";
}
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

export type ExportOptions = {
  flights: boolean;
  transport: boolean;
  stays: boolean;
  attractions: boolean;
  tickets: boolean;
  cost: boolean;
  map: boolean; // ignored in PDF (no runtime map render), included as note
};

export type ExportData = {
  trip: Trip;
  flights: Flight[];
  transport: Transport[];
  stays: Stay[];
  attractions: Attraction[];
  tickets: Ticket[];
};

type ItineraryItem = {
  when: string;
  endWhen?: string;
  icon: string;
  title: string;
  sub?: string;
  detail?: string;
  cat: "flight" | "transport" | "stay" | "attraction";
  cost?: number;
  costCur?: string;
};

function buildItinerary(data: ExportData, opts: ExportOptions): ItineraryItem[] {
  const items: ItineraryItem[] = [];
  if (opts.flights) data.flights.forEach((f) => {
    if (f.departure_datetime) items.push({
      when: f.departure_datetime,
      endWhen: f.arrival_datetime,
      icon: "✈",
      title: `${f.airline || "Flight"} ${f.flight_number}`.trim(),
      sub: `${f.departure_location} → ${f.arrival_location}`,
      detail: f.layovers?.length ? `${f.layovers.length} layover(s): ${f.layovers.map((l) => l.location).filter(Boolean).join(", ")}` : "",
      cat: "flight",
      cost: f.cost, costCur: f.cost_currency,
    });
  });
  if (opts.transport) data.transport.forEach((t) => {
    if (t.departure_datetime) items.push({
      when: t.departure_datetime,
      endWhen: t.arrival_datetime,
      icon: transportIcon(t.transport_type),
      title: `${t.transport_type.charAt(0).toUpperCase() + t.transport_type.slice(1)}`,
      sub: `${t.departure_location} → ${t.arrival_location}`,
      detail: t.notes || "",
      cat: "transport",
      cost: t.cost, costCur: t.cost_currency,
    });
  });
  if (opts.stays) data.stays.forEach((st) => {
    if (st.checkin_datetime) items.push({
      when: st.checkin_datetime,
      icon: "🛏",
      title: `Check in: ${st.accommodation_name || "Stay"}`,
      sub: st.location,
      detail: [st.breakfast_included ? "Breakfast included" : "", st.dinner_included ? "Dinner included" : ""].filter(Boolean).join(" · "),
      cat: "stay",
      cost: st.cost, costCur: st.cost_currency,
    });
    if (st.checkout_datetime) items.push({
      when: st.checkout_datetime,
      icon: "🛏",
      title: `Check out: ${st.accommodation_name || "Stay"}`,
      sub: st.location,
      cat: "stay",
    });
  });
  if (opts.attractions) data.attractions.forEach((a) => {
    if (a.activity_datetime) items.push({
      when: a.activity_datetime,
      icon: "📍",
      title: a.name || "Activity",
      sub: a.location,
      detail: a.notes || "",
      cat: "attraction",
      cost: a.cost, costCur: a.cost_currency,
    });
  });
  return items.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
}

function transportIcon(t: string) {
  return ({ car: "🚗", bus: "🚌", train: "🚆", ferry: "⛴", other: "•" } as Record<string, string>)[t] || "🚗";
}

function buildHtml(data: ExportData, opts: ExportOptions, rates: Rates | undefined): string {
  const { trip } = data;
  const tripCur = trip.currency || "USD";
  const items = buildItinerary(data, opts);

  // group by day
  const groups: Record<string, ItineraryItem[]> = {};
  items.forEach((i) => {
    const d = new Date(i.when);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    (groups[key] = groups[key] || []).push(i);
  });
  const dayKeys = Object.keys(groups).sort();

  const totals = { flights: 0, transport: 0, stays: 0, attractions: 0, tickets: 0 };
  if (opts.cost) {
    if (opts.flights) totals.flights = data.flights.reduce((a, f) => a + convert(f.cost || 0, f.cost_currency || tripCur, tripCur, rates), 0);
    if (opts.transport) totals.transport = data.transport.reduce((a, t) => a + convert(t.cost || 0, t.cost_currency || tripCur, tripCur, rates), 0);
    if (opts.stays) totals.stays = data.stays.reduce((a, s) => a + convert(s.cost || 0, s.cost_currency || tripCur, tripCur, rates), 0);
    if (opts.attractions) totals.attractions = data.attractions.reduce((a, x) => a + convert(x.cost || 0, x.cost_currency || tripCur, tripCur, rates), 0);
    if (opts.tickets) totals.tickets = data.tickets.reduce((a, x) => a + convert(x.cost || 0, x.cost_currency || tripCur, tripCur, rates), 0);
  }
  const grandTotal = totals.flights + totals.transport + totals.stays + totals.attractions + totals.tickets;

  const dayLabel = (day: string) => {
    if (!trip.start_date) return "";
    const st = new Date(trip.start_date);
    const c = new Date(day);
    const diff = Math.floor((c.getTime() - new Date(st.getFullYear(), st.getMonth(), st.getDate()).getTime()) / 86400000);
    return diff >= 0 ? `Day ${diff + 1}` : "Pre-trip";
  };

  const daysHtml = dayKeys.map((day) => {
    const list = groups[day];
    const dayHeader = `
      <div class="day-header">
        <div class="day-label">${esc(dayLabel(day))}</div>
        <div class="day-date">${esc(niceDay(day))}</div>
      </div>`;
    const rows = list.map((i) => `
      <div class="item">
        <div class="item-time">
          <div class="item-icon">${i.icon}</div>
          <div class="time">${esc(niceTime(i.when))}${i.endWhen ? " – " + esc(niceTime(i.endWhen)) : ""}</div>
        </div>
        <div class="item-body">
          <div class="item-title">${esc(i.title)}</div>
          ${i.sub ? `<div class="item-sub">${esc(i.sub)}</div>` : ""}
          ${i.detail ? `<div class="item-detail">${esc(i.detail)}</div>` : ""}
          ${opts.cost && i.cost ? `<div class="item-cost">${esc(formatMoney(i.cost, i.costCur || tripCur))}${(i.costCur && i.costCur !== tripCur) ? ` <span class="fx">≈ ${esc(formatMoney(convert(i.cost, i.costCur, tripCur, rates), tripCur))}</span>` : ""}</div>` : ""}
        </div>
      </div>`).join("");
    return `<section class="day">${dayHeader}<div class="items">${rows}</div></section>`;
  }).join("");

  const ticketsHtml = opts.tickets && data.tickets.length ? `
    <section class="tickets page-break">
      <h2>Tickets</h2>
      <div class="ticket-grid">
        ${data.tickets.map((t) => `
          <div class="ticket">
            ${t.photo ? `<img src="${esc(t.photo)}" alt="ticket" />` : `<div class="ticket-placeholder">🎟</div>`}
            <div class="ticket-body">
              <div class="ticket-type">${esc(String(t.ticket_type).toUpperCase())}</div>
              ${t.details ? `<div class="ticket-details">${esc(t.details)}</div>` : ""}
              ${opts.cost && t.cost ? `<div class="ticket-cost">${esc(formatMoney(t.cost, t.cost_currency || tripCur))}</div>` : ""}
              ${t.link ? `<div class="ticket-link">${esc(t.link)}</div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </section>` : "";

  const budgetHtml = opts.cost ? `
    <section class="budget page-break">
      <h2>Budget</h2>
      <div class="budget-hero">
        <div class="hero-label">Total spent in ${esc(tripCur)}</div>
        <div class="hero-amt">${esc(formatMoney(grandTotal, tripCur))}</div>
        <div class="hero-sub">of ${esc(formatMoney(trip.budget_planned || 0, tripCur))} planned</div>
      </div>
      <table class="budget-table">
        ${opts.flights ? `<tr><td>Flights</td><td>${esc(formatMoney(totals.flights, tripCur))}</td></tr>` : ""}
        ${opts.transport ? `<tr><td>Transport</td><td>${esc(formatMoney(totals.transport, tripCur))}</td></tr>` : ""}
        ${opts.stays ? `<tr><td>Stays</td><td>${esc(formatMoney(totals.stays, tripCur))}</td></tr>` : ""}
        ${opts.attractions ? `<tr><td>Attractions</td><td>${esc(formatMoney(totals.attractions, tripCur))}</td></tr>` : ""}
        ${opts.tickets ? `<tr><td>Tickets</td><td>${esc(formatMoney(totals.tickets, tripCur))}</td></tr>` : ""}
        <tr class="grand"><td>Total</td><td>${esc(formatMoney(grandTotal, tripCur))}</td></tr>
      </table>
    </section>` : "";

  const dateRange = niceRange(trip.start_date, trip.end_date);

  const cover = `
    <section class="cover">
      ${trip.cover_photo ? `<div class="cover-photo" style="background-image:url('${esc(trip.cover_photo)}')"></div>` : `<div class="cover-photo cover-fallback"></div>`}
      <div class="cover-overlay">
        <div class="cover-brand">TRAVEL SPACE</div>
        <div class="cover-title">${esc(trip.name || "My Trip")}</div>
        ${trip.destination ? `<div class="cover-dest">${esc(trip.destination)}</div>` : ""}
        ${dateRange ? `<div class="cover-dates">${esc(dateRange)}</div>` : ""}
      </div>
    </section>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(trip.name || "Trip")} — Itinerary</title>
<style>
  @page { size: A4; margin: 20mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1C1C1E; margin: 0; font-size: 12pt; line-height: 1.4; }
  h2 { font-size: 20pt; letter-spacing: -0.3px; margin: 0 0 16px 0; color: #1C1C1E; }
  .page-break { page-break-before: always; }
  .cover { position: relative; height: 260mm; overflow: hidden; border-radius: 8pt; margin-bottom: 16pt; }
  .cover-photo { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .cover-fallback { background: linear-gradient(135deg, #788B76, #3E4C3D); }
  .cover-overlay { position: absolute; inset: 0; padding: 24pt; display: flex; flex-direction: column; justify-content: flex-end; background: linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.7)); color: #fff; }
  .cover-brand { font-size: 10pt; letter-spacing: 3pt; font-weight: 700; margin-bottom: 12pt; opacity: 0.9; }
  .cover-title { font-size: 34pt; font-weight: 800; letter-spacing: -1pt; margin-bottom: 6pt; line-height: 1.1; }
  .cover-dest { font-size: 16pt; opacity: 0.92; }
  .cover-dates { font-size: 13pt; opacity: 0.85; margin-top: 4pt; }
  .day { margin-bottom: 22pt; page-break-inside: avoid; }
  .day-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1pt solid #E8E4DF; padding-bottom: 6pt; margin-bottom: 10pt; }
  .day-label { font-size: 16pt; font-weight: 700; color: #1C1C1E; letter-spacing: -0.3px; }
  .day-date { font-size: 11pt; color: #8E8A85; }
  .item { display: flex; gap: 12pt; padding: 10pt 12pt; border: 1pt solid #E8E4DF; border-radius: 8pt; margin-bottom: 6pt; page-break-inside: avoid; background: #FFFFFF; }
  .item-time { min-width: 78pt; text-align: center; padding-right: 10pt; border-right: 1pt solid #E8E4DF; }
  .item-icon { font-size: 18pt; margin-bottom: 4pt; }
  .time { font-size: 10pt; color: #788B76; font-weight: 600; }
  .item-body { flex: 1; }
  .item-title { font-size: 13pt; font-weight: 700; color: #1C1C1E; margin-bottom: 2pt; }
  .item-sub { font-size: 11pt; color: #4B5563; margin-bottom: 3pt; }
  .item-detail { font-size: 10pt; color: #8E8A85; font-style: italic; }
  .item-cost { font-size: 11pt; color: #788B76; font-weight: 700; margin-top: 4pt; }
  .fx { color: #8E8A85; font-weight: 500; font-size: 9pt; }
  .tickets .ticket-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
  .ticket { border: 1pt solid #E8E4DF; border-radius: 8pt; overflow: hidden; page-break-inside: avoid; }
  .ticket img { width: 100%; height: 90pt; object-fit: cover; display: block; }
  .ticket-placeholder { height: 90pt; display: flex; align-items: center; justify-content: center; font-size: 32pt; background: #F2EFEA; }
  .ticket-body { padding: 8pt 10pt; }
  .ticket-type { font-size: 9pt; letter-spacing: 1pt; color: #788B76; font-weight: 700; margin-bottom: 4pt; }
  .ticket-details { font-size: 11pt; color: #1C1C1E; }
  .ticket-cost { margin-top: 4pt; font-weight: 700; color: #788B76; }
  .ticket-link { margin-top: 4pt; font-size: 9pt; color: #788B76; word-break: break-all; }
  .budget-hero { border: 1pt solid #E8E4DF; padding: 16pt; border-radius: 8pt; margin-bottom: 12pt; }
  .hero-label { color: #8E8A85; font-size: 11pt; }
  .hero-amt { font-size: 28pt; font-weight: 800; letter-spacing: -1pt; margin: 4pt 0; }
  .hero-sub { color: #8E8A85; }
  .budget-table { width: 100%; border-collapse: collapse; margin-top: 8pt; }
  .budget-table td { padding: 8pt 4pt; border-bottom: 1pt solid #E8E4DF; font-size: 12pt; }
  .budget-table td:last-child { text-align: right; font-weight: 600; }
  .budget-table tr.grand td { font-weight: 800; font-size: 13pt; border-bottom: none; padding-top: 12pt; }
  .foot { text-align: center; color: #8E8A85; font-size: 9pt; padding-top: 24pt; margin-top: 24pt; border-top: 1pt solid #E8E4DF; }
</style>
</head>
<body>
${cover}
<section class="itinerary page-break">
  <h2>Itinerary</h2>
  ${dayKeys.length === 0 ? '<p style="color:#8E8A85;">No dated items in this trip yet.</p>' : daysHtml}
</section>
${budgetHtml}
${ticketsHtml}
<div class="foot">Exported from Travel Space</div>
</body>
</html>`;
}

export async function exportTripPdf(data: ExportData, opts: ExportOptions, rates: Rates | undefined) {
  try {
    const html = buildHtml(data, opts, rates);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `${data.trip.name || "Trip"} — Itinerary`,
        UTI: "com.adobe.pdf",
      });
    } else if (Platform.OS === "web") {
      // web: open the print dialog which lets user save as PDF
      await Print.printAsync({ html });
    } else {
      Alert.alert("Saved", `PDF saved to ${uri}`);
    }
    return uri;
  } catch (e: any) {
    Alert.alert("Export failed", e?.message || "Could not create PDF.");
    return null;
  }
}
