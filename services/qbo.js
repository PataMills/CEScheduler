// services/qbo.js
// Node 18+ has global fetch.

const OAUTH_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const HOST_MAP = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com'
};

function qbHost() {
  const env = (process.env.QBO_ENV || 'sandbox').toLowerCase();
  return HOST_MAP[env] || HOST_MAP.sandbox;
}

async function getAccessToken() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const refresh = process.env.QBO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refresh) {
    throw new Error('QBO credentials missing (CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)');
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh });

  const r = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) throw new Error(`QBO token error ${r.status}`);
  const json = await r.json();
  return json.access_token;
}

export async function qbFetch(path, options = {}) {
  const token = await getAccessToken();
  const url = `${qbHost()}${path}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const r = await fetch(OAUTH_URL, { /* … */ });
if (!r.ok) {
  const body = await r.text();
  throw new Error(`QBO token error ${r.status}: ${body}`);
}

  return r.json();
}

function realmPath(p) {
  const realmId = process.env.QBO_REALM_ID;
  if (!realmId) throw new Error('QBO_REALM_ID missing');
  return `/v3/company/${encodeURIComponent(realmId)}${p}`;
}

/* ---------- Item helpers (auto-resolve) ---------- */

async function findItemIdByName(name) {
  const q = `select Id, Name from Item where Name = '${String(name).replace(/'/g, "''")}'`;
  const json = await qbFetch(realmPath(`/query?minorversion=75&query=${encodeURIComponent(q)}`));
  const arr = json?.QueryResponse?.Item || [];
  return arr.length ? arr[0].Id : null;
}

async function createServiceItem({ name, incomeAccountRef }) {
  const payload = {
    Name: String(name),
    Type: 'Service',
    ...(incomeAccountRef ? { IncomeAccountRef: { value: String(incomeAccountRef) } } : {})
  };
  const json = await qbFetch(realmPath('/item?minorversion=75'), {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return json?.Item?.Id;
}

export async function ensureDepositItemId() {
  if (process.env.QBO_DEPOSIT_ITEM_ID) return process.env.QBO_DEPOSIT_ITEM_ID;
  const name = process.env.QBO_DEPOSIT_ITEM_NAME || 'Deposit';
  let id = await findItemIdByName(name);
  if (id) return id;
  id = await createServiceItem({ name });
  if (!id) throw new Error('Could not create Deposit item in QBO');
  return id;
}

/* ---------- Customer helpers ---------- */

async function findCustomerIdByEmail(email) {
  if (!email) return null;
  const q = `select Id, DisplayName, PrimaryEmailAddr from Customer where PrimaryEmailAddr = '${String(email).replace(/'/g,"''")}'`;
  const json = await qbFetch(realmPath(`/query?minorversion=75&query=${encodeURIComponent(q)}`));
  const arr = json?.QueryResponse?.Customer || [];
  return arr.length ? arr[0].Id : null;
}

async function createCustomer({ name, email }) {
  const payload = {
    DisplayName: name || email,
    ...(email ? { PrimaryEmailAddr: { Address: email } } : {})
  };
  const json = await qbFetch(realmPath('/customer?minorversion=75'), {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return json?.Customer?.Id;
}

async function getOrCreateCustomer({ name, email }) {
  let id = await findCustomerIdByEmail(email);
  if (id) return id;
  return await createCustomer({ name, email });
}

/* ---------- Invoice creation + send ---------- */

export async function createAndSendDepositInvoice({ bidId, customer, amount }) {
  const custId = await getOrCreateCustomer({ name: customer?.name, email: customer?.email });

  const itemName = process.env.QBO_DEPOSIT_ITEM_NAME || 'Deposit';
  const itemId   = await ensureDepositItemId();

  const allowCard = String(process.env.QBO_ALLOW_CARD || 'true') === 'true';
  const allowAch  = String(process.env.QBO_ALLOW_ACH  || 'true') === 'true';

  const invoicePayload = {
    CustomerRef: { value: String(custId) },
    TxnDate: new Date().toISOString().slice(0,10),
    PrivateNote: `Bid #${bidId} — Deposit invoice`,
    ...(customer?.email ? { BillEmail: { Address: customer.email } } : {}),
    AllowOnlineCreditCardPayment: allowCard,
    AllowOnlineACHPayment: allowAch,
    Line: [
      {
        DetailType: 'SalesItemLineDetail',
        Amount: Number(amount || 0),
        Description: `${itemName} for Bid #${bidId}`,
        SalesItemLineDetail: { ItemRef: { value: String(itemId), name: itemName } }
      }
    ]
  };

  const created = await qbFetch(realmPath('/invoice?minorversion=75'), {
    method: 'POST',
    body: JSON.stringify(invoicePayload)
  });
  const invoiceId = created?.Invoice?.Id;
  if (!invoiceId) throw new Error('QBO invoice create failed (no Id)');

  await qbFetch(realmPath(`/invoice/${invoiceId}/send?minorversion=75`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' }
  });

  return { invoiceId, customerId: custId };
}
