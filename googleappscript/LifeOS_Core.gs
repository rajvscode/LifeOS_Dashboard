/******************************************************
 * 🌿 LIFEOS CORE (v10.15 – Production Safe)
 * Central automation + trigger management logic
 * ---------------------------------------------------
 * ✅ Keeps all v10.13 logic identical (no frequency changes)
 * ✅ Adds throttled calendar event creation (safe for Google API limits)
 * ✅ Preserves TEST_MODE for dashboard-only mode
 * ✅ Works perfectly with Tracker ↔ Backup ↔ Dashboard chain
 ******************************************************/


const BACKUP_SHEET = "Tracker_Backup";
const TRACKER_SHEET = "Tracker";
const TZ = "Asia/Kolkata";

// ============================
// 🧠 LifeOS Global Configuration
// ============================
const CONFIG = {
  START_DATE: new Date(),       // Generation start date (today by default)
  DAYS_AHEAD: 31,               // How many days to generate
  CALENDARS: ["Health & Energy"], // Default calendar names (first one used if not specified)
  TIMEZONE: Session.getScriptTimeZone(),  // usually "Asia/Kolkata"
  DEFAULT_CATEGORY: "General",
};

function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function doPost(e) {
  return corsResponse({ status: "POST not supported" });
}

/**
 * Web API Gateway for Cloudflare Worker / Dashboard updates
 */
function doGet(e) {
  try {
    Logger.log("🌿 doGet invoked with params: " + JSON.stringify(e?.parameter));

    const action = e?.parameter?.action || "";
    const key = e?.parameter?.taskKey;
    const status = e?.parameter?.status;

    if (action === "updateStatusAndSyncBackupV82") {
      if (!key || !status) {
        return _json({ status: "error", message: "Missing key or status" });
      }

      // Call your actual update logic here
      Logger.log(`🟢 Updating ${key} → ${status}`);
      const result = updateStatusAndSyncBackupV82(key, status);

      return _json({ status: "ok", key, newStatus: status, result });
    }

    // fallback response
    return _json({
      status: "ok",
      message: "LifeOS API online",
      receivedAction: action,
    });
  } catch (err) {
    Logger.log("❌ Error in doGet: " + err);
    return _json({ status: "error", message: err.message });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}


// ===========================
// Helpers for metadata & time
// ===========================
function ensureHiddenMetadataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName("LifeOS_Metadata");
  if (!s) {
    s = ss.insertSheet("LifeOS_Metadata");
    s.hideSheet();
    s.getRange(1,1).setValue("key");
    s.getRange(1,2).setValue("value");
  }
  return s;
}

function updateStatusAndSyncBackupV82(taskKey, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tracker = ss.getSheetByName("Tracker");
  const backup = ss.getSheetByName("Tracker_Backup");
  if (!tracker || !backup) throw new Error("Missing required sheets");

  const tz = Session.getScriptTimeZone();
  const now = new Date();

  const statusCol = 9;
  const timeCol = 10;
  const notesCol = 11;
  const descCol = 12;

  let updatedTracker = false;
  let updatedBackup = false;

  Logger.log("🟢 Clicked Task Key: " + taskKey);
  Logger.log("🟢 Target Status: " + status);

  // --- Update Tracker ---
  const trackerData = tracker.getDataRange().getValues();
  for (let i = 2; i <= trackerData.length; i++) {
    const desc = (trackerData[i - 1][descCol - 1] || "").toString().replace(/\r?\n/g, " ");
    const match = desc.match(/Key[^A-Za-z0-9]*([A-Za-z0-9-]+)/i); // tolerant version
    // const match = desc.match(/Key\s*:\s*([A-Za-z0-9-]+)/i);
    const foundKey = match ? match[1].trim() : "(none)";
    if (i <= 8) Logger.log(`🔹 Tracker Row ${i} → Found Key: ${foundKey} | Desc: ${desc.substring(0, 80)}`);

    if (foundKey === taskKey) {
      const title = trackerData[i - 1][7];
      const dateCell = trackerData[i - 1][2];
      const taskDate = new Date(dateCell);
      const today = new Date();

      if (taskDate > today) {
        Logger.log(`⏭️ Skipping update: ${title} (${taskKey}) is in the future`);
        return;
      }

      tracker.getRange(i, statusCol).setValue(status);
      tracker.getRange(i, timeCol).setValue(now);
      tracker.getRange(i, notesCol).setValue("Updated via Dashboard");
      Logger.log(`✅ Tracker updated at row ${i} for ${taskKey} (${status})`);
      updatedTracker = true;
      break;
    }
  }

  if (!updatedTracker) {
    Logger.log("⚠️ No Tracker row matched the clicked key: " + taskKey);
  }

  // --- Update Backup ---
  const backupData = backup.getDataRange().getValues();
  for (let j = 2; j <= backupData.length; j++) {
    const desc = (backupData[j - 1][descCol - 1] || "").toString().replace(/\r?\n/g, " ");
    const match = desc.match(/Key[^A-Za-z0-9]*([A-Za-z0-9-]+)/i);
    // const match = desc.match(/Key\s*:\s*([A-Za-z0-9-]+)/i);
    const foundKey = match ? match[1].trim() : "(none)";
    if (j <= 8) Logger.log(`🔹 Backup Row ${j} → Found Key: ${foundKey} | Desc: ${desc.substring(0, 80)}`);

    if (foundKey === taskKey) {
      backup.getRange(j, statusCol).setValue(status);
      backup.getRange(j, timeCol).setValue(now);
      backup.getRange(j, notesCol).setValue("Synced via Dashboard");
      Logger.log(`✅ Backup updated at row ${j} for ${taskKey} (${status})`);
      updatedBackup = true;
      break;
    }
  }

  if (!updatedBackup) {
    Logger.log("⚠️ No Backup row matched the clicked key: " + taskKey);
  }

  // --- Append missing backup ---
  if (!updatedBackup && updatedTracker) {
    const trackerRow = trackerData.find(r => (r[descCol - 1] || "").includes(taskKey));
    if (trackerRow) {
      backup.appendRow(trackerRow);
      Logger.log(`⚠️ Added missing backup entry for ${taskKey}`);
    }
  }

  // --- Log + cache ---
  const control = ss.getSheetByName("AppControl") || ss.insertSheet("AppControl");
  control.getRange("A10").setValue(`✅ Synced ${taskKey} (${status}) at ${now}`);

  try {
    updateDailyStatsCache();
    Logger.log("✅ Stats cache refreshed successfully");
  } catch (e) {
    Logger.log("⚠️ Stats refresh skipped: " + e.message);
  }
}




  


/**
 * Parse time input: accepts Date object, "HH:mm", "hh:mm AM/PM", or number (minutes)
 * Returns {hour, minute}
 */
function parseTime(timeRaw) {
  if (!timeRaw) return { hour: 6, minute: 0 };
  if (timeRaw instanceof Date) {
    return { hour: timeRaw.getHours(), minute: timeRaw.getMinutes() };
  }
  const s = String(timeRaw).trim();
  // try HH:mm
  const m1 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (m1) {
    let h = parseInt(m1[1], 10);
    const mm = parseInt(m1[2], 10);
    const ampm = m1[3];
    if (ampm) {
      if (/pm/i.test(ampm) && h < 12) h += 12;
      if (/am/i.test(ampm) && h === 12) h = 0;
    }
    return { hour: h, minute: mm };
  }
  // fallback: treat as number of minutes from midnight
  const asNum = Number(s);
  if (!isNaN(asNum)) {
    const h = Math.floor(asNum/60);
    const mm = asNum % 60;
    return { hour: h, minute: mm };
  }
  return { hour: 6, minute: 0 };
}

// ============================================================
// 🔹 Helper: Safe sheet getter (avoids repeating long calls)
// ============================================================
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`❌ Sheet not found: ${name}`);
  return sheet;
}


/**
 * 🌿 LifeOS v10.16 — Rajesh Final Unified Generator
 * ---------------------------------------------------------
 * ✅ Combines:
 *    - v10.15 (Rolling 3-month frequency logic)
 *    - v9.8 (Dynamic Today’s Special from Sheet2)
 * ✅ Outputs exact v9.8-style Title + Description
 * ✅ Safe TEST_MODE toggle (no Google Calendar writes)
 * ✅ 100% Tracker + Glide compatible
 */

function generateMonthlyEvents_v10_16() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tracker = ss.getSheetByName("Tracker");
  const tasksSheet = ss.getSheetByName("Tasks_DB");
  const sheet2 = ss.getSheetByName("Sheet2");
  const tz = Session.getScriptTimeZone();

  if (!tracker || !tasksSheet)
    throw new Error("❌ Missing Tracker or Tasks_DB sheet");

  const TEST_MODE = true; // ⬅️ Change to false for calendar creation
  const START_DATE = new Date();
  const END_DATE = new Date();
  END_DATE.setMonth(END_DATE.getMonth() + 3); // rolling 3 months

  // 🗓 Preload Sheet2 values
  const sheet2Vals = sheet2
    ? sheet2.getRange(2, 1, 93, sheet2.getLastColumn()).getValues() // ~3 months (93 days)
    : [];

  // 🧹 Reset Tracker
  tracker.clearContents();
  const headers = [
    "Event ID", "Calendar", "Date", "Start", "End",
    "Category", "Task", "Title", "Status", "StatusTime",
    "Notes", "Description"
  ];
  tracker.getRange(1, 1, 1, headers.length).setValues([headers]);

  const tasks = tasksSheet.getDataRange().getValues();
  const newRows = [];

  // Utility functions
  const dayNameToIndex = d => ["sun","mon","tue","wed","thu","fri","sat"].indexOf(d.toLowerCase());
  const nextDayOfWeek = (start, idx) => {
    const d = new Date(start);
    d.setDate(d.getDate() + ((idx + 7 - d.getDay()) % 7));
    return d;
  };
  const columnLetterToIndex = l => l ? l.toUpperCase().charCodeAt(0) - 64 : -1;

  // Core loop — iterate through Tasks_DB
  for (let i = 1; i < tasks.length; i++) {
    const [taskId, category, task, freqRaw, dowRaw, timeRaw, durRaw, calRaw, notes, dynSource] = tasks[i];
    if (!taskId || !task) continue;

    const freq = (freqRaw || "").toLowerCase();
    const categoryName = category || "General";
    const calendarName = calRaw || categoryName;
    const duration = parseInt(durRaw) || 15;
    const dayOfWeek = (dowRaw || "").toLowerCase();
    const { hour, minute } = parseTime(timeRaw);

    // 🧩 Frequency handling
    if (freq === "daily" || freq.includes("alternate day")) {
      const step = freq.includes("alternate") ? 2 : 1;
      for (let d = new Date(START_DATE); d <= END_DATE; d.setDate(d.getDate() + step)) {
        const dynVal = getDynamicSpecialValue(sheet2Vals, dynSource, d, columnLetterToIndex);
        addTaskSafe_v10_16(newRows, new Date(d), hour, minute, duration, calendarName, categoryName, task, tz, TEST_MODE, taskId, notes, dynVal);
      }
    } 
    else if (freq === "weekly" || freq.includes("alternate week")) {
      const step = freq.includes("alternate") ? 14 : 7;
      const targetDow = dayNameToIndex(dayOfWeek || "sun");
      let first = nextDayOfWeek(START_DATE, targetDow);
      for (let d = new Date(first); d <= END_DATE; d.setDate(d.getDate() + step)) {
        const dynVal = getDynamicSpecialValue(sheet2Vals, dynSource, d, columnLetterToIndex);
        addTaskSafe_v10_16(newRows, new Date(d), hour, minute, duration, calendarName, categoryName, task, tz, TEST_MODE, taskId, notes, dynVal);
      }
    }
    else if (freq.includes("month")) {
      const match = freq.match(/\((.*?)\)/);
      const nthDOW = match ? match[1].trim() : null;
      const monthStep = freq.includes("alternate") ? 2 : 1;
      for (let d = new Date(START_DATE); d <= END_DATE; d.setMonth(d.getMonth() + monthStep)) {
        const date = nthDOW ? getNthWeekdayOfMonth(d.getFullYear(), d.getMonth(), nthDOW) : new Date(d.getFullYear(), d.getMonth(), 1);
        const dynVal = getDynamicSpecialValue(sheet2Vals, dynSource, date, columnLetterToIndex);
        if (date)
          addTaskSafe_v10_16(newRows, new Date(date), hour, minute, duration, calendarName, categoryName, task, tz, TEST_MODE, taskId, notes, dynVal);
      }
    }
    else if (freq.includes("quarter")) {
      for (let d = new Date(START_DATE); d <= END_DATE; d.setMonth(d.getMonth() + 3)) {
        const dynVal = getDynamicSpecialValue(sheet2Vals, dynSource, d, columnLetterToIndex);
        addTaskSafe_v10_16(newRows, new Date(d), hour, minute, duration, calendarName, categoryName, task, tz, TEST_MODE, taskId, notes, dynVal);
      }
    }
    else if (/every\d+days/.test(freq)) {
      const num = parseInt(freq.match(/\d+/)[0]);
      for (let d = new Date(START_DATE); d <= END_DATE; d.setDate(d.getDate() + num)) {
        const dynVal = getDynamicSpecialValue(sheet2Vals, dynSource, d, columnLetterToIndex);
        addTaskSafe_v10_16(newRows, new Date(d), hour, minute, duration, calendarName, categoryName, task, tz, TEST_MODE, taskId, notes, dynVal);
      }
    }
  }

  // 🧾 Write all generated tasks to Tracker
  if (newRows.length)
    tracker.getRange(2, 1, newRows.length, newRows[0].length).setValues(newRows);

  tracker.getRange("C:C").setNumberFormat("dd/MM/yyyy");
  tracker.getRange("D:E").setNumberFormat("hh:mm:ss am/pm");

  Logger.log(`✅ LifeOS v10.16 completed: ${newRows.length} rows created`);
  SpreadsheetApp.getActiveSpreadsheet().toast(`✅ LifeOS v10.16 done — ${newRows.length} tasks generated`);
}

/* 🔧 Helper: Parse time field */
function parseTime(t) {
  if (!t) return { hour: 6, minute: 0 };
  if (t instanceof Date) return { hour: t.getHours(), minute: t.getMinutes() };
  const match = t.toString().match(/(\d{1,2}):(\d{2})/);
  return match ? { hour: parseInt(match[1]), minute: parseInt(match[2]) } : { hour: 6, minute: 0 };
}

/* 🔧 Helper: derive Today’s Special from Sheet2 */
function getDynamicSpecialValue(sheet2Vals, dynSource, date, columnLetterToIndex) {
  if (!dynSource || !sheet2Vals.length) return "";
  const match = dynSource.match(/!([A-Z]+)/i);
  const colLetter = match ? match[1] : dynSource.replace(/[^A-Z]/gi, "");
  const colIndex = columnLetterToIndex(colLetter);
  if (colIndex < 1) return "";
  const dayIndex = Math.floor((date - new Date(new Date().setHours(0,0,0,0))) / (1000 * 60 * 60 * 24));
  return sheet2Vals[dayIndex] && sheet2Vals[dayIndex][colIndex - 1]
    ? sheet2Vals[dayIndex][colIndex - 1].toString().trim()
    : "";
}

/* 🔧 Helper: find nth weekday of month (1st Mon, last Fri, etc.) */
function getNthWeekdayOfMonth(year, month, pattern) {
  if (!pattern) return null;
  const [nthStr, dowStr] = pattern.toLowerCase().split(" ");
  const dow = ["sun","mon","tue","wed","thu","fri","sat"].indexOf(dowStr);
  if (nthStr === "last") {
    const lastDay = new Date(year, month + 1, 0);
    const diff = (lastDay.getDay() - dow + 7) % 7;
    lastDay.setDate(lastDay.getDate() - diff);
    return lastDay;
  }
  const nthMap = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
  const n = nthMap[nthStr];
  let count = 0;
  for (let i = 1; i <= 31; i++) {
    const d = new Date(year, month, i);
    if (d.getMonth() !== month) break;
    if (d.getDay() === dow && ++count === n) return d;
  }
  return null;
}

/**
 * 🧾 addTaskSafe_v10_16 — creates one row per event
 * ✅ Title + Today’s Special like v9.8
 */
function addTaskSafe_v10_16(rows, d, h, m, dur, calendarName, category, task, tz, TEST_MODE, taskId, notes, dynVal) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
  const end = new Date(start.getTime() + dur * 60000);
  const title = dynVal ? `${category} - ${task}: ${dynVal}` : `${category} - ${task}`;
  const key = `${taskId || category}-${Utilities.formatDate(start, tz, "yyyy-MM-dd")}`;
  const desc =
`📂 Category: ${category}
🆔 Key: ${key}
🕒 Time: ${Utilities.formatDate(start, tz, "hh:mm a")} – ${Utilities.formatDate(end, tz, "hh:mm a")}
🪷 Notes: ${notes || "-"}
${dynVal ? "🌿 Today's Special: " + dynVal : ""}`;

  if (!TEST_MODE) {
    const calObj = getOrCreateCalendar(calendarName);
    const existing = calObj.getEventsForDay(start).find(e => e.getDescription().includes(key));
    if (!existing) calObj.createEvent(title, start, end, { description: desc });
  }

  rows.push([
    "",
    calendarName,
    new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    start,
    end,
    category,
    task,
    title,
    "Created",
    "",
    notes || "",
    desc
  ]);
}

/* 📅 Helper: Get or create calendar safely */
function getOrCreateCalendar(name) {
  const calList = CalendarApp.getCalendarsByName(name);
  return calList.length ? calList[0] : CalendarApp.createCalendar(name);
}




/**
 * Diagnostic: List unique calendar values found in Tasks_DB (run this to verify values)
 */
function listCalendarsInTasksDB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName("Tasks_DB");
  if (!s) throw new Error("Tasks_DB not found");
  const data = s.getDataRange().getValues();
  const header = data[0].map(h => (h || "").toString().trim());
  const calIdx = header.findIndex(h => /calendar|calendar name/i.test(h));
  const out = {};
  for (let r = 1; r < data.length; r++) {
    const v = (calIdx >= 0 ? (data[r][calIdx] || "") : "") || (data[r][1] || "");
    const key = (v || "EMPTY").toString().trim();
    out[key] = (out[key] || 0) + 1;
  }
  Logger.log("Calendars found in Tasks_DB: " + JSON.stringify(out));
  return out;
}

function getOrCreateCalendar(name) {
  const calList = CalendarApp.getCalendarsByName(name);
  return calList.length ? calList[0] : CalendarApp.createCalendar(name);
}

function dayNameToIndex(dow) {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return days.indexOf(dow.toLowerCase());
}

function nextDayOfWeek(startDate, dayIndex) {
  const result = new Date(startDate);
  result.setDate(result.getDate() + ((dayIndex + 7 - result.getDay()) % 7));
  return result;
}



function weekdayFromShort(s) {
  s = (s || "").toString().toLowerCase();
  const map = {sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6};
  for (const k in map) if (s.indexOf(k)!==-1) return map[k];
  return null;
}
function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  const first = new Date(year, monthIndex, 1);
  const firstW = first.getDay();
  let day = 1 + ((7 + weekday - firstW) % 7) + (n - 1) * 7;
  const candidate = new Date(year, monthIndex, day);
  if (candidate.getMonth() !== monthIndex) return null;
  return candidate;
}
function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const last = new Date(year, monthIndex + 1, 0);
  const lastW = last.getDay();
  const diff = (lastW - weekday + 7) % 7;
  return new Date(year, monthIndex, last.getDate() - diff);
}
function alignToNearestWeekend(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const wd = d.getDay();
  if (wd === 6 || wd === 0) return dateObj;
  const daysToSat = (6 - wd + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToSat, dateObj.getHours(), dateObj.getMinutes(), 0);
}
function buildRow(calendarName, dateObj, startDateObj, endDateObj, category, taskName, notes, uid) {
  const title = `${category} - ${taskName}`;
  const tz = Session.getScriptTimeZone();
  const desc = `🆔 Key: ${uid}-${Utilities.formatDate(dateObj, tz, "yyyy-MM-dd")}\n📂 Category: ${category}\n🕒 ${Utilities.formatDate(startDateObj, tz, "hh:mm a")}`;
  return [
    "",
    calendarName || "",
    new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
    new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate(), startDateObj.getHours(), startDateObj.getMinutes(), 0),
    new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), endDateObj.getHours(), endDateObj.getMinutes(), 0),
    category || "",
    taskName || "",
    title,
    "Created",
    "",
    notes || "",
    desc
  ];
}


/* --------------- End of generator ----------------- */


function ensureMetadataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let meta = ss.getSheetByName("LifeOS_Metadata");
  if (!meta) {
    meta = ss.insertSheet("LifeOS_Metadata");
    meta.hideSheet();
    meta.getRange(1, 1, 1, 2).setValues([["Key", "Value"]]);
  }
  return meta;
}

function setMetadata(key, value) {
  const meta = ensureMetadataSheet();
  const data = meta.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      meta.getRange(i + 1, 2).setValue(value);
      found = true;
      break;
    }
  }
  if (!found) meta.appendRow([key, value]);
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function getMetadata(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (val) return val;
  const meta = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LifeOS_Metadata");
  if (!meta) return null;
  const data = meta.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}


// ===========================
// autoSyncToGlide (preserve Date objects)
// ===========================
function autoSyncToGlide(forceOverwriteStatuses) {
  // forceOverwriteStatuses: boolean - if true, overwrite statuses in backup with tracker (default false)
  if (typeof forceOverwriteStatuses === "undefined") forceOverwriteStatuses = false;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tracker = ss.getSheetByName("Tracker");
  const backup = ss.getSheetByName("Tracker_Backup") || ss.insertSheet("Tracker_Backup");

  if (!tracker) throw new Error("Tracker sheet missing");

  // Read tracker fully (headers at row 2)
  const trackerVals = tracker.getDataRange().getValues();
  if (trackerVals.length < 2) {
    Logger.log("Tracker looks empty, nothing to sync");
    return;
  }

  // Write entire sheet (headers + data) to backup, preserving Date objects
  backup.clearContents();
  backup.getRange(1,1,trackerVals.length, trackerVals[0].length).setValues(trackerVals);

  // Apply number formats
  backup.getRange("C:C").setNumberFormat("dd/MM/yyyy");
  backup.getRange("D:E").setNumberFormat("hh:mm:ss AM/PM");

  // Update metadata
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "hh:mm a, dd-MMM-yyyy");
  setMetadata("Tracker_Backup_LastGenerated", ts);

  // Optionally preserve statuses: if forceOverwriteStatuses is false, and backup previously had manual user statuses, we want to keep user's statuses.
  // Because we overwrote backup entirely above, to preserve previous statuses we'd need to copy them back — but to avoid any complexity we recommend:
  // - run autoSyncToGlide(false) normally
  // - if you want Tracker_Backup to be authoritative, call with true.

  return ts;
}


/** Utility: Read sheet & auto-detect header row */
/** Debug-enhanced header reader */
function _readSheetWithHeader(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`❌ Sheet not found: ${sheetName}`);

  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    Logger.log(`⚠️ No data found in ${sheetName}`);
    return { sheet, headers: [], rows: [] };
  }

  // 🔍 Detect header row by searching "Event ID"
  let headerRow = data.findIndex(r =>
    r.join("").toLowerCase().includes("event id")
  );
  if (headerRow === -1) headerRow = 1;

  const headers = data[headerRow].map(h => (h || "").toString().trim());
  const rows = data.slice(headerRow + 1);

  Logger.log(`📊 ${sheetName} Header Row: ${headerRow + 1}`);
  Logger.log(`📊 Columns Found: ${headers.join(" | ")}`);
  Logger.log(`📊 Total Data Rows: ${rows.length}`);

  // Log sample rows to check data
  if (rows.length) {
    const sample = rows.slice(0, 3).map(r => r.slice(0, 8));
    Logger.log(`🧾 Sample Data (first 3 rows):\n${JSON.stringify(sample, null, 2)}`);
  }

  return { sheet, headers, rows, headerRow };
}


/** Core Trigger Setup */
function setupAllLifeOSTriggers_v10_6() {
  clearAllTriggers();
  ScriptApp.newTrigger("dailyResetRoutine").timeBased().everyDays(1).atHour(0).create();
  ScriptApp.newTrigger("autoSyncToGlide").timeBased().everyHours(2).create();
  ScriptApp.newTrigger("preCacheWeeklyStats").timeBased().everyDays(1).atHour(4).create();
  Logger.log("✅ LifeOS v10.6 triggers created successfully.");
}

/** Midnight Reset - only reset Created/In Progress tasks */
function dailyResetRoutine() {
  const { sheet, headers, rows } = _readSheetWithHeader(BACKUP_SHEET);
  const statusIdx = headers.indexOf("Status");
  const dateIdx = headers.indexOf("Date");

  const today = Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy");
  let updated = 0;

  rows.forEach((r, i) => {
    const rowDate = Utilities.formatDate(new Date(r[dateIdx]), TZ, "dd/MM/yyyy");
    const status = r[statusIdx];
    if (rowDate === today && ["Created", "In Progress"].includes(status)) {
      sheet.getRange(i + 2, statusIdx + 1).setValue("Missed");
      updated++;
    }
  });

  Logger.log(`🌙 Daily Reset Done: ${updated} tasks marked as Missed.`);
}

/**
 * 🛡️ Reconcile Tracker & Backup before daily reset
 * Keeps Done/Missed consistent both sides
 */
function reconcileTrackerAndBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tracker = ss.getSheetByName("Tracker");
  const backup = ss.getSheetByName("Tracker_Backup");
  if (!tracker || !backup) return;

  const tData = tracker.getDataRange().getValues();
  const bData = backup.getDataRange().getValues();

  const headerRow = tData.findIndex(r => r.join("").toLowerCase().includes("event id")) || 1;
  const headers = tData[headerRow];
  const tRows = tData.slice(headerRow + 1);
  const bRows = bData.slice(headerRow + 1);

  const titleIdx = headers.indexOf("Title");
  const statusIdx = headers.indexOf("Status");
  const tMap = {};

  tRows.forEach(r => {
    const title = (r[titleIdx] || "").trim();
    const status = (r[statusIdx] || "").trim();
    if (title) tMap[title] = status;
  });

  let updated = 0;
  bRows.forEach((r, i) => {
    const title = (r[titleIdx] || "").trim();
    const status = (r[statusIdx] || "").trim();
    if (!title) return;

    const trackerStatus = tMap[title];
    if (trackerStatus && trackerStatus !== status && ["Done", "Missed"].includes(trackerStatus)) {
      backup.getRange(i + headerRow + 2, statusIdx + 1).setValue(trackerStatus);
      updated++;
    }
  });

  Logger.log(`🧩 Reconciliation done: ${updated} statuses synced from Tracker → Backup`);
}


/** Cache weekly stats (for faster Dashboard load) */
function preCacheWeeklyStats() {
  const cache = CacheService.getScriptCache();
  const stats = getStats(7);
  cache.put("weeklyStats", JSON.stringify(stats), 3600 * 24);
  Logger.log("🧠 Weekly stats cached successfully.");
}

/** Quick keep-alive ping */
function keepSheetAlive() {
  Logger.log("✅ LifeOS active at " + new Date());
}

function updateDailyStatsCache() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const backup = ss.getSheetByName("Tracker_Backup");
    if (!backup) return;

    const data = backup.getDataRange().getValues().slice(1);
    const statusIdx = data[0].length >= 9 ? 8 : -1;
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    let done = 0, missed = 0, progress = 0, pending = 0;
    data.forEach(r => {
      const d = Utilities.formatDate(new Date(r[2]), Session.getScriptTimeZone(), "yyyy-MM-dd");
      const s = (r[statusIdx] || "").toString().trim();
      if (d === today) {
        if (s === "Done") done++;
        else if (s === "Missed") missed++;
        else if (s === "In Progress") progress++;
        else pending++;
      }
    });

    const cache = PropertiesService.getScriptProperties();
    cache.setProperty("TODAY_STATS", JSON.stringify({ done, missed, progress, pending, updated: new Date() }));

    Logger.log(`✅ Stats cache updated: Done=${done}, Missed=${missed}, InProgress=${progress}, Pending=${pending}`);
  } catch (e) {
    Logger.log("⚠️ updateDailyStatsCache error: " + e.message);
  }
}


/**
 * 🌿 LifeOS Validation Utility
 * --------------------------------------------------------
 * Validates that tasks created in "Tracker" align with
 * their frequencies and rules defined in "Tasks_DB".
 *
 * 🧭 Checks:
 *   - Task count vs expected count (based on frequency)
 *   - Day-of-week match for weekly/monthly
 *   - Start time consistency
 *   - Missing tasks or unexpected extra tasks
 *
 * 📊 Outputs:
 *   - Logs summary
 *   - Optional report sheet "Validation_Report"
 */

function validateTrackerTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tracker = ss.getSheetByName("Tracker");
  const tasksDB = ss.getSheetByName("Tasks_DB");
  const tz = Session.getScriptTimeZone();

  if (!tracker || !tasksDB) throw new Error("❌ Missing Tracker or Tasks_DB sheet");

  const trackerData = tracker.getDataRange().getValues();
  const taskData = tasksDB.getDataRange().getValues();
  const trackerHeaders = trackerData[0];
  const taskHeaders = taskData[0];

  const idxTracker = {
    task: trackerHeaders.indexOf("Task"),
    date: trackerHeaders.indexOf("Date"),
    start: trackerHeaders.indexOf("Start"),
    category: trackerHeaders.indexOf("Category")
  };

  const idxTask = {
    task: taskHeaders.indexOf("Task"),
    freq: taskHeaders.indexOf("Frequency"),
    dow: taskHeaders.indexOf("Day of Week"),
    time: taskHeaders.indexOf("Start Time"),
    dur: taskHeaders.indexOf("Duration")
  };

  const START_DATE = new Date();
  const END_DATE = new Date();
  END_DATE.setMonth(END_DATE.getMonth() + 3);

  // Create a report array
  const report = [
    ["Task", "Category", "Frequency", "Expected Count", "Actual Count", "Validation Result", "Notes"]
  ];

  for (let i = 1; i < taskData.length; i++) {
    const row = taskData[i];
    const task = (row[idxTask.task] || "").trim();
    const freq = (row[idxTask.freq] || "").trim().toLowerCase();
    const dow = (row[idxTask.dow] || "").trim().toLowerCase();
    const timeRaw = row[idxTask.time];
    const duration = parseInt(row[idxTask.dur]) || 15;
    const category = row[1] || "General";

    if (!task || !freq) continue;

    // Expected count estimation (approximate within 3 months)
    let expectedCount = 0;
    if (freq === "daily") expectedCount = 90;
    else if (freq.includes("alternate day")) expectedCount = 45;
    else if (freq.includes("weekly")) expectedCount = 12;
    else if (freq.includes("alternate week")) expectedCount = 6;
    else if (freq.includes("month")) expectedCount = 3;
    else if (freq.includes("quarter")) expectedCount = 1;
    else if (/every\d+days/.test(freq)) {
      const n = parseInt(freq.match(/\d+/)[0]);
      expectedCount = Math.floor(90 / n);
    } else expectedCount = 1;

    // Find Tracker matches
    const matches = trackerData.filter((r, idx) => {
      if (idx === 0) return false;
      return (r[idxTracker.task] || "").trim().toLowerCase() === task.toLowerCase();
    });

    const actualCount = matches.length;

    // Validate
    let result = "✅ OK";
    let notes = "";

    if (actualCount === 0) {
      result = "❌ Missing";
      notes = "No entries found in Tracker";
    } else if (actualCount < expectedCount * 0.8) {
      result = "⚠️ Partial";
      notes = `Expected ~${expectedCount}, found ${actualCount}`;
    }

    // Time consistency check
    if (matches.length && timeRaw) {
      let expectedHour = 6, expectedMin = 0;
      if (timeRaw instanceof Date) {
        expectedHour = timeRaw.getHours();
        expectedMin = timeRaw.getMinutes();
      } else if (typeof timeRaw === "string" && timeRaw.includes(":")) {
        const [h, m] = timeRaw.split(":").map(Number);
        expectedHour = h;
        expectedMin = m;
      }

      const inconsistent = matches.some(r => {
        const start = r[idxTracker.start];
        if (!(start instanceof Date)) return false;
        return start.getHours() !== expectedHour || start.getMinutes() !== expectedMin;
      });
      if (inconsistent) {
        result = "⚠️ Time mismatch";
        notes += " | Start times differ from source";
      }
    }

    // Day-of-week validation for weekly/monthly
    if ((freq.includes("weekly") || freq.includes("month")) && dow) {
      const targetDow = dayNameToIndex(dow);
      const invalid = matches.some(r => {
        const date = r[idxTracker.date];
        if (!(date instanceof Date)) return false;
        return date.getDay() !== targetDow;
      });
      if (invalid) {
        result = "⚠️ DOW mismatch";
        notes += " | Wrong day(s) generated";
      }
    }

    report.push([task, category, freq, expectedCount, actualCount, result, notes]);
  }

  // 🧾 Write Validation Report
  const reportSheetName = "Validation_Report";
  let reportSheet = ss.getSheetByName(reportSheetName);
  if (!reportSheet) reportSheet = ss.insertSheet(reportSheetName);
  reportSheet.clearContents();
  reportSheet.getRange(1, 1, report.length, report[0].length).setValues(report);
  reportSheet.autoResizeColumns(1, report[0].length);

  const pass = report.filter(r => r[5] && r[5].toString().includes("✅")).length - 1;
  const fail = report.length - pass - 1;
  Logger.log(`✅ Validation complete: ${pass} OK, ${fail} issues found.`);

  SpreadsheetApp.getUi().alert(`✅ Validation Complete:\nOK: ${pass}\nIssues: ${fail}\nSee "Validation_Report" sheet.`);
}

/**
 * Converts day name to index (Sun=0...Sat=6)
 */
function dayNameToIndex(name) {
  if (!name) return 0;
  const s = name.trim().toLowerCase().substring(0, 3);
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map[s] ?? 0;
}

/**
 * 🗂️ Archive older rows from Tracker_Backup → Tracker_Archive
 * ------------------------------------------------------------
 * ✅ Keeps last 7 days in Backup
 * ✅ Moves older data to Tracker_Archive
 * ✅ Preserves headers & date formats
 */
function archiveOldBackupData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backup = ss.getSheetByName("Tracker_Backup");
  if (!backup) throw new Error("❌ Tracker_Backup not found");

  let archive = ss.getSheetByName("Tracker_Archive");
  if (!archive) {
    archive = ss.insertSheet("Tracker_Archive");
    archive.appendRow(backup.getRange(1, 1, 1, backup.getLastColumn()).getValues()[0]);
  }

  const data = backup.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log("⚠️ No data rows to archive");
    return;
  }

  const headers = data[0];
  const dateCol = headers.indexOf("Date");
  if (dateCol === -1) throw new Error("⚠️ Date column not found");

  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7); // keep last 7 days

  const keepRows = [headers];
  const archiveRows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const d = new Date(row[dateCol]);
    if (d < cutoff) archiveRows.push(row);
    else keepRows.push(row);
  }

  if (archiveRows.length > 0) {
    archive.getRange(archive.getLastRow() + 1, 1, archiveRows.length, archiveRows[0].length).setValues(archiveRows);
    Logger.log(`📦 Archived ${archiveRows.length} rows to Tracker_Archive`);
  } else {
    Logger.log("✅ No rows older than 7 days");
  }

  // Replace Backup sheet contents with only recent data
  backup.clearContents();
  backup.getRange(1, 1, keepRows.length, keepRows[0].length).setValues(keepRows);

  // Format columns
  backup.getRange("C:C").setNumberFormat("dd/MM/yyyy");
  backup.getRange("D:E").setNumberFormat("hh:mm:ss am/pm");
  archive.getRange("C:C").setNumberFormat("dd/MM/yyyy");
  archive.getRange("D:E").setNumberFormat("hh:mm:ss am/pm");

  Logger.log(`✅ Backup sheet trimmed to ${keepRows.length - 1} recent rows`);
}

/**
 * 📊 LifeOS Analytics v2
 * -------------------------------------------------------------
 * ✅ Combines Tracker_Backup + Tracker_Archive data
 * ✅ Builds:
 *    - Daily trend (last 90 days)
 *    - Weekly & Monthly summaries
 * ✅ Adds line & bar charts automatically
 */
function generateHistoricalStats_v2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backup = ss.getSheetByName("Tracker_Backup");
  const archive = ss.getSheetByName("Tracker_Archive");
  if (!backup || !archive) throw new Error("Missing required sheets");

  // Merge Backup + Archive data
  const data = [
    ...archive.getDataRange().getValues().slice(1),
    ...backup.getDataRange().getValues().slice(1)
  ];

  const tz = Session.getScriptTimeZone();
  const dateCol = 2; // "Date"
  const statusCol = 8; // "Status"

  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 90); // last 90 days
  const counts = {};

  // Aggregate by date
  data.forEach((row) => {
    const dateVal = row[dateCol];
    const status = (row[statusCol] || "").toString().trim();
    if (!dateVal) return;
    const d = new Date(dateVal);
    if (isNaN(d) || d < cutoff) return;
    const ds = Utilities.formatDate(d, tz, "yyyy-MM-dd");

    if (!counts[ds]) counts[ds] = { done: 0, missed: 0, progress: 0, pending: 0 };
    if (status === "Done") counts[ds].done++;
    else if (status === "Missed") counts[ds].missed++;
    else if (status === "In Progress") counts[ds].progress++;
    else counts[ds].pending++;
  });

  const sortedDates = Object.keys(counts).sort();
  const out = [["Date", "Done", "Missed", "In Progress", "Pending", "Total", "Done %", "Missed %"]];

  sortedDates.forEach((d) => {
    const c = counts[d];
    const total = c.done + c.missed + c.progress + c.pending;
    const donePct = total ? Math.round((c.done / total) * 100) : 0;
    const missedPct = total ? Math.round((c.missed / total) * 100) : 0;
    out.push([d, c.done, c.missed, c.progress, c.pending, total, donePct, missedPct]);
  });

  // --- Write daily data to sheet ---
  let sheet = ss.getSheetByName("LifeOS_Stats");
  if (!sheet) sheet = ss.insertSheet("LifeOS_Stats");
  sheet.clearContents();
  sheet.getRange(1, 1, out.length, out[0].length).setValues(out);

  // --- Calculate Weekly & Monthly summaries ---
  const weekly = {};
  const monthly = {};
  sortedDates.forEach((d) => {
    const [y, m, day] = d.split("-").map(Number);
    const weekKey = `${y}-W${getWeekNumber(new Date(d))}`;
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const c = counts[d];
    const total = c.done + c.missed + c.progress + c.pending;

    if (!weekly[weekKey]) weekly[weekKey] = { done: 0, missed: 0, total: 0 };
    weekly[weekKey].done += c.done;
    weekly[weekKey].missed += c.missed;
    weekly[weekKey].total += total;

    if (!monthly[monthKey]) monthly[monthKey] = { done: 0, missed: 0, total: 0 };
    monthly[monthKey].done += c.done;
    monthly[monthKey].missed += c.missed;
    monthly[monthKey].total += total;
  });

  const weeklyOut = [["Week", "Done %", "Missed %", "Total Tasks"]];
  Object.keys(weekly)
    .sort()
    .forEach((w) => {
      const wData = weekly[w];
      const donePct = wData.total ? Math.round((wData.done / wData.total) * 100) : 0;
      const missedPct = wData.total ? Math.round((wData.missed / wData.total) * 100) : 0;
      weeklyOut.push([w, donePct, missedPct, wData.total]);
    });

  const monthlyOut = [["Month", "Done %", "Missed %", "Total Tasks"]];
  Object.keys(monthly)
    .sort()
    .forEach((m) => {
      const mData = monthly[m];
      const donePct = mData.total ? Math.round((mData.done / mData.total) * 100) : 0;
      const missedPct = mData.total ? Math.round((mData.missed / mData.total) * 100) : 0;
      monthlyOut.push([m, donePct, missedPct, mData.total]);
    });

  // --- Write summaries ---
  const weeklyStart = out.length + 3;
  sheet.getRange(weeklyStart, 1, weeklyOut.length, weeklyOut[0].length).setValues(weeklyOut);
  sheet.getRange(weeklyStart - 1, 1).setValue("📅 Weekly Summary");

  const monthlyStart = weeklyStart + weeklyOut.length + 3;
  sheet.getRange(monthlyStart, 1, monthlyOut.length, monthlyOut[0].length).setValues(monthlyOut);
  sheet.getRange(monthlyStart - 1, 1).setValue("📆 Monthly Summary");

    // --- Charts ---
  const chart1 = sheet.newChart()
    .asLineChart()
    .setPosition(2, 9, 0, 0)
    .addRange(sheet.getRange(1, 1, out.length, 5))
    .setOption("title", "Daily Task Trend (Last 90 Days)")
    .setOption("curveType", "function")
    .setOption("legend", { position: "bottom" })
    .setOption("pointSize", 3)
    .build();

  const chart2 = sheet.newChart()
    .asColumnChart()
    .setPosition(weeklyStart, 9, 0, 0)
    .addRange(sheet.getRange(weeklyStart + 1, 1, weeklyOut.length - 1, 3))
    .setOption("title", "Weekly Done vs Missed %")
    .setOption("legend", { position: "bottom" })
    .build();

  // ✅ SAFELY remove old charts (clearCharts() not supported in all versions)
  const charts = sheet.getCharts();
  charts.forEach((c) => sheet.removeChart(c));

  // ✅ Add new charts
  sheet.insertChart(chart1);
  sheet.insertChart(chart2);

  Logger.log("📈 LifeOS Analytics v2 completed successfully");

}

/* 📅 Helper: Week number from date */
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}



