export default {
  async fetch(request, env, ctx) {
    const sheetId = "18ocx1P7NKqY2eCF4HpauqVL3yftGo_qi0CKfCAcDTfk";
    const appsScriptUrl =
      "https://script.google.com/macros/s/AKfycbwa5UGw5XmfxD4XwKfPRy1hMlIpZ3cAT3-kJZAijs-RAqYH9kP2xmx3epCLlhCR-FxH/exec";
    const url = new URL(request.url);
    const debug = url.searchParams.get("debug") === "1";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    try {
      // ✅ Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // ✅ /tasks endpoint
      if (url.pathname === "/tasks") {
        try {
          const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Tracker_Backup`;
          const res = await fetch(gvizUrl, { cf: { cacheTtl: 60, cacheEverything: true } });
          if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

          const text = await res.text();
          if (!text.includes("google.visualization.Query.setResponse")) {
            throw new Error("Invalid GViz response (check if sheet is public)");
          }

          // ✅ Clean & Parse JSON safely (catch very large inputs)
          let data;
          try {
            const jsonText = text
              .replace("/*O_o*/", "")
              .replace(/google.visualization.Query.setResponse\(|\);$/g, "")
              .trim();
            data = JSON.parse(jsonText);
          } catch (e) {
            throw new Error("Failed to parse Google Sheet GViz JSON");
          }

          // ✅ Map and limit row parsing to prevent worker overload
          const allRows = data.table?.rows || [];
          const limitedRows = allRows.slice(0, 800); // limit ~800 rows for safety

          const rows = limitedRows
            .map((r) => {
              try {
                const rawDate = (r.c[2]?.f || r.c[2]?.v || "").trim();
                let parsedDate = null;

                // --- Handle dd/MM/yyyy ---
                const m = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (m) {
                  let [_, d, M, y] = m.map(Number);
                  if (M > 12 && d <= 12) [d, M] = [M, d];
                  parsedDate = new Date(y, M - 1, d);
                }

                // --- Handle GViz Date(...) ---
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
                  status: r.c[8]?.v || "Created",
                  notes: r.c[10]?.v || "",
                  description: desc,
                  key: taskKey,
                };
              } catch {
                return null;
              }
            })
            .filter((r) => r && r.task && r.parsedDate);

          // ✅ Date handling logic
          const isTomorrow = url.searchParams.get("tomorrow") === "1";
          const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
          let targetIST = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate());
          if (isTomorrow) targetIST.setDate(targetIST.getDate() + 1);

          const targetStr = targetIST.toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          });

          // ✅ Filter only matching date
          const filtered = rows.filter((r) => {
            const rowStr = r.parsedDate.toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata",
            });
            return rowStr === targetStr;
          });

          // ✅ Sort by actual time
          const parseTime = (t) => {
            if (!t) return 0;
            const [hms, ampm] = t.trim().split(/\s+/);
            let [h, m, s] = hms.split(":").map(Number);
            if (ampm?.toLowerCase() === "pm" && h !== 12) h += 12;
            if (ampm?.toLowerCase() === "am" && h === 12) h = 0;
            return h * 3600 + m * 60 + (s || 0);
          };
          filtered.sort((a, b) => parseTime(a.start) - parseTime(b.start));

          const debugInfo = debug
            ? {
                totalRows: allRows.length,
                limitedTo: limitedRows.length,
                filteredCount: filtered.length,
                targetStr,
              }
            : undefined;

          return new Response(
            JSON.stringify({ status: "ok", tasks: filtered, debug: debugInfo }, null, 2),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        } catch (err) {
          console.error("❌ Task fetch error:", err);
          return new Response(JSON.stringify({ status: "error", message: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

      // ✅ /update endpoint
      if (url.pathname === "/update") {
        try {
          const params = url.searchParams;
          const taskKey = params.get("taskKey");
          const status = params.get("status");

          if (!taskKey || !status) {
            return new Response(JSON.stringify({ error: "Missing taskKey or status" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          const response = await fetch(appsScriptUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskKey, status }),
          });

          const body = await response.text();
          return new Response(body, {
            status: response.status,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (err) {
          console.error("❌ Update forward failed:", err);
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

		if (url.pathname === "/stats") {
		  try {
			// Fetch directly from LifeOS_Stats sheet (GViz endpoint)
			const statsSheet = "LifeOS_Stats";
			const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${statsSheet}`;
			const res = await fetch(gvizUrl);
			const text = await res.text();
			const jsonText = text
			  .replace("/*O_o*/", "")
			  .replace(/google.visualization.Query.setResponse\(|\);$/g, "")
			  .trim();
			const data = JSON.parse(jsonText);

			const rows = data.table.rows
			  .map((r) => ({
				date: r.c[0]?.v || "",
				done: r.c[1]?.v || 0,
				missed: r.c[2]?.v || 0,
				inProgress: r.c[3]?.v || 0,
				pending: r.c[4]?.v || 0,
				total: r.c[5]?.v || 0,
				donePct: r.c[6]?.v || 0,
				missedPct: r.c[7]?.v || 0,
			  }))
			  .filter((r) => r.date);

			return new Response(JSON.stringify({ status: "ok", stats: rows }, null, 2), {
			  headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			  },
			});
		  } catch (err) {
			return new Response(JSON.stringify({ error: err.message }), {
			  status: 500,
			  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
			});
		  }
		}

      // ✅ Default root route
      return new Response(
        JSON.stringify({
          message: "🌿 LifeOS Worker Active",
          usage: "/tasks | /tasks?tomorrow=1 | /update | /tasks?debug=1",
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (err) {
      console.error("❌ Worker crash:", err);
      return new Response(JSON.stringify({ status: "error", message: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
