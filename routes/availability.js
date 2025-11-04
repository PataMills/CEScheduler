// routes/availability.js
import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

/**
 * GET /api/availability/check
 * Query params:
 *   - date: YYYY-MM-DD
 *   - start: HH:MM (local time)
 *   - duration: minutes
 *   - resource_id: (optional) specific resource ID
 * 
 * Returns: { available: boolean, conflicts: [], alternatives: [] }
 */
router.get('/check', async (req, res) => {
  try {
    const { date, start, duration, resource_id } = req.query;
    
    if (!date || !start || !duration) {
      return res.status(400).json({ error: 'missing_parameters' });
    }

    const durationMin = parseInt(duration, 10);
    const resourceId = resource_id ? parseInt(resource_id, 10) : null;

    let conflicts = [];
    let available = true;

    if (resourceId) {
      // Check specific resource availability using SQL timestamp operations
      const { rows } = await pool.query(
        `SELECT it.id, it.job_id, it.customer_name, it.window_start, it.window_end, it.duration_min
         FROM install_tasks it
         WHERE it.resource_id = $1
           AND it.status NOT IN ('complete', 'cancelled')
           AND (it.window_start::date = $2::date)
           AND NOT (
             it.window_end <= ($2 || ' ' || $3 || ':00-06')::timestamptz 
             OR it.window_start >= (($2 || ' ' || $3 || ':00-06')::timestamptz + ($4 || ' minutes')::interval)
           )
         ORDER BY it.window_start`,
        [resourceId, date, start, durationMin]
      );
      
      conflicts = rows;
      available = rows.length === 0;

      // Check capacity
      if (available) {
        const { rows: [capRow] } = await pool.query(
          `SELECT r.capacity_min_per_day,
                  COALESCE(SUM(it.duration_min), 0)::int AS day_load
           FROM resources r
           LEFT JOIN install_tasks it ON it.resource_id = r.id 
             AND it.window_start::date = $2::date
             AND it.status NOT IN ('complete', 'cancelled')
           WHERE r.id = $1
           GROUP BY r.id, r.capacity_min_per_day`,
          [resourceId, date]
        );
        
        if (capRow && capRow.capacity_min_per_day) {
          const newLoad = capRow.day_load + durationMin;
          if (newLoad > capRow.capacity_min_per_day) {
            available = false;
            conflicts.push({
              type: 'capacity',
              message: `Resource capacity exceeded: ${newLoad}/${capRow.capacity_min_per_day} min`
            });
          }
        }
      }
    }

    // Generate alternatives if not available
    let alternatives = [];
    if (!available) {
      alternatives = await findAlternatives(date, start, durationMin, resourceId);
    }

    res.json({
      available,
      conflicts,
      alternatives
    });
  } catch (e) {
    console.error('[AVAILABILITY] Error:', e);
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

/**
 * GET /api/availability/calendar
 * Query params:
 *   - start_date: YYYY-MM-DD
 *   - end_date: YYYY-MM-DD
 *   - duration: minutes
 *   - resource_id: (optional)
 * 
 * Returns array of days with availability info
 */
router.get('/calendar', async (req, res) => {
  try {
    const { start_date, end_date, duration, resource_id } = req.query;
    
    if (!start_date || !end_date || !duration) {
      return res.status(400).json({ error: 'missing_parameters' });
    }

    const durationMin = parseInt(duration, 10);
    const resourceId = resource_id ? parseInt(resource_id, 10) : null;

    // Get all tasks in the date range
    const query = resourceId
      ? `SELECT DATE(window_start AT TIME ZONE 'America/Denver') AS day,
                COUNT(*) AS task_count,
                SUM(duration_min) AS total_minutes,
                array_agg(json_build_object(
                  'start', window_start,
                  'end', window_end,
                  'duration', duration_min,
                  'customer', customer_name
                ) ORDER BY window_start) AS tasks
         FROM install_tasks
         WHERE resource_id = $1
           AND DATE(window_start AT TIME ZONE 'America/Denver') >= $2::date
           AND DATE(window_start AT TIME ZONE 'America/Denver') <= $3::date
           AND status NOT IN ('complete', 'cancelled')
         GROUP BY day
         ORDER BY day`
      : `SELECT DATE(window_start AT TIME ZONE 'America/Denver') AS day,
                COUNT(*) AS task_count,
                SUM(duration_min) AS total_minutes,
                array_agg(json_build_object(
                  'start', window_start,
                  'end', window_end,
                  'duration', duration_min,
                  'customer', customer_name,
                  'resource_id', resource_id
                ) ORDER BY window_start) AS tasks
         FROM install_tasks
         WHERE DATE(window_start AT TIME ZONE 'America/Denver') >= $1::date
           AND DATE(window_start AT TIME ZONE 'America/Denver') <= $2::date
           AND status NOT IN ('complete', 'cancelled')
         GROUP BY day
         ORDER BY day`;

    const params = resourceId ? [resourceId, start_date, end_date] : [start_date, end_date];
    const { rows } = await pool.query(query, params);

    // Get resource capacity if specific resource
    let capacity = null;
    if (resourceId) {
      const { rows: [capRow] } = await pool.query(
        `SELECT capacity_min_per_day FROM resources WHERE id = $1`,
        [resourceId]
      );
      capacity = capRow?.capacity_min_per_day || null;
    }

    // Process calendar data
    const calendar = rows.map(row => {
      const hasCapacity = capacity ? (row.total_minutes + durationMin <= capacity) : true;
      const slots = findAvailableSlots(row.tasks, durationMin);
      
      return {
        date: row.day,
        task_count: row.task_count,
        total_minutes: row.total_minutes,
        capacity,
        has_capacity: hasCapacity,
        available_slots: slots,
        tasks: row.tasks
      };
    });

    res.json(calendar);
  } catch (e) {
    console.error('[AVAILABILITY CALENDAR] Error:', e);
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

// Helper: Find alternative time slots
async function findAlternatives(requestedDate, requestedStart, durationMin, resourceId) {
  const alternatives = [];
  
  try {
    // Try same day, different times
    const sameDaySlots = await findSameDayAlternatives(requestedDate, durationMin, resourceId);
    alternatives.push(...sameDaySlots);

    // Try next 7 days
    if (alternatives.length < 5) {
      const nextDaysSlots = await findNextDaysAlternatives(requestedDate, durationMin, resourceId, 7);
      alternatives.push(...nextDaysSlots);
    }
  } catch (e) {
    console.error('[ALTERNATIVES] Error:', e);
  }

  return alternatives.slice(0, 5); // Return top 5 alternatives
}

async function findSameDayAlternatives(date, durationMin, resourceId) {
  const slots = [];
  
  // Get existing tasks for the day
  const query = resourceId
    ? `SELECT window_start, window_end 
       FROM install_tasks 
       WHERE resource_id = $1 
         AND DATE(window_start AT TIME ZONE 'America/Denver') = $2::date
         AND status NOT IN ('complete', 'cancelled')
       ORDER BY window_start`
    : `SELECT window_start, window_end 
       FROM install_tasks 
       WHERE DATE(window_start AT TIME ZONE 'America/Denver') = $1::date
         AND status NOT IN ('complete', 'cancelled')
       ORDER BY window_start`;
  
  const params = resourceId ? [resourceId, date] : [date];
  const { rows } = await pool.query(query, params);

  // Simple slot finding: try every hour from 8 AM to 4 PM (allowing for duration)
  for (let hour = 8; hour <= 16; hour++) {
    const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-06:00`);
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
    
    // Check if this slot conflicts with existing tasks
    const hasConflict = rows.some(task => {
      const taskStart = new Date(task.window_start);
      const taskEnd = new Date(task.window_end);
      
      return !(slotEnd <= taskStart || slotStart >= taskEnd);
    });

    if (!hasConflict) {
      slots.push({
        date,
        start: `${String(hour).padStart(2, '0')}:00`,
        type: 'same_day'
      });
    }
  }

  return slots;
}

async function findNextDaysAlternatives(startDate, durationMin, resourceId, days) {
  const slots = [];
  
  for (let i = 1; i <= days && slots.length < 3; i++) {
    const nextDate = new Date(startDate);
    nextDate.setDate(nextDate.getDate() + i);
    const dateStr = nextDate.toISOString().split('T')[0];
    
    const sameDaySlots = await findSameDayAlternatives(dateStr, durationMin, resourceId);
    if (sameDaySlots.length > 0) {
      slots.push({
        date: dateStr,
        start: sameDaySlots[0].start,
        type: 'next_day',
        days_out: i
      });
    }
  }

  return slots;
}

function findAvailableSlots(tasks, durationMin) {
  const slots = [];
  const workStart = 8 * 60; // 8:00 AM in minutes
  const workEnd = 17 * 60;  // 5:00 PM in minutes

  // Convert tasks to minute ranges
  const busyRanges = tasks.map(t => {
    const start = new Date(t.start);
    const end = new Date(t.end);
    return {
      start: start.getHours() * 60 + start.getMinutes(),
      end: end.getHours() * 60 + end.getMinutes()
    };
  }).sort((a, b) => a.start - b.start);

  // Find gaps
  let currentTime = workStart;
  for (const busy of busyRanges) {
    if (busy.start - currentTime >= durationMin) {
      const hour = Math.floor(currentTime / 60);
      const minute = currentTime % 60;
      slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
    currentTime = Math.max(currentTime, busy.end);
  }

  // Check end of day
  if (workEnd - currentTime >= durationMin) {
    const hour = Math.floor(currentTime / 60);
    const minute = currentTime % 60;
    slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }

  return slots;
}

export default router;
