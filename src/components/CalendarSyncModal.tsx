import React, { useState, useMemo } from "react";
import { 
  X, 
  Calendar as CalendarIcon, 
  Globe, 
  Upload, 
  Download, 
  Check, 
  Copy, 
  ExternalLink, 
  ShieldCheck, 
  AlertCircle, 
  RefreshCw, 
  Clock, 
  Plus, 
  Trash2, 
  Sparkles,
  Layers,
  Send,
  HelpCircle,
  FileText
} from "lucide-react";
import { CalendarEvent, Goal } from "../types";
import { 
  parseIcsCalendar, 
  generateIcsCalendar, 
  downloadIcsFile, 
  getGoogleCalendarEventUrl, 
  getOutlookCalendarEventUrl, 
  getAppleCalendarWebcalUrl, 
  getGoogleCalendarSubscribeUrl, 
  getOutlookCalendarSubscribeUrl 
} from "../lib/icalParser";

interface CalendarSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  goals: Goal[];
  userEmail: string;
  onImportCalendar: (name: string, dataString: string, realEvents?: CalendarEvent[]) => void;
  onClearExternalEvents?: () => void;
  onAutoRebalanceAroundBusy?: () => void;
  // Google OAuth legacy props
  googleAccessToken?: string;
  googleEmail?: string;
  onConnectGoogleOAuth?: () => void;
  onDisconnectGoogleOAuth?: () => void;
  onExportToGoogleCalendar?: (evt: CalendarEvent) => void;
  onBulkExportGoogle?: () => void;
  exportingAll?: boolean;
  unexportedCount?: number;
  autoGcalExport?: boolean;
  onToggleAutoGcalExport?: (enabled: boolean) => void;
}

export default function CalendarSyncModal({
  isOpen,
  onClose,
  events,
  goals,
  userEmail,
  onImportCalendar,
  onClearExternalEvents,
  onAutoRebalanceAroundBusy,
  googleAccessToken,
  googleEmail,
  onConnectGoogleOAuth,
  onDisconnectGoogleOAuth,
  onExportToGoogleCalendar,
  onBulkExportGoogle,
  exportingAll = false,
  unexportedCount = 0,
  autoGcalExport = false,
  onToggleAutoGcalExport
}: CalendarSyncModalProps) {
  const [activeTab, setActiveTab] = useState<"subscribe" | "push" | "import" | "oauth">("subscribe");
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [copiedWebcal, setCopiedWebcal] = useState(false);
  
  // Import tab state
  const [importSourceName, setImportSourceName] = useState("External Calendar");
  const [importIcsUrl, setImportIcsUrl] = useState("");
  const [importIcsText, setImportIcsText] = useState("");
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [importStatusMessage, setImportStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [previewParsedEvents, setPreviewParsedEvents] = useState<CalendarEvent[] | null>(null);

  // Platform guide selector in Tab 1
  const [guidePlatform, setGuidePlatform] = useState<"apple" | "google" | "outlook">("apple");

  // Determine origin for live feed URL
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://ai-studio.google";
  const liveFeedHttpUrl = `${currentOrigin}/api/calendar/feed.ics?email=${encodeURIComponent(userEmail || "rounigorgees@gmail.com")}`;
  const liveFeedWebcalUrl = getAppleCalendarWebcalUrl(liveFeedHttpUrl);

  // Statistics & Conflict calculation
  const externalEvents = useMemo(() => events.filter(e => e.type === "external"), [events]);
  const userGoalEvents = useMemo(() => events.filter(e => e.type !== "external"), [events]);

  const conflictsWithExternal = useMemo(() => {
    if (externalEvents.length === 0 || userGoalEvents.length === 0) return [];
    const conflicts: { goalEvent: CalendarEvent; externalEvent: CalendarEvent }[] = [];

    userGoalEvents.forEach(gEvt => {
      const gStart = new Date(gEvt.start).getTime();
      const gEnd = new Date(gEvt.end).getTime();

      const overlap = externalEvents.find(ext => {
        const eStart = new Date(ext.start).getTime();
        const eEnd = new Date(ext.end).getTime();
        return gStart < eEnd && gEnd > eStart;
      });

      if (overlap) {
        conflicts.push({ goalEvent: gEvt, externalEvent: overlap });
      }
    });

    return conflicts;
  }, [externalEvents, userGoalEvents]);

  if (!isOpen) return null;

  const handleCopyFeedUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(liveFeedHttpUrl);
      setCopiedFeed(true);
      setTimeout(() => setCopiedFeed(false), 2500);
    }
  };

  const handleCopyWebcalUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(liveFeedWebcalUrl);
      setCopiedWebcal(true);
      setTimeout(() => setCopiedWebcal(false), 2500);
    }
  };

  // 1-Click Subscribe in Apple Calendar
  const handleSubscribeApple = () => {
    window.location.href = liveFeedWebcalUrl;
  };

  // 1-Click Subscribe in Google Calendar
  const handleSubscribeGoogle = () => {
    const targetUrl = getGoogleCalendarSubscribeUrl(liveFeedHttpUrl);
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  // 1-Click Subscribe in Microsoft Outlook
  const handleSubscribeOutlook = () => {
    const targetUrl = getOutlookCalendarSubscribeUrl(liveFeedHttpUrl, "Calendar Goals & Routines");
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  // Download entire schedule as .ics
  const handleDownloadFullIcs = () => {
    const icsString = generateIcsCalendar(userGoalEvents, goals, {
      calendarName: "Calendar Goals & Routines Schedule"
    });
    downloadIcsFile("calendar_goals_schedule.ics", icsString);
  };

  // Handle local .ics file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportSourceName(file.name.replace(/\.ics$/i, ""));
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportIcsText(content);
        try {
          const parsed = parseIcsCalendar(content, file.name.replace(/\.ics$/i, ""));
          setPreviewParsedEvents(parsed.events);
          setImportStatusMessage({
            text: `Detected ${parsed.events.length} calendar event(s) from "${file.name}". Click "Confirm Import" to load them into your schedule!`,
            type: "info"
          });
        } catch (err: any) {
          setImportStatusMessage({
            text: `Error reading file: ${err?.message || "Invalid iCalendar formatting"}`,
            type: "error"
          });
        }
      }
    };
    reader.readAsText(file);
  };

  // Handle remote URL fetch via server proxy
  const handleFetchRemoteUrl = async () => {
    if (!importIcsUrl.trim()) return;
    setIsFetchingUrl(true);
    setImportStatusMessage(null);

    try {
      const res = await fetch("/api/calendar/fetch-remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importIcsUrl.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server responded with ${res.status}`);
      }

      const parsed = parseIcsCalendar(data.icsContent, importSourceName || "Remote Calendar Feed");
      setPreviewParsedEvents(parsed.events);
      setImportIcsText(data.icsContent);
      setImportStatusMessage({
        text: `Successfully fetched feed! Found ${parsed.events.length} event(s). Click "Confirm Import" to apply as busy constraints.`,
        type: "success"
      });
    } catch (err: any) {
      setImportStatusMessage({
        text: `Failed to fetch URL: ${err.message || err}`,
        type: "error"
      });
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Confirm import of parsed events
  const handleConfirmImport = () => {
    if (!previewParsedEvents || previewParsedEvents.length === 0) {
      if (importIcsText.trim()) {
        const parsed = parseIcsCalendar(importIcsText, importSourceName || "External Calendar");
        if (parsed.events.length > 0) {
          onImportCalendar(importSourceName || "External Calendar", importIcsText, parsed.events);
          setImportStatusMessage({
            text: `Imported ${parsed.events.length} busy events! Auto-scheduler will now protect these hours.`,
            type: "success"
          });
          setPreviewParsedEvents(null);
          setImportIcsText("");
          setImportIcsUrl("");
          return;
        }
      }
      setImportStatusMessage({ text: "No valid events found to import.", type: "error" });
      return;
    }

    onImportCalendar(importSourceName || "External Calendar", importIcsText, previewParsedEvents);
    setImportStatusMessage({
      text: `Successfully imported ${previewParsedEvents.length} events as busy conflict exclusions!`,
      type: "success"
    });
    setPreviewParsedEvents(null);
    setImportIcsText("");
    setImportIcsUrl("");
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in text-left"
      onClick={onClose}
    >
      <div 
        id="calendar_sync_hub_modal"
        className="bg-[#10121d] border border-white/15 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Calendar Sync & Integration Hub</h2>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> Universal RFC 5545
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Direct live sync with <strong className="text-slate-300">Apple Calendar</strong>, <strong className="text-slate-300">Google Calendar</strong>, and <strong className="text-slate-300">Microsoft Outlook</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-white/[0.01] px-4 pt-2 gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            id="tab_sync_subscribe"
            onClick={() => setActiveTab("subscribe")}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === "subscribe"
                ? "text-indigo-400 border-indigo-500 bg-white/[0.04]"
                : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.02]"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Live Subscription Feed</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">LIVE</span>
          </button>

          <button
            type="button"
            id="tab_sync_push"
            onClick={() => setActiveTab("push")}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === "push"
                ? "text-indigo-400 border-indigo-500 bg-white/[0.04]"
                : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.02]"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>1-Click Push & Export</span>
          </button>

          <button
            type="button"
            id="tab_sync_import"
            onClick={() => setActiveTab("import")}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === "import"
                ? "text-indigo-400 border-indigo-500 bg-white/[0.04]"
                : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.02]"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import External Busy Times</span>
            {externalEvents.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                {externalEvents.length}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab_sync_oauth"
            onClick={() => setActiveTab("oauth")}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === "oauth"
                ? "text-indigo-400 border-indigo-500 bg-white/[0.04]"
                : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.02]"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Google Account Direct API</span>
            {googleAccessToken && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* ────────────────────────────────────────────────────────── */}
          {/* TAB 1: LIVE DIRECT SUBSCRIPTION FEED */}
          {/* ────────────────────────────────────────────────────────── */}
          {activeTab === "subscribe" && (
            <div className="space-y-6">
              {/* Top Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Automatic Two-Way Synchronization
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    Subscribe once in your favorite calendar app. Any workouts, study blocks, and routines scheduled by the AI Coach will automatically appear and update on your iPhone, Mac, Android, or PC!
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/15 px-2.5 py-1 rounded-lg border border-indigo-500/30">
                    Auto-Refreshes Every 15m
                  </span>
                </div>
              </div>

              {/* 3 Main Direct Platform Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* 1. Apple Calendar */}
                <div className="bg-white/5 border border-white/10 hover:border-white/20 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-2xl">🍏</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                        Mac / iOS
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Apple Calendar</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      1-click opens Apple Calendar on Mac, iPhone, or iPad and sets up automatic background updates.
                    </p>
                  </div>
                  <button
                    type="button"
                    id="btn_subscribe_apple"
                    onClick={handleSubscribeApple}
                    className="mt-4 w-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs py-2.5 px-3 rounded-lg border border-white/15 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                    <span>Open in Apple Calendar</span>
                  </button>
                </div>

                {/* 2. Google Calendar */}
                <div className="bg-white/5 border border-white/10 hover:border-indigo-500/30 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-2xl">📅</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
                        Web / Android
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Google Calendar</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Add via &quot;Add from URL&quot; or use 1-click .ics file import for instant appearance in Google Calendar.
                    </p>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <button
                      type="button"
                      id="btn_subscribe_google"
                      onClick={handleSubscribeGoogle}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 px-3 rounded-lg border border-indigo-400/30 shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-indigo-200" />
                      <span>Add by URL (Google)</span>
                    </button>
                    <button
                      type="button"
                      id="btn_instant_import_google_card"
                      onClick={handleDownloadFullIcs}
                      className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-[11px] py-1.5 px-3 rounded-lg border border-emerald-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                    >
                      <Download className="w-3 h-3 text-emerald-400" />
                      <span>⚡ Instant Import (.ics)</span>
                    </button>
                  </div>
                </div>

                {/* 3. Microsoft Outlook */}
                <div className="bg-white/5 border border-white/10 hover:border-sky-500/30 p-4 rounded-xl flex flex-col justify-between transition group">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-2xl">📮</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded">
                        Web / Desktop
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Microsoft Outlook</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Subscribes in Outlook on the web or Microsoft 365 desktop app with real-time updates.
                    </p>
                  </div>
                  <button
                    type="button"
                    id="btn_subscribe_outlook"
                    onClick={handleSubscribeOutlook}
                    className="mt-4 w-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-2.5 px-3 rounded-lg border border-sky-400/30 shadow-md shadow-sky-600/20 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-200" />
                    <span>Subscribe in Outlook</span>
                  </button>
                </div>
              </div>

              {/* Feed URL Boxes (Manual Copy) */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Your Live Calendar Feed URLs
                  </label>
                  <span className="text-[10px] text-slate-400">RFC 5545 iCalendar standard</span>
                </div>

                {/* HTTP Feed URL */}
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 mb-1 block">HTTPS Subscription URL (Google Calendar / Outlook / Any app):</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={liveFeedHttpUrl}
                      className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 flex-1 select-all focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      id="btn_copy_feed_http"
                      onClick={handleCopyFeedUrl}
                      className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      {copiedFeed ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedFeed ? "Copied!" : "Copy URL"}</span>
                    </button>
                  </div>
                </div>

                {/* Webcal Feed URL */}
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 mb-1 block">WebCal Protocol URL (Apple Calendar / macOS / iOS native):</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={liveFeedWebcalUrl}
                      className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 flex-1 select-all focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      id="btn_copy_feed_webcal"
                      onClick={handleCopyWebcalUrl}
                      className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      {copiedWebcal ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedWebcal ? "Copied!" : "Copy WebCal"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="bg-slate-900/40 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                    How to Subscribe on Your Device
                  </h4>
                  <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setGuidePlatform("apple")}
                      className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                        guidePlatform === "apple" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Apple Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuidePlatform("google")}
                      className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                        guidePlatform === "google" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Google Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuidePlatform("outlook")}
                      className={`px-2.5 py-1 rounded font-bold transition cursor-pointer ${
                        guidePlatform === "outlook" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Outlook
                    </button>
                  </div>
                </div>

                {guidePlatform === "apple" && (
                  <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Click <strong className="text-white">&quot;Open in Apple Calendar&quot;</strong> above, OR in Apple Calendar on Mac choose <strong className="text-white">File &gt; New Calendar Subscription</strong>.</li>
                    <li>On iPhone / iPad: Go to <strong className="text-white">Settings &gt; Calendar &gt; Accounts &gt; Add Account &gt; Other &gt; Add Subscribed Calendar</strong>, and paste the WebCal URL.</li>
                    <li>Set <strong className="text-white">Auto-refresh</strong> to <strong className="text-emerald-400 font-semibold">Every 15 minutes</strong> or <strong className="text-emerald-400 font-semibold">Every hour</strong>.</li>
                    <li>Done! All workouts and study blocks now sync straight to your Apple devices automatically.</li>
                  </ol>
                )}

                {guidePlatform === "google" && (
                  <div className="space-y-3">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5 text-emerald-400" />
                          Recommended: Instant 1-Click File Import (Takes 10 seconds)
                        </span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded">
                          Shows Up Immediately
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Google Calendar background crawlers take up to 24 hours to sync external URLs and cannot pass development preview security cookies. To see all your sessions in Google Calendar right away:
                      </p>
                      <ol className="text-xs text-slate-200 space-y-1.5 list-decimal list-inside leading-relaxed pl-1">
                        <li>
                          Click{" "}
                          <button
                            type="button"
                            onClick={handleDownloadFullIcs}
                            className="font-bold text-emerald-400 underline hover:text-emerald-300 cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Download .ICS File</span>
                          </button>
                        </li>
                        <li>
                          In Google Calendar, open{" "}
                          <a
                            href="https://calendar.google.com/calendar/u/0/r/settings/export"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-indigo-400 underline hover:text-indigo-300 inline-flex items-center gap-1"
                          >
                            <span>Settings ⚙️ &gt; Import &amp; Export</span>
                            <ExternalLink className="w-3 h-3 inline" />
                          </a>
                        </li>
                        <li>Under <strong className="text-white">&quot;Import&quot;</strong>, select the downloaded file and click <strong className="text-white">&quot;Import&quot;</strong>.</li>
                      </ol>
                    </div>

                    <div className="pt-1">
                      <p className="text-[11px] font-semibold text-slate-400 mb-1">Subscribed URL Method (&quot;From URL&quot;):</p>
                      <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside leading-relaxed">
                        <li>In Google Calendar, click the <strong className="text-slate-300">+</strong> next to &quot;Other calendars&quot; &gt; select <strong className="text-slate-300">&quot;From URL&quot;</strong>.</li>
                        <li>Paste your HTTPS Subscription URL and click &quot;Add calendar&quot;.</li>
                        <li><em>Note: Google Calendar crawls and indexes external URLs asynchronously over 8–24 hours.</em></li>
                      </ol>
                    </div>
                  </div>
                )}

                {guidePlatform === "outlook" && (
                  <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Click <strong className="text-white">&quot;Subscribe in Outlook&quot;</strong> above, or open <strong className="text-white">outlook.live.com/calendar</strong>.</li>
                    <li>Click <strong className="text-white">&quot;Add calendar&quot;</strong> in the left pane, then select <strong className="text-white">&quot;Subscribe from web&quot;</strong>.</li>
                    <li>Paste your HTTPS Subscription URL, give it the name <strong className="text-white">&quot;Calendar Goals&quot;</strong>, and click <strong className="text-white">&quot;Import&quot;</strong>.</li>
                    <li>Outlook on Web, Windows, and Mac will automatically stay in sync with your schedule.</li>
                  </ol>
                )}
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────── */}
          {/* TAB 2: 1-CLICK PUSH & EXPORT */}
          {/* ────────────────────────────────────────────────────────── */}
          {activeTab === "push" && (
            <div className="space-y-6">
              {/* Full Calendar File Export Card */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-400" />
                    Download Full Schedule File (.ics)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Export all {userGoalEvents.length} scheduled workout and study sessions as a universal file you can double-click or drag into any calendar app.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn_download_full_ics"
                  onClick={handleDownloadFullIcs}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer shrink-0 active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .ics File</span>
                </button>
              </div>

              {/* 1-Click Upcoming Sessions Web Intent Pusher */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    Upcoming Goal Sessions (1-Click Add to Web Calendar)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    No sign-in required • Opens directly in web tab
                  </span>
                </div>

                {userGoalEvents.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                    <p className="text-xs text-slate-400">No scheduled sessions found. Create goals or auto-schedule your calendar first!</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {userGoalEvents.slice(0, 10).map(evt => {
                      const tiedGoal = goals.find(g => g.id === evt.goalId);
                      const gCalUrl = getGoogleCalendarEventUrl(evt, tiedGoal);
                      const outlookUrl = getOutlookCalendarEventUrl(evt, tiedGoal);
                      const dateFormatted = new Date(evt.start).toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric"
                      });
                      const timeFormatted = `${new Date(evt.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${new Date(evt.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

                      return (
                        <div
                          key={evt.id}
                          className="bg-white/5 border border-white/10 hover:border-white/20 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg shrink-0">
                              {evt.icon || tiedGoal?.icon || (evt.type === "workout" ? "🏋️" : "📚")}
                            </span>
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-white truncate">{evt.title}</h5>
                              <p className="text-[11px] text-slate-400">
                                {dateFormatted} • {timeFormatted}
                                {evt.energyLevel && (
                                  <span className="ml-2 text-[10px] font-mono text-indigo-300 uppercase">
                                    [{evt.energyLevel.replace("_", " ")}]
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <a
                              href={gCalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold flex items-center gap-1 transition"
                              title="Add directly to Google Calendar"
                            >
                              <span>📅 Add to Google</span>
                            </a>
                            <a
                              href={outlookUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1 transition"
                              title="Add directly to Microsoft Outlook"
                            >
                              <span>📮 Add to Outlook</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────── */}
          {/* TAB 3: IMPORT EXTERNAL BUSY TIMES (CONFLICT SHIELD) */}
          {/* ────────────────────────────────────────────────────────── */}
          {activeTab === "import" && (
            <div className="space-y-6">
              {/* Conflict Shield Banner */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                conflictsWithExternal.length > 0 
                  ? "bg-amber-950/30 border-amber-500/30" 
                  : "bg-white/[0.02] border-white/10"
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 ${conflictsWithExternal.length > 0 ? "text-amber-400" : "text-emerald-400"}`} />
                    <h3 className="text-sm font-bold text-white">Smart Conflict Shield</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300">
                      {externalEvents.length} external busy blocks active
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {conflictsWithExternal.length > 0 ? (
                      <span className="text-amber-300 font-semibold">
                        ⚠️ Detected {conflictsWithExternal.length} schedule conflict(s) between your goals and external calendar commitments!
                      </span>
                    ) : (
                      "Imported work meetings and external classes are automatically shielded so your workouts and study blocks never collide with them."
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {conflictsWithExternal.length > 0 && onAutoRebalanceAroundBusy && (
                    <button
                      type="button"
                      id="btn_rebalance_around_conflicts"
                      onClick={() => {
                        onAutoRebalanceAroundBusy();
                        setImportStatusMessage({
                          text: "Schedule re-optimized! All goal sessions shifted around your external calendar meetings.",
                          type: "success"
                        });
                      }}
                      className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Re-align Goals</span>
                    </button>
                  )}

                  {externalEvents.length > 0 && onClearExternalEvents && (
                    <button
                      type="button"
                      id="btn_clear_external_blocks"
                      onClick={() => {
                        if (confirm(`Remove all ${externalEvents.length} imported external calendar blocks?`)) {
                          onClearExternalEvents();
                          setImportStatusMessage({
                            text: "Cleared all imported external calendar blocks.",
                            type: "info"
                          });
                        }
                      }}
                      className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-slate-300 hover:text-red-400 border border-white/10 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Clear imported busy events"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear External</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Status Message */}
              {importStatusMessage && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  importStatusMessage.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : importStatusMessage.type === "error"
                    ? "bg-red-500/10 border-red-500/30 text-red-300"
                    : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                }`}>
                  <span>{importStatusMessage.text}</span>
                  <button 
                    type="button" 
                    onClick={() => setImportStatusMessage(null)} 
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Import Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method A: File Upload (.ics) */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5 mb-1.5">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      Option A: Upload .ics Calendar File
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                      Export an .ics file from Google Calendar, Apple Calendar, or Outlook and upload it here to import busy blocks.
                    </p>

                    <label className="border-2 border-dashed border-white/15 hover:border-indigo-400/50 bg-black/20 hover:bg-white/[0.02] p-5 rounded-xl flex flex-col items-center justify-center cursor-pointer transition text-center group">
                      <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 mb-2 transition" />
                      <span className="text-xs font-bold text-white">Choose .ics file or drag &amp; drop</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Supports Apple Calendar, Google &amp; Outlook exports</span>
                      <input
                        type="file"
                        accept=".ics,text/calendar"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {previewParsedEvents && previewParsedEvents.length > 0 && (
                    <button
                      type="button"
                      id="btn_confirm_import_file"
                      onClick={handleConfirmImport}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-lg transition shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm Import ({previewParsedEvents.length} Events)</span>
                    </button>
                  )}
                </div>

                {/* Method B: Remote URL Fetch via Server Proxy */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5 mb-1.5">
                      <Globe className="w-4 h-4 text-sky-400" />
                      Option B: Paste WebCal / .ics Feed URL
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                      Paste a public shared calendar feed URL from Google, Outlook, or iCloud to load busy blocks directly.
                    </p>

                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Calendar Label</label>
                        <input
                          type="text"
                          value={importSourceName}
                          onChange={(e) => setImportSourceName(e.target.value)}
                          placeholder="e.g. Work Calendar"
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Feed URL (webcal:// or https://...)</label>
                        <input
                          type="url"
                          value={importIcsUrl}
                          onChange={(e) => setImportIcsUrl(e.target.value)}
                          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    id="btn_fetch_remote_feed"
                    disabled={isFetchingUrl || !importIcsUrl.trim()}
                    onClick={handleFetchRemoteUrl}
                    className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-lg transition shadow-md shadow-sky-600/20 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isFetchingUrl ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>{isFetchingUrl ? "Fetching Calendar Feed..." : "Fetch & Sync From URL"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ────────────────────────────────────────────────────────── */}
          {/* TAB 4: GOOGLE ACCOUNT DIRECT API (OAUTH) */}
          {/* ────────────────────────────────────────────────────────── */}
          {activeTab === "oauth" && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Globe className="w-4 h-4 text-indigo-400" />
                      Google Calendar API Account Sync
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Direct cloud API integration for authenticated Google accounts.
                    </p>
                  </div>
                  {googleAccessToken && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Connected
                    </span>
                  )}
                </div>

                {!googleAccessToken ? (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Connect your Google Account to automatically export sessions directly into your primary Google Calendar without having to manually click links.
                    </p>
                    {onConnectGoogleOAuth && (
                      <button
                        type="button"
                        id="btn_connect_google_oauth_tab"
                        onClick={onConnectGoogleOAuth}
                        className="bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold py-2.5 px-4 rounded-xl shadow-lg border border-slate-300 flex items-center gap-3 transition cursor-pointer active:scale-98"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 48 48">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </svg>
                        <span>Sign in with Google</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Active Google User</p>
                        <p className="text-xs font-mono text-slate-200 mt-0.5">{googleEmail || userEmail}</p>
                      </div>
                      {onDisconnectGoogleOAuth && (
                        <button
                          type="button"
                          onClick={onDisconnectGoogleOAuth}
                          className="text-xs bg-white/5 hover:bg-red-500/15 text-slate-300 hover:text-red-400 border border-white/10 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>

                    {/* Automatic Background Sync Toggle */}
                    <div className="p-3.5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent border border-indigo-500/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                            <RefreshCw className={`w-4 h-4 ${autoGcalExport ? "animate-spin text-emerald-400" : ""}`} />
                          </span>
                          <div>
                            <span className="text-xs font-bold text-white block">Auto-Sync Routines to Google</span>
                            <span className="text-[10px] text-slate-400">Sync all new, regenerated & rescheduled sessions automatically</span>
                          </div>
                        </div>

                        {onToggleAutoGcalExport && (
                          <button
                            type="button"
                            id="toggle_auto_gcal_sync_switch"
                            onClick={() => onToggleAutoGcalExport(!autoGcalExport)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                              autoGcalExport ? "bg-emerald-500" : "bg-slate-700"
                            }`}
                            role="switch"
                            aria-checked={autoGcalExport}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                autoGcalExport ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300/80 leading-relaxed pl-8">
                        {autoGcalExport ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <span>●</span> Enabled: Whenever routines are created, auto-scheduled, delayed, or moved, they are automatically sent straight to your Google Calendar.
                          </span>
                        ) : (
                          "Turn on to automatically export routines into your Google Calendar whenever you schedule new goals, re-balance times, or adjust your calendar."
                        )}
                      </p>
                    </div>

                    {onBulkExportGoogle && (
                      <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Manual Instant Sync</span>
                          <span className="text-[10px] text-slate-400">{userGoalEvents.length} Sessions Ready</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Pushes all scheduled workout, study, and routine blocks straight into your primary Google Calendar right now.
                        </p>
                        <button
                          type="button"
                          id="btn_bulk_export_google_oauth_tab"
                          onClick={onBulkExportGoogle}
                          disabled={exportingAll}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-98"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{exportingAll ? "Syncing to Google Calendar..." : `Sync All Routines to Google Calendar Now (${userGoalEvents.length})`}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {userGoalEvents.length} active sessions scheduled • {goals.length} target goals
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
