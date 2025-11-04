// utils/incompleteDetector.js
import { pool } from "../db.js";

/**
 * Extract items that need attention from completion notes
 * Looks for keywords indicating missing, broken, or incorrect items
 */
export function extractNeeds(text = "") {
  const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const items = [];
  
  // Keywords indicating problems
  const problemKeywords = /missing|need|needs|don't work|doesn't work|not banded|too big|too small|wrong|incorrect|damaged|broken|defective/i;
  
  // Keywords for cabinet/construction items
  const itemKeywords = /door|shelf|scribe|toekick|toe\s*kick|hardware|lazy susan|cabinet|drawer|hinge|handle|knob|panel|trim|molding|crown|countertop|sink|faucet|appliance|band|edge/i;
  
  for (const s of lines) {
    // Skip header lines like "Missing:" with nothing after
    if (/^(missing|need|needs)[:\- ]?$/i.test(s)) continue;
    
    // If line mentions both a problem and an item type, it's likely a missing/needed item
    if (problemKeywords.test(s) && itemKeywords.test(s)) {
      items.push({ 
        item_name: s, 
        reason: 'reported_missing',
        detected_at: new Date().toISOString()
      });
    } else if (itemKeywords.test(s)) {
      // Even without explicit "missing", if it's in a list context it's likely needed
      // Check if previous line was a header or this is in a list
      const prevLine = lines[lines.indexOf(s) - 1];
      if (prevLine && /^(missing|need|needs)[:\- ]/i.test(prevLine)) {
        items.push({ 
          item_name: s, 
          reason: 'listed_item',
          detected_at: new Date().toISOString()
        });
      }
    }
  }
  
  return items;
}

/**
 * Process incomplete items: create purchase queue entries and service task
 * @param {number} taskId - The completed task ID
 * @param {number} jobId - The job ID
 * @param {string} note - The completion note
 * @param {Array} needs - Extracted needs from extractNeeds()
 * @returns {Promise<Object>} - Results of processing
 */
export async function processIncompleteItems(taskId, jobId, note, needs) {
  if (!needs || needs.length === 0) {
    return { processed: false, reason: 'no_needs' };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Record structured incomplete event
    await client.query(
      `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
       VALUES ($1, $2, 'incomplete', $3, 'system')`,
      [taskId, jobId, JSON.stringify({ needs, note, detected_at: new Date().toISOString() })]
    );

    // 2) Seed purchase_queue items
    const purchaseIds = [];
    for (const n of needs) {
      const res = await client.query(
        `INSERT INTO public.purchase_queue (job_id, item_name, spec, status, vendor, needed_by)
         VALUES ($1, $2, $3, 'pending'::text, $4, $5)
         RETURNING id`,
        [
          jobId, 
          n.item_name, 
          JSON.stringify({ source: 'complete_note', task_id: taskId, reason: n.reason }),
          'TBD',  // vendor - to be determined
          null    // needed_by - will be set later
        ]
      );
      purchaseIds.push(res.rows[0].id);
    }

    // 3) Create a follow-up service task (on HOLD until parts arrive)
    const serviceRes = await client.query(
      `INSERT INTO public.install_tasks (job_id, type, name, status, duration_min, notes)
       VALUES ($1, 'service'::text, $2, 'hold'::text, 90, $3)
       RETURNING id`,
      [
        jobId,
        'Service – Missing Items Follow-up',
        `Auto-created from task ${taskId} completion.\n\nMissing items detected:\n${needs.map(n => '• ' + n.item_name).join('\n')}`
      ]
    );

    const serviceTaskId = serviceRes.rows[0].id;

    await client.query("COMMIT");

    return {
      processed: true,
      needs_count: needs.length,
      purchase_ids: purchaseIds,
      service_task_id: serviceTaskId
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Send Slack notification for incomplete job
 */
export async function notifyIncomplete(taskId, jobId, customerName, needs, serviceTaskId) {
  try {
    const webhook = process.env.N8N_OPS_STATUS_WEBHOOK;
    if (!webhook) return;

    const needsList = needs.map(n => n.item_name).join('\n• ');
    
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "incomplete",
        task_id: taskId,
        job_id: jobId,
        customer_name: customerName,
        status: "needs_followup",
        created_by: "system",
        payload: {
          needs_count: needs.length,
          needs_preview: needsList.substring(0, 200),
          service_task_id: serviceTaskId
        },
        at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('[INCOMPLETE] Slack notification failed:', e.message);
  }
}
