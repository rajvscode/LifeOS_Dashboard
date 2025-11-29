function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const { taskKey, status } = data;

    if (!taskKey || !status)
      return _json({ status: "error", message: "Missing parameters" });

    Logger.log(`✅ Updating via API → ${taskKey} → ${status}`);
    const result = updateStatusAndSyncBackupV82(taskKey, status);

    return _json({ status: "ok", taskKey, newStatus: status, result });
  } catch (err) {
    Logger.log("❌ API doPost Error: " + err);
    return _json({ status: "error", message: err.message });
  }
}

function _json(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);

  // Add CORS headers using the Web App’s special method
  const response = HtmlService.createHtmlOutput("");
  response.append(JSON.stringify(obj));
  response.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  // Use Apps Script’s own cross-origin allowances
  return output;
}
