function clearAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log("🧹 All existing triggers cleared");
}

function setupAllLifeOSTriggers_v10_13() {
  clearAllTriggers();

  // Daily reset
  ScriptApp.newTrigger("dailyResetRoutine")
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();

  // Tracker → Backup sync every 2 hours
  ScriptApp.newTrigger("autoSyncToGlide")
    .timeBased()
    .everyHours(2)
    .create();

  // Pre-cache or weekly stat refresh
  ScriptApp.newTrigger("preCacheWeeklyStats")
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .create();

  // Monthly generator
  ScriptApp.newTrigger("generateMonthlyEvents_v10_13")
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .create();

  // Optional: nightly reconciliation at 11 PM
  ScriptApp.newTrigger("reconcileTrackerAndBackup")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

    ScriptApp.newTrigger("archiveOldBackupData").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();
    
    ScriptApp.newTrigger("generateHistoricalStats_v2").timeBased().everyDays(1).atHour(5).create();

  Logger.log("✅ All LifeOS v10.13 triggers configured");
}


function setupReconciliationTrigger() {
  ScriptApp.newTrigger("reconcileTrackerAndBackup")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();
  Logger.log("✅ Reconciliation trigger set at 11:00 PM daily");
}

function normalizeTrackerSheet(sheet, name) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  const headers = data[1];
  const dateCol = headers.indexOf("Date");
  const startCol = headers.indexOf("Start");
  const endCol = headers.indexOf("End");
  const statusTimeCol = headers.indexOf("StatusTime");
  const tz = Session.getScriptTimeZone();
  const now = new Date();

  for (let r = 2; r < data.length; r++) {
    const row = data[r];

    // Normalize date-like columns
    [dateCol, startCol, endCol, statusTimeCol].forEach((col) => {
      if (col >= 0 && row[col]) {
        const val = parseDateToObject(row[col]);
        if (val) row[col] = val;
      }
    });
  }

  // Write back normalized values
  sheet.getRange(3, 1, data.length - 2, headers.length).setValues(data.slice(2));

  // Record metadata instead of writing “Generated:” in the sheet
  updateMetadata(`${name}_LastGenerated`, Utilities.formatDate(now, tz, "dd-MMM-yyyy hh:mm a"));
}

function parseDateToObject(val) {
  try {
    if (val instanceof Date) return val;
    if (typeof val === "number") return new Date(Math.round((val - 25569) * 86400 * 1000));
    if (typeof val === "string") {
      const clean = val.trim();
      const iso = Date.parse(clean);
      if (!isNaN(iso)) return new Date(iso);

      const parts = clean.split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) return new Date(parts[0], parts[1] - 1, parts[2]);
        else return new Date(parts[2], parts[1] - 1, parts[0]);
      }
    }
  } catch (e) {
    Logger.log("⚠️ parseDateToObject failed: " + e.message);
  }
  return null;
}

/**
 * Store a key-value metadata entry in a hidden Metadata sheet.
 */
function updateMetadata(key, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let meta = ss.getSheetByName("Metadata");
  if (!meta) {
    meta = ss.insertSheet("Metadata");
    meta.hideSheet();
    meta.getRange("A1").setValue("Key");
    meta.getRange("B1").setValue("Value");
  }

  const data = meta.getDataRange().getValues();
  const row = data.findIndex(r => r[0] === key);
  if (row === -1) meta.appendRow([key, value]);
  else meta.getRange(row + 1, 2).setValue(value);
}

/**
 * Retrieve metadata value (if needed elsewhere)
 */
function getMetadata(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const meta = ss.getSheetByName("Metadata");
  if (!meta) return null;
  const data = meta.getDataRange().getValues();
  const row = data.find(r => r[0] === key);
  return row ? row[1] : null;
}
function setupMonthlyTaskGenerator_v10_13() {
  // 🧹 Remove old generator triggers (if any)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction().includes("generateMonthlyEvents"))
      ScriptApp.deleteTrigger(t);
  });

  // 🕓 Schedule v10.13 generator on 1st of each month at 4:00 AM
  ScriptApp.newTrigger("generateMonthlyEvents_v10_13")
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .create();

  Logger.log("✅ Monthly generator trigger (v10.13) installed: runs on 1st of each month at 4 AM");
}







