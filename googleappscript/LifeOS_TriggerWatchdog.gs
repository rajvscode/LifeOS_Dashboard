function triggerWatchdog() {
  const existing = ScriptApp.getProjectTriggers();
  const existingNames = existing.map(t => t.getHandlerFunction());
  const required = ["dailyResetRoutine", "autoSyncToGlide", "preCacheWeeklyStats", "generateMonthlyEvents_v10_13"];

  required.forEach(fn => {
    if (!existingNames.includes(fn)) {
      ScriptApp.newTrigger(fn).timeBased().everyHours(2).create();
      Logger.log(`🛠️ Restored missing trigger: ${fn}`);
    }
  });
}

function watchdogNormalize() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tracker = ss.getSheetByName("Tracker");
    const backup = ss.getSheetByName("Tracker_Backup");

    if (tracker) normalizeTrackerSheet(tracker, "Tracker");
    if (backup) normalizeTrackerSheet(backup, "Tracker_Backup");

    Logger.log("🔄 Watchdog normalization complete");
  } catch (err) {
    Logger.log("❌ Watchdog normalization failed: " + err.message);
  }
}

