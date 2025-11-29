function generateWeeklyReport() {
  const stats = getStats(7);
  const email = Session.getActiveUser().getEmail();
  const subject = "📊 LifeOS Weekly Summary";
  const body = `
  ✅ Done: ${stats.stats.Done}
  ⚠️ Missed: ${stats.stats.Missed}
  🔄 In Progress: ${stats.stats["In Progress"]}
  🕒 Pending: ${stats.stats.Pending}
  `;
  MailApp.sendEmail(email, subject, body);
  Logger.log("📧 Weekly report sent to " + email);
}

function dailyTrackerBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tracker = ss.getSheetByName("Tracker");
  const backup = ss.getSheetByName("Tracker_Backup");
  if (!tracker || !backup) throw new Error("Missing sheets");

  // Normalize both
  normalizeTrackerSheet(tracker, "Tracker");

  // Copy all data
  const data = tracker.getDataRange().getValues();
  backup.clearContents();
  backup.getRange(1, 1, data.length, data[0].length).setValues(data);

  normalizeTrackerSheet(backup, "Tracker_Backup");

  // Metadata (hidden)
  const ts = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd-MMM-yyyy hh:mm a");
  updateMetadata("Tracker_Backup_LastGenerated", ts);

  Logger.log("✅ Tracker_Backup refreshed and metadata updated");
}


