import React, { useState, useEffect } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Plus, 
  Check, 
  Trash2, 
  Upload, 
  Link2, 
  AlertTriangle,
  Info,
  RefreshCw,
  LogOut,
  Key,
  Globe,
  Send,
  CheckCircle2,
  CalendarCheck,
  Download,
  Lock
} from "lucide-react";
import { CalendarEvent, Goal, GoalType } from "../types";

interface CalendarViewProps {
  events: CalendarEvent[];
  goals: Goal[];
  onAddEvent: (event: Omit<CalendarEvent, "id">) => void;
  onToggleCompleteEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onImportCalendar: (name: string, dataString: string, realEvents?: CalendarEvent[]) => void;
}

export default function CalendarView({
  events,
  goals,
  onAddEvent,
  onToggleCompleteEvent,
  onDeleteEvent,
  onImportCalendar
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<"week" | "day" | "list">("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Event Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<CalendarEvent["type"]>("personal");
  const [newDay, setNewDay] = useState(new Date().toISOString().split("T")[0]);
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newEndTime, setNewEndTime] = useState("10:00");
  const [newNotes, setNewNotes] = useState("");
  const [newGoalId, setNewGoalId] = useState("");

  // External Calendar Sync State
  const [externalSource, setExternalSource] = useState("");
  const [externalName, setExternalName] = useState("");
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [icsInput, setIcsInput] = useState("");

  // Google Calendar Integration State
  const [googleAccessToken, setGoogleAccessToken] = useState(() => localStorage.getItem("gcal_access_token") || "");
  const [googleEmail, setGoogleEmail] = useState(() => localStorage.getItem("gcal_email") || "");
  const [gcalStatus, setGcalStatus] = useState<string>("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [manualTokenVal, setManualTokenVal] = useState("");
  const [importingGcal, setImportingGcal] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ [id: string]: "idle" | "syncing" | "success" | "error" }>({});

  // Implicit flow parser
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const token = params.get("access_token");
      if (token) {
        setGoogleAccessToken(token);
        localStorage.setItem("gcal_access_token", token);
        setGcalStatus("Successfully connected!");
        window.location.hash = ""; // Clear hash
        fetchGoogleProfile(token);
      }
    } else if (googleAccessToken) {
      fetchGoogleProfile(googleAccessToken);
    }
  }, []);

  const fetchGoogleProfile = async (token: string) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.email) {
          setGoogleEmail(data.email);
          localStorage.setItem("gcal_email", data.email);
        }
      }
    } catch (err) {
      console.warn("Could not retrieve email from Google Account payload", err);
    }
  };

  const handleLaunchGoogleOAuth = () => {
    const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email");
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    const implicitUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=742721019992-0bmb2dajms66ehm65j8siv3clj08v70l.apps.googleusercontent.com&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&prompt=consent`;
    
    // Attempt redirect
    window.location.href = implicitUrl;
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = manualTokenVal.trim();
    if (token) {
      setGoogleAccessToken(token);
      localStorage.setItem("gcal_access_token", token);
      setGcalStatus("Connected manually using custom Developer Token!");
      setManualTokenVal("");
      setShowTokenInput(false);
      fetchGoogleProfile(token);
    }
  };

  const handleDisconnectGoogle = () => {
    setGoogleAccessToken("");
    setGoogleEmail("");
    localStorage.removeItem("gcal_access_token");
    localStorage.removeItem("gcal_email");
    setGcalStatus("Disconnected Google Account.");
  };

  // 📥 IMPORT: Fetch and import Google Calendar events within current week bounds
  const handleImportGoogleCalendar = async () => {
    if (!googleAccessToken) return;
    setImportingGcal(true);
    setGcalStatus("Initiating sync with Google Calendar API...");
    try {
      const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(); // 30 days before
      const timeMax = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); // 1 month after
      
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=150`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Invalid or expired OAuth Access Token. Please re-authenticate.");
        }
        throw new Error(`Google API request failed with status: ${res.status}`);
      }

      const data = await res.json();
      const items = data.items || [];
      
      const normalizedEvents: CalendarEvent[] = items.map((item: any) => {
        const startRaw = item.start?.dateTime || item.start?.date || new Date().toISOString();
        const endRaw = item.end?.dateTime || item.end?.date || new Date(Date.now() + 1 * 3600 * 1000).toISOString();
        return {
          id: `gcal_${item.id}`,
          title: item.summary || "Google Calendar Event (Busy)",
          type: "external" as const,
          start: new Date(startRaw).toISOString(),
          end: new Date(endRaw).toISOString(),
          completed: false,
          notes: item.description || "Synced directly from your Google Calendar."
        };
      });

      onImportCalendar("Google Calendar", "", normalizedEvents);
      setGcalStatus(`Successfully synchronized ${normalizedEvents.length} events from your Google Calendar!`);
    } catch (err: any) {
      console.error("Google Calendar import failed: ", err);
      setGcalStatus(`Error syncing Calendar items: ${err.message || err}`);
    } finally {
      setImportingGcal(false);
    }
  };

  // 📤 EXPORT: Export custom workouts or study blocks to actual Google Calendar
  const handleExportToGoogleCalendar = async (evt: CalendarEvent) => {
    if (!googleAccessToken) return;
    
    setExportStatus(prev => ({ ...prev, [evt.id]: "syncing" }));
    try {
      // Prompt user confirmation for mutating API operations (mandatory as per policy!)
      const confirmed = window.confirm(`Update Google Calendar? We will post "${evt.title}" into your main calendar.`);
      if (!confirmed) {
        setExportStatus(prev => ({ ...prev, [evt.id]: "idle" }));
        return;
      }

      const duration = new Date(evt.end).getTime() - new Date(evt.start).getTime();
      const postBody = {
        summary: `${evt.type === "workout" ? "🏋️" : "📚"} ${evt.title}`,
        description: `${evt.notes || ""}\n\nScheduled conflict-free using smart AI routine engine.`,
        start: { dateTime: evt.start },
        end: { dateTime: evt.end }
      };

      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(postBody)
      });

      if (!res.ok) {
        throw new Error(`Google POST request failed with status: ${res.status}`);
      }

      setExportStatus(prev => ({ ...prev, [evt.id]: "success" }));
      setTimeout(() => {
        setExportStatus(prev => {
          const next = { ...prev };
          delete next[evt.id];
          return next;
        });
      }, 5000);
    } catch (err: any) {
      console.error("Failed to export slot to Google: ", err);
      setExportStatus(prev => ({ ...prev, [evt.id]: "error" }));
      alert(`Export Failed: ${err.message || err}`);
    }
  };

  // Bulk Export all unexported workouts & study events
  const handleBulkExportUnexported = async () => {
    const unexported = events.filter(e => e.type !== "external" && !exportStatus[e.id]);
    if (unexported.length === 0) {
      alert("No printable workouts or study sessions are currently unexported!");
      return;
    }

    const confirmed = window.confirm(`Export Routine? Let's write ${unexported.length} scheduled workout and study hours to your main Google Calendar.`);
    if (!confirmed) return;

    setExportingAll(true);
    setGcalStatus(`Exporting ${unexported.length} scheduled slots to Google Calendar...`);
    
    let successCount = 0;
    for (const evt of unexported) {
      try {
        const postBody = {
          summary: `${evt.type === "workout" ? "🏋️" : "📚"} ${evt.title}`,
          description: evt.notes || "Auto-programmed with conflict-free AI scheduler.",
          start: { dateTime: evt.start },
          end: { dateTime: evt.end }
        };

        const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(postBody)
        });

        if (res.ok) {
          successCount++;
          setExportStatus(prev => ({ ...prev, [evt.id]: "success" }));
        }
      } catch {
        setExportStatus(prev => ({ ...prev, [evt.id]: "error" }));
      }
    }

    setExportingAll(false);
    setGcalStatus(`Export Finished! Successfully wrote ${successCount} slots into your real Google Calendar.`);
  };

  // Helper: Get start of current week (Sunday)
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  const startOfWeek = getStartOfWeek(currentDate);

  // Helper: Get range dates of current week
  const getWeekDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  // Navigation handlers
  const handlePrev = () => {
    const nextDate = new Date(currentDate);
    if (viewMode === "week") {
      nextDate.setDate(currentDate.getDate() - 7);
    } else {
      nextDate.setDate(currentDate.getDate() - 1);
    }
    setCurrentDate(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(currentDate);
    if (viewMode === "week") {
      nextDate.setDate(currentDate.getDate() + 7);
    } else {
      nextDate.setDate(currentDate.getDate() + 1);
    }
    setCurrentDate(nextDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Submit new manual event
  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const startISO = `${newDay}T${newStartTime}:00`;
    const endISO = `${newDay}T${newEndTime}:00`;

    onAddEvent({
      title: newTitle,
      type: newType,
      start: new Date(startISO).toISOString(),
      end: new Date(endISO).toISOString(),
      completed: false,
      notes: newNotes,
      goalId: newGoalId || undefined
    });

    // Reset Form
    setNewTitle("");
    setNewNotes("");
    setNewGoalId("");
    setShowAddModal(false);
  };

  // Simulate Calendar file import (or preset feeds)
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = externalName.trim() || "Work Existing Calendar";
    
    // Simulate importing real ICS file or standard entries
    const sampleICS = `
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      SUMMARY:${name} Sync Block
      DTSTART:${new Date().toISOString().slice(0,10).replace(/-/g,'')}T090000Z
      DTEND:${new Date().toISOString().slice(0,10).replace(/-/g,'')}T110000Z
      END:VEVENT
      END:VCALENDAR
    `;
    onImportCalendar(name, sampleICS);
    setExternalName("");
    setExternalSource("");
    setIcsInput("");
    setShowSyncPanel(false);
  };

  // Preset quick import feeds
  const handleSelectPresetImport = (presetName: string, type: string) => {
    const sampleICS = `Simulated preset import for ${presetName}`;
    onImportCalendar(`${presetName} (${type})`, sampleICS);
    setShowSyncPanel(false);
  };

  // Hours array for Grid: 08:00 to 22:00
  const hours = Array.from({ length: 15 }, (_, i) => i + 8);

  // Filter events for the rendered dates
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // Format month and year label
  const getHeaderLabel = () => {
    if (viewMode === "day") {
      return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
      return startOfWeek.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    return `${startOfWeek.toLocaleDateString("en-US", { month: "short" })} - ${endOfWeek.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  };

  return (
    <div id="calendar_section_card" className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[750px] text-white">
      
      {/* Calendar Header toolbar */}
      <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-white/5">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-indigo-400" id="header_cal_icon" />
          <h2 id="calendar_title_header" className="font-sans font-semibold text-white text-lg tracking-tight">Schedule</h2>
          <span className="text-xs bg-white/10 text-slate-200 px-2.5 py-0.5 rounded-full font-medium" id="total_schedule_count">
            {events.length} Events Total
          </span>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 p-1 rounded-xl shadow-xs">
          <button 
            id="nav_prev_btn"
            onClick={handlePrev} 
            className="p-1 px-1.5 rounded-lg hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            id="nav_today_btn"
            onClick={handleToday} 
            className="text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-white/10 text-white transition cursor-pointer"
          >
            Today
          </button>
          <button 
            id="nav_next_btn"
            onClick={handleNext} 
            className="p-1 px-1.5 rounded-lg hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div id="calendar_label_header" className="text-sm font-semibold text-slate-200 min-w-[200px] text-center font-display">
          {getHeaderLabel()}
        </div>

        {/* View Mode Dropdowns and Event Addition triggers */}
        <div className="flex items-center gap-2">
          <div className="bg-white/5 border border-white/5 p-0.5 rounded-lg flex items-center">
            {(["week", "day", "list"] as const).map((mode) => (
              <button
                key={mode}
                id={`view_btn_${mode}`}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-3 py-1.5 rounded-md font-semibold capitalize transition cursor-pointer ${
                  viewMode === mode 
                    ? "bg-indigo-650 text-white shadow-md shadow-indigo-650/10" 
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            id="open_sync_sidebar_btn"
            onClick={() => setShowSyncPanel(!showSyncPanel)}
            className="p-2 border border-white/10 bg-white/5 text-slate-300 hover:text-indigo-400 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="External Calendar Feeds"
          >
            <Link2 className="w-4 h-4" />
          </button>

          <button
            id="open_add_event_modal_btn"
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 md:px-4 md:py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Add Event</span>
          </button>
        </div>
      </div>

      {/* Sync/External Calendar configuration Drawer overlay */}
      {showSyncPanel && (
        <div id="sync_calendar_drawer" className="bg-white/5 border-b border-white/10 p-4 transition-all">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
              <h3 className="font-sans font-semibold text-white text-sm mb-1.5 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-emerald-400" />
                Sync Existing Calendar (.ICS or Web URL)
              </h3>
              <form onSubmit={handleImportSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Calendar Source Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. My Google Work Calendar"
                    value={externalName}
                    onChange={(e) => setExternalName(e.target.value)}
                    className="w-full text-xs p-2 bg-white/5 text-white border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">ICS Feed URL / Raw Text Data</label>
                  <textarea
                    rows={2}
                    placeholder="Paste calendar public URL, or raw .ics template blocks..."
                    value={icsInput}
                    onChange={(e) => setIcsInput(e.target.value)}
                    className="w-full text-xs p-2 bg-white/5 text-white border border-white/10 rounded-lg focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-white/10 hover:bg-white/15 text-white border border-white/10 text-[11px] font-bold px-3 py-2 rounded-lg transition cursor-pointer"
                >
                  Import and Sync Availability
                </button>
              </form>
            </div>

            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-between">
              <div>
                <h3 className="font-sans font-semibold text-white text-sm mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Google Calendar Live Sync
                </h3>

                {gcalStatus && (
                  <p className="text-[11px] text-pink-400 bg-pink-500/10 border border-pink-500/20 px-2.5 py-1.5 rounded-lg mb-3">
                    {gcalStatus}
                  </p>
                )}

                {!googleAccessToken ? (
                  <div className="space-y-3.5 pt-1">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Connect your Google Calendar live to import conflicts (so the smart auto-scheduler avoids overlaps) and export scheduled routines!
                    </p>
                    
                    <button
                      type="button"
                      id="gcal_connect_oauth_btn"
                      onClick={handleLaunchGoogleOAuth}
                      className="w-full bg-indigo-650 hover:bg-indigo-600 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg border border-white/5 shadow-indigo-650/15 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Globe className="w-4 h-4" /> Connect Automatically
                    </button>

                    <div className="text-center">
                      <button
                        type="button"
                        id="toggle_manual_token_form_btn"
                        onClick={() => setShowTokenInput(!showTokenInput)}
                        className="text-[10.5px] text-slate-400 hover:text-white font-medium underline transition"
                      >
                        {showTokenInput ? "Hide Developer Auth" : "Advanced: Developer Token Connection"}
                      </button>
                    </div>

                    {showTokenInput && (
                      <form onSubmit={handleManualTokenSubmit} className="bg-slate-900/40 p-3 rounded-lg border border-white/5 mt-2 space-y-2">
                        <p className="text-[10px] text-slate-400 leading-normal">
                          For instant, reliable iframe connection, you can copy an ACCESS TOKEN from the <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-indigo-400 underline hover:text-indigo-300">Google OAuth Playground</a> (Calendar API v3), then paste it here:
                        </p>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            required
                            placeholder="ya29.a0Acv..."
                            value={manualTokenVal}
                            onChange={(e) => setManualTokenVal(e.target.value)}
                            className="bg-white/5 text-[11px] p-2 rounded border border-white/10 text-white flex-1 focus:outline-none focus:border-indigo-400"
                          />
                          <button
                            type="submit"
                            className="bg-indigo-650 text-white text-[11.5px] px-3 py-1.5 rounded font-bold hover:bg-indigo-500 cursor-pointer"
                          >
                            Set Token
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Connected Account</p>
                        <p className="text-xs font-mono text-slate-200 mt-0.5 max-w-[200px] truncate" title={googleEmail}>
                          {googleEmail || "Active OAuth User"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDisconnectGoogle}
                        className="text-[10px] bg-white/5 hover:bg-red-500/10 text-slate-300 hover:text-red-400 border border-white/10 p-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                        title="Disconnect"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center">
                      <button
                        type="button"
                        id="gcal_import_btn"
                        disabled={importingGcal}
                        onClick={handleImportGoogleCalendar}
                        className="bg-white/5 hover:bg-white/10 text-slate-100 text-xs font-bold py-2.5 px-3 border border-white/10 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {importingGcal ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                        ) : (
                          <Download className="w-4 h-4 text-indigo-400" />
                        )}
                        <span>{importingGcal ? "Importing..." : "📥 Import Busy Blocks"}</span>
                      </button>

                      <button
                        type="button"
                        id="gcal_bulk_export_btn"
                        disabled={exportingAll}
                        onClick={handleBulkExportUnexported}
                        className="bg-indigo-650/20 hover:bg-indigo-650/30 text-indigo-200 text-xs font-bold py-2.5 px-3 border border-indigo-500/20 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        {exportingAll ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-pink-400" />
                        ) : (
                          <Send className="w-4 h-4 text-pink-400" />
                        )}
                        <span>{exportingAll ? "Exporting..." : "📤 Export All Routines"}</span>
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal italic text-center">
                      * Imported Google events act as busy exclusions in auto-scheduling. Exporting pushes workouts & study blocks to your Google app.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Calendar Render Stage */}
      <div className="flex-1 overflow-y-auto" id="calendar_grid_wrapper">
        
        {/* VIEW 1: WEEKLY VIEW GRID */}
        {viewMode === "week" && (
          <div className="min-w-[800px] flex flex-col h-full">
            {/* Days row header */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-white/10 sticky top-0 bg-[#0d0e16]/95 backdrop-blur-md z-10 shadow-lg">
              <div className="p-3 text-center text-xs font-bold text-slate-400 border-r border-white/10 self-center">Time (UTC)</div>
              {weekDates.map((day, dIdx) => {
                const todayFlag = isSameDay(day, new Date());
                return (
                  <div 
                    key={dIdx} 
                    className={`p-3 text-center border-r border-white/10 ${
                      todayFlag ? "bg-indigo-500/10 text-indigo-400" : "text-slate-300"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider">
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className={`text-sm mt-0.5 font-bold rounded-lg inline-block w-7 h-7 leading-7 ${
                      todayFlag ? "bg-indigo-650 text-white text-center shadow-lg shadow-indigo-500/25" : ""
                    }`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hourly schedule rows */}
            <div className="relative flex-1 bg-transparent">
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-white/5 h-16 min-h-16">
                  {/* Hour Label */}
                  <div className="p-1 px-2 text-right text-[10px] font-mono text-slate-400 border-r border-white/10 bg-transparent select-none whitespace-nowrap self-center">
                    {hour === 12 ? "12:00 PM" : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
                  </div>

                  {/* Day Cells background */}
                  {Array.from({ length: 7 }).map((_, dIdx) => (
                    <div 
                      key={dIdx} 
                      className="border-r border-white/5 hover:bg-white/5 relative group"
                    >
                      {/* Empty cell hover creation help */}
                      <button 
                        onClick={() => {
                          const dateObj = weekDates[dIdx];
                          setNewDay(dateObj.toISOString().split("T")[0]);
                          setNewStartTime(`${String(hour).padStart(2, "0")}:00`);
                          setNewEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
                          setShowAddModal(true);
                        }}
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-indigo-500/10 flex items-center justify-center transition-opacity cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-indigo-400" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {/* Absolute Positioned Events on parameters */}
              {events.map((evt) => {
                const evtStart = new Date(evt.start);
                const evtEnd = new Date(evt.end);
                
                // Find day of week relative to startOfWeek (0-6)
                const dayDiff = weekDates.findIndex(d => isSameDay(d, evtStart));
                if (dayDiff === -1) return null; // not this week

                const startHour = evtStart.getHours() + evtStart.getMinutes() / 60;
                const endHour = evtEnd.getHours() + evtEnd.getMinutes() / 60;
                
                // Scale values
                const hourHeight = 64; // pixels per hour
                const minOffsetHour = 8; // we start at 08:00
                const topPixel = (startHour - minOffsetHour) * hourHeight;
                const heightPixel = Math.max((endHour - startHour) * hourHeight, 35); // minimum height

                // Color themes
                const getEventColors = (type: string) => {
                  if (type === "workout") return "border-rose-500 bg-rose-950/40 text-rose-200 hover:bg-rose-950/60";
                  if (type === "study") return "border-cyan-500 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-950/60";
                  if (type === "external") return "border-slate-500 bg-slate-800/40 text-slate-350 hover:bg-slate-800/60";
                  return "border-emerald-500 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-950/60";
                };

                return (
                  <div
                    key={evt.id}
                    id={`event_card_week_${evt.id}`}
                    className={`absolute p-2 border-l-4 rounded-lg shadow-md hover:shadow-lg text-left transition-all overflow-hidden ${getEventColors(evt.type)}`}
                    style={{
                      left: `calc(80px + (${dayDiff} * (100% - 80px) / 7) + 2px)`,
                      width: `calc(((100% - 80px) / 7) - 4px)`,
                      top: `${topPixel}px`,
                      height: `${heightPixel}px`,
                      zIndex: 5
                    }}
                  >
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h4 className={`text-[11px] font-bold leading-tight ${evt.completed ? "line-through text-slate-400 opacity-60" : ""}`}>
                            {evt.title}
                          </h4>
                        </div>
                        <p className="text-[9px] opacity-80 flex items-center gap-0.5 font-mono mt-0.5 select-none">
                          <Clock className="w-2.5 h-2.5" />
                          {evtStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-1 mt-1 gap-1">
                        <button
                          id={`complete_event_btn_week_${evt.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompleteEvent(evt.id);
                          }}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 transition cursor-pointer ${
                            evt.completed 
                              ? "bg-emerald-600 text-white" 
                              : "bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 font-bold" />
                          {evt.completed ? "Done" : "Mark Done"}
                        </button>
                        
                        {googleAccessToken && evt.type !== "external" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportToGoogleCalendar(evt);
                            }}
                            disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                            className={`p-1 rounded transition cursor-pointer ${
                              exportStatus[evt.id] === "success"
                                ? "text-emerald-400"
                                : exportStatus[evt.id] === "error"
                                ? "text-red-400"
                                : exportStatus[evt.id] === "syncing"
                                ? "text-indigo-400 animate-spin"
                                : "text-slate-400 hover:text-indigo-400"
                            }`}
                            title={
                              exportStatus[evt.id] === "success"
                                ? "Synced to Google!"
                                : "Export to Google Calendar"
                            }
                          >
                            {exportStatus[evt.id] === "success" ? (
                              <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                            ) : (
                              <CalendarCheck className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        <button
                          id={`delete_event_btn_week_${evt.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEvent(evt.id);
                          }}
                          className="opacity-50 hover:opacity-100 text-slate-300 hover:text-red-400 p-0.5 transition cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: DAILY VIEW GRID */}
        {viewMode === "day" && (
          <div className="flex flex-col h-full bg-transparent">
            <div className="border-b border-white/10 p-4 sticky top-0 bg-[#0c0d16]/95 backdrop-blur-md z-10 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
              <p className="text-xs text-slate-300 font-medium font-sans">Viewing single day schedule.</p>
            </div>
            
            <div className="relative flex-1 bg-transparent">
              {hours.map((hour) => {
                const hourEvents = events.filter(evt => {
                  const s = new Date(evt.start);
                  return isSameDay(s, currentDate) && s.getHours() === hour;
                });

                return (
                  <div key={hour} className="grid grid-cols-[100px_1fr] border-b border-white/5 h-24 min-h-24">
                    <div className="p-3 text-right text-xs font-mono text-slate-400 border-r border-white/10 bg-transparent select-none">
                      {hour === 12 ? "12:00 PM" : hour > 12 ? `${hour - 12}:00 PM` : `${hour}:00 AM`}
                    </div>
                    
                    <div className="p-2 flex flex-wrap gap-2 items-center bg-transparent relative group">
                      {hourEvents.length === 0 ? (
                        <button
                          onClick={() => {
                            setNewDay(currentDate.toISOString().split("T")[0]);
                            setNewStartTime(`${String(hour).padStart(2, "0")}:00`);
                            setNewEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
                            setShowAddModal(true);
                          }}
                          className="text-[10px] text-slate-400 group-hover:text-indigo-400 font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all absolute inset-0 pl-4 justify-start cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Block hour
                        </button>
                      ) : (
                        hourEvents.map(evt => {
                          const getStyle = (type: string) => {
                            if (type === "workout") return "border-rose-500 bg-rose-950/40 text-rose-200 border-l-4";
                            if (type === "study") return "border-cyan-500 bg-cyan-950/40 text-cyan-200 border-l-4";
                            return "border-indigo-500 bg-indigo-950/40 text-indigo-200 border-l-4";
                          };
                          return (
                            <div 
                              key={evt.id} 
                              id={`event_card_day_${evt.id}`}
                              className={`p-3 rounded-xl shadow-md max-w-sm flex-1 ${getStyle(evt.type)}`}
                            >
                              <div className="flex justify-between items-start mb-1.5">
                                <h4 className={`text-xs font-bold ${evt.completed ? "line-through opacity-50" : ""}`}>{evt.title}</h4>
                                <span className="text-[9px] font-mono opacity-80">
                                  {new Date(evt.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              {evt.notes && <p className="text-[10px] opacity-75 mb-2 italic">"{evt.notes}"</p>}
                              <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/5 gap-1">
                                <button
                                  id={`complete_event_btn_day_${evt.id}`}
                                  onClick={() => onToggleCompleteEvent(evt.id)}
                                  className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                                    evt.completed 
                                      ? "bg-emerald-600 text-white" 
                                      : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                                  }`}
                                >
                                  {evt.completed ? "Done" : "Mark Done"}
                                </button>

                                {googleAccessToken && evt.type !== "external" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExportToGoogleCalendar(evt);
                                    }}
                                    disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                                    className={`p-1.5 rounded transition cursor-pointer ${
                                      exportStatus[evt.id] === "success"
                                        ? "text-emerald-400"
                                        : exportStatus[evt.id] === "error"
                                        ? "text-red-400"
                                        : exportStatus[evt.id] === "syncing"
                                        ? "text-indigo-400 animate-spin"
                                        : "text-slate-400 hover:text-indigo-400"
                                    }`}
                                    title={
                                      exportStatus[evt.id] === "success"
                                        ? "Synced to Google!"
                                        : "Export to Google Calendar"
                                    }
                                  >
                                    {exportStatus[evt.id] === "success" ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                                    ) : (
                                      <CalendarCheck className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}

                                <button 
                                  id={`delete_event_btn_day_${evt.id}`}
                                  onClick={() => onDeleteEvent(evt.id)}
                                  className="text-red-400 opacity-70 hover:opacity-100 transition p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 3: SIMPLIFIED LIST VIEW */}
        {viewMode === "list" && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-semibold text-white text-sm">All Upcoming Blocks</h3>
              <p className="text-xs text-slate-400 font-medium font-sans">Sorted by chronological priority.</p>
            </div>

            {events.length === 0 ? (
              <div className="text-center p-8 border-2 border-dashed border-white/10 bg-white/5 rounded-2xl">
                <CalendarIcon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No events scheduled. Use automatic smart schedule solver!</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[...events]
                  .sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                  .map(evt => {
                    const s = new Date(evt.start);
                    return (
                      <div 
                        key={evt.id} 
                        id={`event_card_list_${evt.id}`}
                        className={`p-3 border border-white/10 rounded-xl flex items-center justify-between gap-3 bg-white/5 hover:bg-white/10 transition ${
                          evt.completed ? "bg-white/[0.02] opacity-60" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full shrink-0 ${
                            evt.type === "workout" ? "bg-rose-500" : evt.type === "study" ? "bg-cyan-500" : "bg-emerald-500"
                          }`} />
                          <div>
                            <h4 className={`text-xs font-bold text-white ${evt.completed ? "line-through opacity-75" : ""}`}>{evt.title}</h4>
                            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <span className="font-semibold text-slate-300">{s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                              <span>•</span>
                              <span>{s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              {evt.notes && <span className="italic">("{evt.notes}")</span>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            id={`complete_event_btn_list_${evt.id}`}
                            onClick={() => onToggleCompleteEvent(evt.id)}
                            className={`text-[10px] p-2 px-3 leading-none rounded-lg font-bold cursor-pointer transition ${
                              evt.completed 
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" 
                                : "bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20"
                            }`}
                          >
                            {evt.completed ? "Completed!" : "Complete"}
                          </button>

                          {googleAccessToken && evt.type !== "external" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportToGoogleCalendar(evt);
                              }}
                              disabled={exportStatus[evt.id] === "syncing" || exportStatus[evt.id] === "success"}
                              className={`p-2 border rounded-lg transition border-white/10 cursor-pointer ${
                                exportStatus[evt.id] === "success"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : exportStatus[evt.id] === "error"
                                  ? "bg-red-500/10 text-red-400"
                                  : exportStatus[evt.id] === "syncing"
                                  ? "bg-indigo-650/10 text-indigo-400 animate-spin"
                                  : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-indigo-400 focus:text-indigo-400"
                              }`}
                              title={
                                exportStatus[evt.id] === "success"
                                  ? "Synced to Google!"
                                  : "Export to Google Calendar"
                              }
                            >
                              {exportStatus[evt.id] === "success" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                              ) : (
                                <CalendarCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          <button
                            id={`delete_event_btn_list_${evt.id}`}
                            onClick={() => onDeleteEvent(evt.id)}
                            className="bg-white/5 hover:bg-rose-500/20 text-slate-450 hover:text-rose-450 p-2 rounded-lg transition border border-white/5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL WINDOW: Create manual schedule events */}
      {showAddModal && (
        <div id="add_event_modal_backdrop" className="fixed inset-0 bg-[#020205]/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div id="add_event_modal_card" className="bg-[#0f111a] border border-white/12 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <h3 className="font-sans font-semibold text-white text-base mb-4 flex items-center gap-1.5">
              <CalendarIcon className="w-5 h-5 text-indigo-400" />
              Manually Schedule Slot
            </h3>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  id="event_title_input"
                  placeholder="e.g. Legs Cardio or React Tutorial"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type Focus</label>
                  <select
                    id="event_type_select"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as CalendarEvent["type"])}
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 transition"
                  >
                    <option value="workout" className="bg-[#0f111a]">Workout Session</option>
                    <option value="study" className="bg-[#0f111a]">Study Block</option>
                    <option value="personal" className="bg-[#0f111a]">Personal / Leisure</option>
                    <option value="external" className="bg-[#0f111a]">Busy Block (External)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Associate Goal</label>
                  <select
                    id="event_goal_select"
                    value={newGoalId}
                    onChange={(e) => setNewGoalId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#0f111a] border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 transition"
                  >
                    <option value="" className="bg-[#0f111a]">None / Standalone</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id} className="bg-[#0f111a]">
                        {g.name} ({g.weeklyTarget}x/wk)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</label>
                <input
                  type="date"
                  required
                  id="event_date_input"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    id="event_start_time_input"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    id="event_end_time_input"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes / Instructions</label>
                <textarea
                  id="event_notes_textarea"
                  placeholder="e.g. focus on Javascript array methods..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition placeholder:text-slate-500"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  id="close_add_event_modal_btn"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs font-semibold px-4 py-2.5 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit_add_event_btn"
                  className="text-xs font-semibold px-4 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 cursor-pointer transition"
                >
                  Confirm Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
