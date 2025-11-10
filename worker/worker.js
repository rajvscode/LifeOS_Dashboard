export default {
  async fetch(request, env, ctx) {
    const sheetId = "18ocx1P7NKqY2eCF4HpauqVL3yftGo_qi0CKfCAcDTfk";
    const appsScriptUrl =
      "https://script.google.com/macros/s/AKfycbwa5UGw5XmfxD4XwKfPRy1hMlIpZ3cAT3-kJZAijs-RAqYH9kP2xmx3epCLlhCR-FxH/exec";
    const url = new URL(request.url);

    // ✅ /tasks endpoint → get today’s tasks
    if (url.pathname === "/tasks") {
	  try {
		const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Tracker_Backup`;
		const res = await fetch(gvizUrl);
		const text = await res.text();

		const jsonText = text
		  .replace("/*O_o*/", "")
		  .replace(/google.visualization.Query.setResponse\(|\);$/g, "")
		  .trim();
		const data = JSON.parse(jsonText);

		const rows = data.table.rows
		  .map((r) => {
			const rawDate = (r.c[2]?.f || r.c[2]?.v || "").trim();
			let parsedDate = null;

			// ✅ handle dd/MM/yyyy
			const m = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
			if (m) {
			  const [_, d, M, y] = m.map(Number);
			  parsedDate = new Date(y, M - 1, d);
			}

			// fallback for GViz Date(...)
			const gviz = rawDate.match(/Date\((\d+),(\d+),(\d+)/);
			if (!parsedDate && gviz) {
			  const [_, y, M, d] = gviz.map(Number);
			  parsedDate = new Date(y, M, d);
			}

			const desc = r.c[11]?.v || "";
			const keyMatch =
			  desc.match(/([A-Z]\d{3,4}-\d{4}-\d{2}-\d{2})/i) ||
			  desc.match(/Key[^A-Za-z0-9]*([A-Za-z0-9-]+)/i);
			const taskKey = keyMatch ? keyMatch[1] : "";

			return {
			  calendar: r.c[1]?.v || "",
			  date: rawDate,
			  parsedDate,
			  start: r.c[3]?.f || "08:00 AM",
			  end: r.c[4]?.f || "09:00 AM",
			  category: r.c[5]?.v || "",
			  task: r.c[6]?.v || "",
			  title: r.c[7]?.v || "",
			  status: r.c[8]?.v || "",
			  notes: r.c[10]?.v || "",
			  description: desc,
			  key: taskKey,
			};
		  })
		  .filter((r) => r.task && r.parsedDate);

		// ✅ Get today’s date in IST (yyyyMMdd)
		const nowIST = new Date(
		  new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
		);
		const todayStr = nowIST.toLocaleDateString("en-CA", {
		  timeZone: "Asia/Kolkata",
		}); // "2025-11-09"
		const todayNum = Number(todayStr.replace(/-/g, ""));

		const filtered = rows.filter((r) => {
		  const dnum = Number(
			r.parsedDate
			  .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
			  .replace(/-/g, "")
		  );
		  return dnum === todayNum;
		});

		// ✅ Sort by actual time of day (handles AM/PM correctly)
		filtered.sort((a, b) => {
		  const parseTime = (timeStr) => {
			if (!timeStr) return 0;
			const [hms, ampm] = timeStr.trim().split(/\s+/);
			let [h, m, s] = hms.split(":").map(Number);
			if (ampm?.toLowerCase() === "pm" && h !== 12) h += 12;
			if (ampm?.toLowerCase() === "am" && h === 12) h = 0;
			return h * 3600 + m * 60 + (s || 0);
		  };

		  return parseTime(a.start) - parseTime(b.start);
		});

		console.log(`📅 Filtered ${filtered.length} out of ${rows.length} total tasks`);

		return new Response(JSON.stringify({ status: "ok", tasks: filtered }, null, 2), {
		  headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		  },
		});
	  } catch (err) {
		console.error("❌ Task fetch error:", err);
		return new Response(JSON.stringify({ error: err.message }), {
		  status: 500,
		  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
		});
	  }
	}

    // ✅ /update endpoint → forward updates to Apps Script Web App (POST JSON)
	if (url.pathname === "/update") {
	  try {
		const params = new URL(request.url).searchParams;
		const taskKey = params.get("taskKey");
		const status = params.get("status");

		if (!taskKey || !status) {
		  return new Response(JSON.stringify({ error: "Missing taskKey or status" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		  });
		}

		const scriptUrl =
		  "https://script.google.com/macros/s/AKfycbwa5UGw5XmfxD4XwKfPRy1hMlIpZ3cAT3-kJZAijs-RAqYH9kP2xmx3epCLlhCR-FxH/exec";

		console.log(`🔁 Forwarding update via POST to Apps Script: ${taskKey} → ${status}`);

		const response = await fetch(scriptUrl, {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({ taskKey, status }),
		});

		const body = await response.text();
		console.log("📨 Apps Script response:", body);

		return new Response(body, {
		  status: response.status,
		  headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		  },
		});
	  } catch (err) {
		console.error("❌ Update forward failed:", err);
		return new Response(JSON.stringify({ error: err.message }), {
		  status: 500,
		  headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		  },
		});
	  }
	}



    // ✅ Handle OPTIONS preflight (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ✅ Default route (ping)
    return new Response(
      JSON.stringify({
        message: "🌿 LifeOS Proxy Active",
        usage: "Visit /tasks for today’s tasks or /update?action=... to update",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  },
};
