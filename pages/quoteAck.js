// /pages/quoteAck.js
import express from "express";
import pool from "../db.js";
import { createAndSendDepositInvoice } from '../services/qbo.js';   // adjust path if needed


export default function registerQuoteAck(app){
  app.get('/quote-ack', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review & Accept — Cabinets Express</title>
<style>
  :root{
    --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#8b93a3;
    --hi:#dbe3ff; --good:#b7ffc2; --btn:#1a2033; --accent:#0D61FF;
  }
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;margin:0;background:var(--bg);color:var(--text)}
  .wrap{max-width:1100px;margin:0 auto;padding:24px}
  h1{margin:0 0 6px;font-size:24px}
  h2{margin:14px 0 8px;font-size:16px}
  .muted{color:var(--muted)}
  .row{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
  .left{flex:2;min-width:320px}
  .right{flex:1;min-width:300px}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0}
  .box{border:1px solid var(--line);border-radius:10px;padding:12px;background:#0f121a}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td{padding:8px 6px;border-bottom:1px solid var(--line)}
  td:nth-child(1){color:var(--muted)}
  td:nth-child(2){text-align:right;font-weight:700}
  input,textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:#0f1220;color:var(--text)}
  label{font-size:12px;color:var(--muted)}
  .btn{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--btn);color:var(--text);cursor:pointer}
  .cta{background:var(--accent);color:#fff;border-color:var(--accent)}
  .header{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:8px}
  .logo{height:36px}
  .inline{display:flex;gap:10px}
  @media (max-width:900px){ .inline{flex-direction:column} }
</style>
</head><body>
<div class="wrap">

  <div class="header">
    <div class="inline" style="align-items:center">
      <img class="logo" src="/static/ce-logo-trademarked.jpg" onerror="this.style.display='none'"/>
      <div>
        <h1>Confirm & Accept Order</h1>
        <div id="bidMeta" class="muted"></div>
      </div>
    </div>
    <div>
      <a id="viewQuote" class="btn" href="#">Open Full Quote</a>
    </div>
  </div>

  <div class="row">
    <!-- LEFT: quote summary -->
    <div class="left">
      <div class="panel">
        <h2>Summary</h2>
        <table id="money">
          <tr><td>Bid Total</td><td id="total">—</td></tr>
          <tr><td>Deposit Due Now</td><td id="deposit">—</td></tr>
          <tr><td>Remaining on Installation</td><td id="remaining">—</td></tr>
        </table>
      </div>

      <div class="panel">
        <h2>Payment Terms</h2>
        <div id="paymentTerms" class="box muted">Loading…</div>
        <div style="margin-top:8px;font-size:12px;color:var(--muted)">We accept ACH / wire / credit card (3% fee).</div>
      </div>

      <div class="panel">
        <h2>General Disclaimer</h2>
        <div id="disclaimer" class="box muted">Loading…</div>
      </div>
    </div>

    <!-- RIGHT: accept form -->
    <div class="right">
      <div class="panel">
        <div class="inline">
          <div style="flex:1"><label>Your Name</label><input id="cust_name" autocomplete="name"/></div>
          <div style="flex:1"><label>Your Email</label><input id="cust_email" type="email" autocomplete="email"/></div>
        </div>
        <div style="margin-top:10px">
          <label>Notes (optional)</label>
          <textarea id="cust_notes" rows="3"></textarea>
        </div>
        <div class="inline" style="margin-top:10px">
          <div style="flex:1"><label>Initials (to confirm)</label><input id="cust_initials" maxlength="6"/></div>
        </div>
        <div style="margin-top:10px">
          <label><input id="agree" type="checkbox"> I have reviewed the quote and agree to proceed.</label>
        </div>
        <div style="margin-top:12px">
          <button id="acceptBtn" class="btn cta">Accept Order</button>
        </div>
        <p class="muted" style="margin-top:12px">Questions? Call Cabinets Express at (801) 617-1133.</p>
      </div>
    </div>
  </div>
</div>

<script>
const $ = (sel)=>document.querySelector(sel);
const fmt = (n)=> Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const params = new URLSearchParams(location.search);
const bid = params.get('bid');
const tokenK = params.get('k'); // keep for submit

(async function init(){
  if(!bid){ alert('Missing bid'); return; }
  $('#viewQuote').href = '/sales-quote?bid='+bid;
  $('#bidMeta').textContent = 'Bid #'+bid;

  // --- Load totals (supports {total:..} or {totals:{...}}) ---
  try{
    const tr = await fetch('/api/bids/'+bid+'/totals');
    if (!tr.ok) throw new Error('totals http '+tr.status);
    const raw = await tr.json();
    const row = raw?.totals ?? raw; // accept either
    const total     = row?.total;
    const deposit   = row?.deposit_amount ?? row?.depositAmount;
    const remaining = row?.remaining_amount ?? row?.remainingAmount;

    if (total != null)    $('#total').textContent     = fmt(total);
    if (deposit != null)  $('#deposit').textContent   = fmt(deposit);
    if (remaining != null)$('#remaining').textContent = fmt(remaining);
  }catch(e){
    console.warn('totals load failed', e);
    $('#total').textContent = $('#deposit').textContent = $('#remaining').textContent = '—';
  }

  // --- Load admin content (supports {payment_terms,..} or {content:{payment_terms,..}} etc.) ---
  try{
    const ar = await fetch('/api/admin-content');
    if (!ar.ok) throw new Error('admin http '+ar.status);
    const data = await ar.json();
    const c = data?.content ?? data; // accept either

    const terms = (c?.payment_terms ?? c?.paymentTerms ?? '').toString().trim()
                || 'Deposit due before ordering; remaining balance due on delivery. Interest/fees may apply if late.';
    const disc  = (c?.disclaimer ?? c?.general_disclaimer ?? c?.disclaimerText ?? '').toString().trim()
                || 'All sales final after 24 hours. Natural wood varies in color and grain; non-warranty cosmetic variation is expected.';

    $('#paymentTerms').textContent = terms;
    $('#disclaimer').textContent   = disc;
  }catch(e){
    console.warn('admin-content load failed', e);
    $('#paymentTerms').textContent = 'Deposit due before ordering; remaining balance due on delivery. Interest/fees may apply if late.';
    $('#disclaimer').textContent   = 'All sales final after 24 hours. Natural wood varies in color and grain; non-warranty cosmetic variation is expected.';
  }
})();

// Accept handler stays the same, but make sure it includes tokenK:
$('#acceptBtn').onclick = async ()=>{
  const name = $('#cust_name').value.trim();
  const email = $('#cust_email').value.trim();
  const notes = $('#cust_notes').value.trim();
  const initials = $('#cust_initials')?.value?.trim()?.toUpperCase?.() || '';
  const agree = $('#agree').checked;
  if(!name || !email){ alert('Please enter your name and email.'); return; }
  if(!initials){ alert('Please add your initials to confirm.'); return; }
  if(!agree){ alert('Please confirm you agree to proceed.'); return; }
  try{
    const r = await fetch('/api/bids/'+bid+'/accept-ack', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, notes, initials, k: tokenK })
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    alert('Thank you! Your order has been accepted.');
    // No redirect yet — keep customer on confirmation page
    document.getElementById('acceptBtn').disabled = true;
    document.getElementById('acceptBtn').textContent = 'Accepted ✔️';
  }catch(e){ alert('Could not save acknowledgement: ' + (e.message||e)); }
};
</script>

</body></html>`);
  });

  async function validateAckToken(req, res, next) {
  const bidId = Number(req.query.bid || req.params.id);
  const token = String(req.query.k || '').trim();
  if (!bidId || !token) return res.status(400).send('Invalid link.');

  const { rows } = await pool.query(
    `SELECT id, expires_at, used_at
       FROM quote_ack_tokens
      WHERE bid_id = $1 AND token = $2`,
    [bidId, token]
  );
  if (!rows.length) return res.status(403).send('This link is invalid.');
  const row = rows[0];
  if (row.used_at)  return res.status(410).send('This link has already been used.');
  if (new Date(row.expires_at) < new Date()) return res.status(410).send('This link has expired.');

  // ok
  req.ackToken = { id: row.id, bidId };
  next();
}

// Slack webhook helper
async function postToSlackChannel(channel, text) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !channel) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ channel, text })
    });
  } catch { /* ignore */ }
}


  // API endpoint to record acceptance
app.post('/api/bids/:id/accept-ack', express.json(), async (req, res) => {
  const bidId = Number(req.params.id);
  const { name, email, notes, initials, k } = req.body || {};
  if (!bidId || !name || !email || !initials || !k) {
    return res.status(400).json({ ok:false, error:'missing_fields' });
  }

  try {
    // 1) validate token
    const { rows: tokRows } = await pool.query(
      `SELECT id, expires_at, used_at FROM quote_ack_tokens WHERE bid_id=$1 AND token=$2`,
      [bidId, String(k)]
    );
    if (!tokRows.length) return res.status(403).json({ ok:false, error:'invalid_token' });
    const tok = tokRows[0];
    if (tok.used_at) return res.status(410).json({ ok:false, error:'token_used' });
    if (new Date(tok.expires_at) < new Date()) return res.status(410).json({ ok:false, error:'token_expired' });

    // 2) record acceptance
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    await pool.query(
      `INSERT INTO bid_acceptances (bid_id, name, email, notes, initials, ip, user_agent, token_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [bidId, name.trim(), email.trim(), (notes||'').trim(), initials.trim().toUpperCase(), String(ip), String(ua), tok.id]
    );
    await pool.query(`UPDATE quote_ack_tokens SET used_at=now() WHERE id=$1`, [tok.id]);

    // 3) load totals for deposit amount
    const { rows: trows } = await pool.query(
      `SELECT deposit_amount FROM public.bid_grand_totals WHERE bid_id = $1`,
      [bidId]
    );
    const depositAmount = trows.length ? Number(trows[0].deposit_amount) : 0;

    // 4) create & send QBO invoice (ACH/Card toggle via env)
    let qboInvoiceId = null;
    try {
      const resQbo = await createAndSendDepositInvoice({
        bidId,
        customer: { name, email },
        amount: depositAmount
      });
      qboInvoiceId = resQbo.invoiceId;
    } catch (e) {
      console.error('QBO invoice error:', e?.message || e);
      // Do not fail acceptance if QBO fails — we can re-issue later
    }
    if (qboInvoiceId) {
  await pool.query(`UPDATE bids SET deposit_invoice_id = $1 WHERE id = $2`, [String(qboInvoiceId), bidId]);
}


    // 5) Slack notify
    const depFmt = depositAmount
      ? depositAmount.toLocaleString('en-US',{style:'currency',currency:'USD'})
      : '—';
    const opsLink = `${process.env.OPS_URL_BASE || ''}/${bidId}`;
    const invPart = qboInvoiceId ? ` | Invoice ${qboInvoiceId}` : '';
    await postToSlackChannel(process.env.SLACK_CHANNEL || '#bt-job-input',
      `✅ *Quote accepted* — Bid #${bidId} | *${name}* (${initials}) | *Deposit ${depFmt}*${invPart} | <${opsLink}|Open Ops>`
    );

    return res.json({ ok:true, invoiceId: qboInvoiceId || null });
  } catch (e) {
    console.error('accept error:', e);
    return res.status(500).json({ ok:false, error:'accept_failed' });
  }
});


}
