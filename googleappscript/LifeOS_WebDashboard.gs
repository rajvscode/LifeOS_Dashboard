/******************************************************
 * 🧠 LIFEOS WEB DASHBOARD API (v10.6)
 ******************************************************/

function getDailyQuote() {
  const quotes = [
    "Discipline is the bridge between goals and accomplishment. 🌿",
    "Your body listens to everything your mind says — train both. 💫",
    "Every sunrise brings a new chance to improve yourself. ☀️",
    "Do something today your future self will thank you for. 🌱",
    "Consistency is more powerful than motivation. ⚡"
  ];
  return quotes[new Date().getDate() % quotes.length];
}

function getYesterdayStats() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Tracker_Backup");
  const tz = Session.getScriptTimeZone();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yStr = Utilities.formatDate(y, tz, "dd/MM/yyyy");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const dIdx = headers.indexOf("Date"), sIdx = headers.indexOf("Status");
  let done=0, miss=0, prog=0, total=0;
  for (let i=1;i<data.length;i++){
    const row = data[i];
    const d = Utilities.formatDate(new Date(row[dIdx]), tz, "dd/MM/yyyy");
    if (d===yStr){
      total++;
      const s=(row[sIdx]||"").toLowerCase();
      if (s==="done") done++;
      else if (s==="missed") miss++;
      else if (s.includes("progress")) prog++;
    }
  }
  const pct = total ? Math.round((done/total)*100):0;
  return `🕒 Yesterday: ${done} Done | ${miss} Missed | ${prog} In Progress → ${pct}% Complete ✅`;
}

function normalizeDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d);
  const parts = d.split(/[\/-]/);
  if (parts.length === 3 && parts[2].length === 4)
    return new Date(parts[2], parts[1] - 1, parts[0]);
  return new Date(d);
}

function extractKeyFromDescription(desc) {
  if (!desc) return "";
  const match = desc.toString().match(/Key[^A-Za-z0-9]*([A-Za-z0-9-]+)/i);
  return match ? match[1].trim() : "";
}


function getUpcomingTasks(forTomorrow = false) {
  const { sheet, headers, rows, headerRow } = _readSheetWithHeader("Tracker_Backup");
  if (!sheet || !rows.length) return { tasks: [] };

  const findCol = (name) =>
    headers.findIndex((h) => h && h.toString().trim().toLowerCase() === name.toLowerCase());

  const dateIdx = findCol("date");
  const startIdx = findCol("start");
  const endIdx = findCol("end");
  const catIdx = findCol("category");
  const taskIdx = findCol("task");
  const noteIdx = findCol("notes");
  const statusIdx = findCol("status");
  const descIdx = findCol("description");

  const tz = "Asia/Kolkata";
  const now = new Date();

  // 🔄 Determine target date
  const targetDate = new Date(now);
  if (forTomorrow) targetDate.setDate(targetDate.getDate() + 1);
  const targetStr = Utilities.formatDate(targetDate, tz, "yyyy-MM-dd");

  const tasks = [];
  const updates = [];

  rows.forEach((r, i) => {
    const rawDate = r[dateIdx];
    if (!rawDate) return;

    const dateObj = normalizeDate(rawDate);
    const dateStr = Utilities.formatDate(dateObj, tz, "yyyy-MM-dd");

    // Skip rows that don’t match our target date
    if (dateStr !== targetStr) return;

    // Build full datetime using the task’s actual date
    const startRaw = r[startIdx];
    const endRaw = r[endIdx];
    const startTime = Utilities.formatDate(startRaw instanceof Date ? startRaw : new Date(startRaw), tz, "HH:mm");
    const endTime = Utilities.formatDate(endRaw instanceof Date ? endRaw : new Date(endRaw), tz, "HH:mm");

    // Build real Date objects anchored to the same date as task
    const startObj = new Date(`${dateStr}T${startTime}:00+05:30`);
    const endObj = new Date(`${dateStr}T${endTime}:00+05:30`);

    let status = (r[statusIdx] || "Created").trim();

    // ✅ Auto-update ONLY if today
    if (!forTomorrow && !["Done", "Missed"].includes(status)) {
      const nowMs = now.getTime();
      if (nowMs >= startObj.getTime() && nowMs <= endObj.getTime() && status !== "In Progress") {
        status = "In Progress";
        updates.push({ row: i + headerRow + 2, value: status });
      } else if (nowMs > endObj.getTime()) {
        status = "Missed";
        updates.push({ row: i + headerRow + 2, value: status });
      }
    }

    tasks.push({
      row: i + headerRow + 2,
      date: dateStr,
      start: startTime,
      end: endTime,
      category: r[catIdx],
      task: r[taskIdx],
      notes: r[noteIdx],
      description: r[descIdx],
      key: extractKeyFromDescription(r[descIdx]),
      status,
    });
  });

  // 🔒 Batch update only if needed
  if (updates.length) {
    const statusColLetter = String.fromCharCode(65 + statusIdx);
    updates.forEach((u) => sheet.getRange(`${statusColLetter}${u.row}`).setValue(u.value));
  }

  // ✅ Sort tasks by start time
  tasks.sort((a, b) => a.start.localeCompare(b.start));

  Logger.log(
    `✅ Loaded ${tasks.length} ${forTomorrow ? "tomorrow" : "today"} tasks (${updates.length} auto-updated)`
  );

  // 🕒 Build next task label
  let nextLabel = "";
  let voiceReminder = "";

  if (!forTomorrow) {
    const nowMs = now.getTime();
    const future = tasks
      .filter((t) => !["Done", "Missed"].includes(t.status))
      .map((t) => ({
        ...t,
        startMs: new Date(`${t.date}T${t.start}:00+05:30`).getTime(),
      }))
      .filter((t) => t.startMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (future.length > 0) {
      const next = future[0];
      const start = new Date(next.startMs);
      const formatted = Utilities.formatDate(start, tz, "hh:mm a");
      const diffMs = next.startMs - nowMs;
      const mins = Math.floor(diffMs / 60000);
      const hrs = Math.floor(mins / 60);
      const minsLeft = mins % 60;
      const countdown = hrs > 0 ? `${hrs}h ${minsLeft}m` : `${minsLeft}m`;

      nextLabel = `🕒 Next: ${next.task} (${formatted}) • ⏳ ${countdown}`;
      voiceReminder = `Your next task ${next.task} starts at ${formatted}`;
    }
  } else {
    nextLabel = `🌅 Tomorrow: ${tasks.length} planned task${tasks.length !== 1 ? "s" : ""}`;
  }

  return { tasks, nextLabel, voiceReminder };
}





/**
 * ✅ When user marks Done/Missed, update both Tracker & Backup
 */
function updateStatus(row, newStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backup = ss.getSheetByName("Tracker_Backup");
  const tracker = ss.getSheetByName("Tracker");
  if (!backup || !tracker) throw new Error("❌ Missing required sheets");

  const data = backup.getDataRange().getValues();
  let headerRow = data.findIndex(r => r.join("").toLowerCase().includes("event id"));
  if (headerRow === -1) headerRow = 1;
  const headers = data[headerRow];
  const statusIdx = headers.findIndex(h => h.toString().toLowerCase().trim() === "status");
  const statusTimeIdx = headers.findIndex(h => h.toString().toLowerCase().trim() === "statustime");
  const titleIdx = headers.findIndex(h => h.toString().toLowerCase().trim() === "title");

  const statusCell = backup.getRange(row, statusIdx + 1);
  const timeCell = statusTimeIdx !== -1 ? backup.getRange(row, statusTimeIdx + 1) : null;
  const title = backup.getRange(row, titleIdx + 1).getValue();
  const now = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd-MMM-yyyy HH:mm:ss");

  statusCell.setValue(newStatus);
  if (timeCell) timeCell.setValue(now);

  // Also update in Tracker sheet (match by Title)
  const tData = tracker.getDataRange().getValues();
  const tHeaderRow = tData.findIndex(r => r.join("").toLowerCase().includes("event id")) || 1;
  const tHeaders = tData[tHeaderRow];
  const tStatusIdx = tHeaders.indexOf("Status");
  const tTitleIdx = tHeaders.indexOf("Title");

  for (let i = tHeaderRow + 1; i < tData.length; i++) {
    const tTitle = (tData[i][tTitleIdx] || "").trim();
    if (tTitle === title) {
      tracker.getRange(i + 1, tStatusIdx + 1).setValue(newStatus);
      tracker.getRange(i + 1, tStatusIdx + 2).setValue(now);
      break;
    }
  }

  Logger.log(`✅ Updated status in both sheets: ${title} → ${newStatus}`);
}

/** Daily Performance (for Dashboard) */
function getDailyStats() {
  const { headers, rows } = _readSheetWithHeader(BACKUP_SHEET);
  const dateIdx = headers.indexOf("Date");
  const statusIdx = headers.indexOf("Status");
  const today = Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy");

  let stats = { done: 0, missed: 0, progress: 0, pending: 0 };
  rows.forEach(r => {
    const d = Utilities.formatDate(new Date(r[dateIdx]), TZ, "dd/MM/yyyy");
    if (d === today) {
      const s = (r[statusIdx] || "").trim();
      if (s === "Done") stats.done++;
      else if (s === "Missed") stats.missed++;
      else if (s === "In Progress") stats.progress++;
      else stats.pending++;
    }
  });

  const total = stats.done + stats.missed + stats.progress + stats.pending;
  stats.total = total;
  stats.completion = total ? Math.round((stats.done / total) * 100) : 0;
  return stats;
}

/** Weekly/Monthly stats for graphs */
/**
 * 📊 LifeOS v10.7 – Corrected Range-Aware Stats
 * Supports 1-day, 7-day, and 30-day modes
 * Filters future tasks, fixes serial dates, produces valid trend data.
 */
function getStats(rangeDays) {
  const SHEET_NAME = "Tracker_Backup";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("⚠️ Missing Tracker_Backup sheet");

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { stats: {}, trendData: [] };

  // locate header row
  let headerRow = data.findIndex(r => r.join("").toLowerCase().includes("event id"));
  if (headerRow === -1) headerRow = 1;
  const headers = data[headerRow];
  const rows = data.slice(headerRow + 1);

  const tz = "Asia/Kolkata";
  const colIndex = name =>
    headers.findIndex(h => h && h.toString().trim().toLowerCase() === name.toLowerCase());
  const dateCol = colIndex("date");
  const statusCol = colIndex("status");

  const stats = { Done: 0, "In Progress": 0, Pending: 0, Missed: 0 };
  const trendMap = {};

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = new Date(todayStart.getTime() - (rangeDays - 1) * 86400000);

  rows.forEach(r => {
    try {
      let rawDate = r[dateCol];
      if (!rawDate) return;

      // normalize date
      let dateObj;
      if (rawDate instanceof Date) dateObj = rawDate;
      else if (typeof rawDate === "number")
        dateObj = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
      else if (typeof rawDate === "string") dateObj = new Date(rawDate);
      else return;
      if (!dateObj || isNaN(dateObj)) return;

      // ignore future dates
      if (dateObj > now) return;
      // ignore older than cutoff
      if (dateObj < cutoff) return;

      const dateKey = Utilities.formatDate(dateObj, tz, "dd-MMM");
      const status = (r[statusCol] || "").trim();

      if (!trendMap[dateKey]) trendMap[dateKey] = { done: 0, total: 0 };
      trendMap[dateKey].total++;

      if (status === "Done") {
        stats.Done++;
        trendMap[dateKey].done++;
      } else if (status === "Missed") stats.Missed++;
      else if (status === "In Progress") stats["In Progress"]++;
      else stats.Pending++;
    } catch (err) {
      Logger.log("⚠️ Bad row: " + err.message);
    }
  });

  // build trendData for charts
  const trendData = Object.entries(trendMap)
    .sort((a, b) => {
      const da = new Date(a[0] + " 2025");
      const db = new Date(b[0] + " 2025");
      return da - db;
    })
    .map(([day, d]) => ({
      day,
      percent: Math.round((d.done / d.total) * 100),
    }));

  Logger.log(`📈 Stats (${rangeDays}d): ${JSON.stringify(stats)}`);
  return { stats, trendData };
}





/******************************************************
 * 🌿 LifeOS Web Entry Point — doGet()
 * Serves the index.html dashboard for LifeOS Web App
 ******************************************************/
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("🌿 LifeOS Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
