import { CalendarEvent, Goal } from "../types";

/**
 * Parses an iCalendar date/time string into an ISO 8601 string.
 * Supports:
 * - 20260920T143000Z (UTC)
 * - 20260920T143000 (Local / floating)
 * - 20260920 (Date only / all-day)
 */
export function parseIcsDate(value: string, tzid?: string): string {
  if (!value) return new Date().toISOString();
  const clean = value.trim().replace(/;/g, "");

  // All day date: YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    const year = parseInt(clean.substring(0, 4), 10);
    const month = parseInt(clean.substring(4, 6), 10) - 1;
    const day = parseInt(clean.substring(6, 8), 10);
    return new Date(Date.UTC(year, month, day, 9, 0, 0)).toISOString();
  }

  // DateTime: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6], 10);
    const isUtc = match[7] === "Z";

    if (isUtc) {
      return new Date(Date.UTC(year, month, day, hour, minute, second)).toISOString();
    }
    // Assume local or fallback
    return new Date(year, month, day, hour, minute, second).toISOString();
  }

  // Fallback to standard Date parse
  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Format Date to iCalendar UTC timestamp format: YYYYMMDDTHHMMSSZ
 */
export function formatIcsDateUtc(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

/**
 * Clean and unescape iCal text (commas, semicolons, escaped backslashes, newlines)
 */
export function unescapeIcsText(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * Escape text for inclusion in RFC 5545 iCalendar format
 */
export function escapeIcsText(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export interface ParsedCalendarResult {
  calendarName?: string;
  events: CalendarEvent[];
  errorCount: number;
  totalParsed: number;
}

/**
 * Unfolds folded lines (RFC 5545: lines ending with CRLF followed by space/tab)
 */
function unfoldLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const unfolded: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.substring(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

/**
 * Parse an .ics / iCalendar file string into structured CalendarEvent objects.
 * Handles Apple Calendar, Google Calendar, and Microsoft Outlook exports.
 */
export function parseIcsCalendar(rawIcs: string, sourceName?: string): ParsedCalendarResult {
  const lines = unfoldLines(rawIcs);
  const events: CalendarEvent[] = [];
  let calendarName = sourceName || "";
  let inEvent = false;
  let currentEvent: Partial<CalendarEvent> & { uid?: string; location?: string } = {};
  let errorCount = 0;
  let totalParsed = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Calendar-level name
    if (!calendarName && (rawLine.startsWith("X-WR-CALNAME:") || rawLine.startsWith("NAME:"))) {
      calendarName = unescapeIcsText(rawLine.split(":")[1] || "");
      continue;
    }

    if (rawLine === "BEGIN:VEVENT") {
      inEvent = true;
      currentEvent = {};
      continue;
    }

    if (rawLine === "END:VEVENT") {
      if (inEvent) {
        totalParsed++;
        if (currentEvent.start && (currentEvent.title || currentEvent.uid)) {
          const startIso = currentEvent.start;
          let endIso = currentEvent.end;

          // If no end time, default to 1 hour after start
          if (!endIso) {
            const s = new Date(startIso);
            endIso = new Date(s.getTime() + 60 * 60 * 1000).toISOString();
          }

          const uniqueId = currentEvent.uid
            ? `ext_${currentEvent.uid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)}`
            : `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

          const title = currentEvent.title ? currentEvent.title.trim() : "Busy: External Meeting";
          let notes = currentEvent.notes ? currentEvent.notes.trim() : "";
          if (currentEvent.location) {
            notes = notes ? `${notes} (Location: ${currentEvent.location})` : `Location: ${currentEvent.location}`;
          }

          events.push({
            id: uniqueId,
            title,
            start: startIso,
            end: endIso,
            type: "external",
            completed: false,
            notes: notes || `Imported from ${calendarName || "External Calendar"}`
          });
        } else {
          errorCount++;
        }
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIndex = rawLine.indexOf(":");
    if (colonIndex === -1) continue;

    const keyPart = rawLine.substring(0, colonIndex);
    const value = rawLine.substring(colonIndex + 1);

    const [propName, ...paramParts] = keyPart.split(";");
    const upperProp = propName.toUpperCase().trim();

    // Check for TZID param
    let tzid: string | undefined;
    for (const p of paramParts) {
      if (p.toUpperCase().startsWith("TZID=")) {
        tzid = p.substring(5).replace(/"/g, "");
      }
    }

    switch (upperProp) {
      case "UID":
        currentEvent.uid = value.trim();
        break;
      case "SUMMARY":
        currentEvent.title = unescapeIcsText(value);
        break;
      case "DESCRIPTION":
        currentEvent.notes = unescapeIcsText(value);
        break;
      case "LOCATION":
        currentEvent.location = unescapeIcsText(value);
        break;
      case "DTSTART":
        currentEvent.start = parseIcsDate(value, tzid);
        break;
      case "DTEND":
        currentEvent.end = parseIcsDate(value, tzid);
        break;
      case "STATUS":
        if (value.toUpperCase().includes("CANCEL")) {
          // Skip cancelled meetings
          currentEvent.title = undefined;
        }
        break;
    }
  }

  return {
    calendarName: calendarName || "External Calendar",
    events,
    errorCount,
    totalParsed
  };
}

/**
 * Generate standard RFC 5545 iCalendar format from our events and goals.
 * Compatible with Apple Calendar, Google Calendar, and Microsoft Outlook.
 */
export function generateIcsCalendar(
  events: CalendarEvent[],
  goals: Goal[] = [],
  options?: { calendarName?: string; includeExternal?: boolean }
): string {
  const calName = options?.calendarName || "Calendar Goals & Routines";
  const nowUtc = formatIcsDateUtc(new Date());

  const validEvents = events.filter(e => {
    if (!options?.includeExternal && e.type === "external") return false;
    return Boolean(e.start && e.end);
  });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google AI Studio//Calendar Goals & AI Coach//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M"
  ];

  for (const evt of validEvents) {
    const startUtc = formatIcsDateUtc(evt.start);
    const endUtc = formatIcsDateUtc(evt.end);
    const tiedGoal = goals.find(g => g.id === evt.goalId);
    const iconPrefix = evt.icon || tiedGoal?.icon || (evt.type === "workout" ? "🏋️" : evt.type === "study" ? "📚" : "🎯");
    const summary = `${iconPrefix} ${evt.title}`;

    let desc = evt.notes || "Scheduled with energy-aware AI Coach.";
    if (evt.energyLevel) {
      desc += `\n• Energy Level: ${evt.energyLevel.replace("_", " ").toUpperCase()}`;
    }
    if (tiedGoal) {
      desc += `\n• Goal: ${tiedGoal.name} (${tiedGoal.completedCount}/${tiedGoal.weeklyTarget} weekly sessions)`;
    }
    if (evt.subSteps && evt.subSteps.length > 0) {
      desc += `\n• Session Steps:\n${evt.subSteps.map(s => `  - ${s.title} (${s.durationMinutes}m)`).join("\n")}`;
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${evt.id}@calendargoals.app`);
    lines.push(`DTSTAMP:${nowUtc}`);
    lines.push(`DTSTART:${startUtc}`);
    lines.push(`DTEND:${endUtc}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
    lines.push(`CATEGORIES:${(evt.type || "goal").toUpperCase()}`);
    lines.push(`STATUS:${evt.completed ? "COMPLETED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Triggers a browser file download of the generated .ics calendar
 */
export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename.endsWith(".ics") ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Web Intent URL for 1-click adding a single session to Google Calendar
 */
export function getGoogleCalendarEventUrl(evt: CalendarEvent, goal?: Goal): string {
  const startUtc = formatIcsDateUtc(evt.start);
  const endUtc = formatIcsDateUtc(evt.end);
  const icon = evt.icon || goal?.icon || (evt.type === "workout" ? "🏋️" : "📚");
  const title = encodeURIComponent(`${icon} ${evt.title}`);

  let details = evt.notes || "Scheduled via Calendar Goals & AI Coach";
  if (goal) {
    details += `\nGoal: ${goal.name} (Weekly Target: ${goal.weeklyTarget})`;
  }
  if (evt.energyLevel) {
    details += `\nEnergy Curve: ${evt.energyLevel.replace("_", " ").toUpperCase()}`;
  }

  const encodedDetails = encodeURIComponent(details);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startUtc}/${endUtc}&details=${encodedDetails}`;
}

/**
 * Web Intent URL for 1-click adding a single session to Microsoft Outlook (Web)
 */
export function getOutlookCalendarEventUrl(evt: CalendarEvent, goal?: Goal): string {
  const startIso = new Date(evt.start).toISOString();
  const endIso = new Date(evt.end).toISOString();
  const icon = evt.icon || goal?.icon || (evt.type === "workout" ? "🏋️" : "📚");
  const subject = encodeURIComponent(`${icon} ${evt.title}`);

  let body = evt.notes || "Scheduled via Calendar Goals & AI Coach";
  if (goal) {
    body += `\nGoal: ${goal.name} (Weekly Target: ${goal.weeklyTarget})`;
  }
  const encodedBody = encodeURIComponent(body);

  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${subject}&startdt=${encodeURIComponent(startIso)}&enddt=${encodeURIComponent(endIso)}&body=${encodedBody}&path=%2Fcalendar%2Faction%2Fcompose&rru=addevent`;
}

/**
 * Converts standard HTTP/HTTPS feed URL into webcal:// for 1-click Apple Calendar subscription
 */
export function getAppleCalendarWebcalUrl(httpFeedUrl: string): string {
  return httpFeedUrl.replace(/^https?:\/\//i, "webcal://");
}

/**
 * Direct Google Calendar URL to subscribe to an external iCal feed
 */
export function getGoogleCalendarSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl)}`;
}

/**
 * Direct Microsoft Outlook URL to subscribe to an external iCal feed
 */
export function getOutlookCalendarSubscribeUrl(feedUrl: string, calendarName = "Calendar Goals"): string {
  return `https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(calendarName)}`;
}
