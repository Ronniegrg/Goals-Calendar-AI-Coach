import { CalendarEvent, StreakShieldBank, StreakBankRecord } from "../types";

const STORAGE_KEY = "streak_shield_bank_v1";

const DEFAULT_BANK: StreakShieldBank = {
  tokens: 2,
  maxTokens: 4,
  totalRescued: 0,
  frozenDates: [],
  history: [
    {
      id: "rec_init",
      timestamp: new Date().toISOString(),
      type: "token_gifted",
      dateStr: new Date().toISOString().split("T")[0],
      description: "Welcome bonus: 2 Streak Flex & Emergency Rescue Tokens added to your bank!",
    },
  ],
};

export function getStreakShieldBank(): StreakShieldBank {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BANK;
    const parsed = JSON.parse(raw);
    return {
      tokens: typeof parsed.tokens === "number" ? parsed.tokens : DEFAULT_BANK.tokens,
      maxTokens: typeof parsed.maxTokens === "number" ? parsed.maxTokens : DEFAULT_BANK.maxTokens,
      totalRescued: typeof parsed.totalRescued === "number" ? parsed.totalRescued : 0,
      frozenDates: Array.isArray(parsed.frozenDates) ? parsed.frozenDates : [],
      lastEarnedWeek: parsed.lastEarnedWeek,
      history: Array.isArray(parsed.history) ? parsed.history : DEFAULT_BANK.history,
    };
  } catch {
    return DEFAULT_BANK;
  }
}

export function saveStreakShieldBank(bank: StreakShieldBank): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
    window.dispatchEvent(new CustomEvent("streak-bank-updated", { detail: bank }));
  } catch (e) {
    console.error("Failed to save streak bank to localStorage", e);
  }
}

export function isDateShielded(date: Date | string, bank?: StreakShieldBank): boolean {
  const currentBank = bank || getStreakShieldBank();
  let dateStr = "";
  if (typeof date === "string") {
    dateStr = date.includes("T") ? date.split("T")[0] : date;
  } else {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    dateStr = `${y}-${m}-${d}`;
  }
  return currentBank.frozenDates.includes(dateStr);
}

export function useFreezeToken(dateStr: string, goalName?: string, notes?: string): { success: boolean; bank: StreakShieldBank; message: string } {
  const bank = getStreakShieldBank();
  if (bank.tokens <= 0) {
    return { success: false, bank, message: "No Flex Tokens remaining! Earn more by keeping your routine this week." };
  }

  const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  if (bank.frozenDates.includes(cleanDate)) {
    return { success: false, bank, message: `${cleanDate} is already protected by a streak shield.` };
  }

  const newRecord: StreakBankRecord = {
    id: "rec_" + Date.now(),
    timestamp: new Date().toISOString(),
    type: "freeze_used",
    goalName,
    dateStr: cleanDate,
    description: notes || `Used 1 Flex Token to freeze streak for ${cleanDate} (${goalName || "Daily Routine"}) without penalties.`,
  };

  const updatedBank: StreakShieldBank = {
    ...bank,
    tokens: Math.max(0, bank.tokens - 1),
    totalRescued: bank.totalRescued + 1,
    frozenDates: [...bank.frozenDates, cleanDate],
    history: [newRecord, ...bank.history].slice(0, 50),
  };

  saveStreakShieldBank(updatedBank);
  return { success: true, bank: updatedBank, message: `🛡️ Streak Shield activated for ${cleanDate}! Your streak is 100% safe.` };
}

export function earnToken(reason?: string): { success: boolean; bank: StreakShieldBank; message: string } {
  const bank = getStreakShieldBank();
  if (bank.tokens >= bank.maxTokens) {
    return { success: false, bank, message: `Streak Shield Bank is already at max capacity (${bank.maxTokens} tokens). Spend one to make room!` };
  }

  const newRecord: StreakBankRecord = {
    id: "rec_" + Date.now(),
    timestamp: new Date().toISOString(),
    type: "token_earned",
    dateStr: new Date().toISOString().split("T")[0],
    description: reason || "Weekly consistency reward: +1 Flex Token earned!",
  };

  const updatedBank: StreakShieldBank = {
    ...bank,
    tokens: Math.min(bank.maxTokens, bank.tokens + 1),
    history: [newRecord, ...bank.history].slice(0, 50),
  };

  saveStreakShieldBank(updatedBank);
  return { success: true, bank: updatedBank, message: `🎉 +1 Flex Token claimed! Bank now has ${updatedBank.tokens}/${updatedBank.maxTokens} tokens.` };
}

/**
 * Finds an optimal weekend catch-up slot (Saturday or Sunday) without colliding with existing events
 */
export function findWeekendBufferSlot(
  durationMinutes: number,
  existingEvents: CalendarEvent[],
  fromDate: Date = new Date()
): { start: Date; end: Date; dayName: string } | null {
  const durationMs = durationMinutes * 60 * 1000;
  
  // Calculate upcoming Saturday and Sunday
  const sat = new Date(fromDate);
  const currentDay = fromDate.getDay(); // 0 is Sun, 6 is Sat
  const daysUntilSat = (6 - currentDay + 7) % 7;
  sat.setDate(fromDate.getDate() + (daysUntilSat === 0 && fromDate.getHours() >= 18 ? 7 : daysUntilSat));
  
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);

  const weekendDays = [sat, sun];
  // Preferred candidate hours: 10:00 AM, 11:30 AM, 2:00 PM, 3:30 PM, 5:00 PM
  const candidateHours = [10, 11.5, 14, 15.5, 17];

  for (const day of weekendDays) {
    for (const hour of candidateHours) {
      const slotStart = new Date(day);
      const wholeHour = Math.floor(hour);
      const minutes = (hour % 1) * 60;
      slotStart.setHours(wholeHour, minutes, 0, 0);

      // Do not schedule in the past
      if (slotStart.getTime() <= Date.now() + 15 * 60 * 1000) continue;

      const slotEnd = new Date(slotStart.getTime() + durationMs);

      // Check collision
      const hasOverlap = existingEvents.some(evt => {
        const evtStart = new Date(evt.start).getTime();
        const evtEnd = new Date(evt.end).getTime();
        return slotStart.getTime() < evtEnd && slotEnd.getTime() > evtStart;
      });

      if (!hasOverlap) {
        const dayName = slotStart.toLocaleDateString("en-US", { weekday: "long" });
        return { start: slotStart, end: slotEnd, dayName };
      }
    }
  }

  // Fallback: Saturday at 11:00 AM
  const fallbackStart = new Date(sat);
  fallbackStart.setHours(11, 0, 0, 0);
  return {
    start: fallbackStart,
    end: new Date(fallbackStart.getTime() + durationMs),
    dayName: fallbackStart.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

/**
 * Reschedules a missed or overdue session into an emergency weekend catch-up buffer block
 */
export function rescueWithWeekendBuffer(
  event: CalendarEvent,
  existingEvents: CalendarEvent[]
): {
  updatedEvents: CalendarEvent[];
  catchUpEvent: CalendarEvent;
  bank: StreakShieldBank;
  message: string;
} {
  const duration = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / (60 * 1000)) || 60;
  const weekendSlot = findWeekendBufferSlot(duration, existingEvents);
  
  const originalDateStr = event.start.split("T")[0];
  const bank = getStreakShieldBank();

  // If user has a token, also shield the original date so the streak is untouched!
  let updatedBank = bank;
  if (bank.tokens > 0 && !bank.frozenDates.includes(originalDateStr)) {
    const res = useFreezeToken(originalDateStr, event.title, `Rescheduled to weekend buffer slot (${weekendSlot?.dayName || "Weekend"}). Original date streak frozen.`);
    updatedBank = res.bank;
  }

  const cleanTitle = event.title.replace(/^\[Buffer Catch-Up\]\s*/i, "");
  const catchUpEvent: CalendarEvent = {
    ...event,
    id: "catchup_" + Date.now(),
    title: `[Buffer Catch-Up] ${cleanTitle}`,
    start: weekendSlot ? weekendSlot.start.toISOString() : new Date().toISOString(),
    end: weekendSlot ? weekendSlot.end.toISOString() : new Date(Date.now() + duration * 60000).toISOString(),
    completed: false,
    isBufferCatchUp: true,
    isShielded: true,
    notes: `${event.notes ? event.notes + " • " : ""}Rescued via Emergency Buffer Bank from ${originalDateStr} to ${weekendSlot ? weekendSlot.dayName : "weekend"}.`,
  };

  // Remove or update the original missed session so it doesn't clutter as overdue
  const updatedEvents = existingEvents.filter(e => e.id !== event.id).concat(catchUpEvent);

  const newRecord: StreakBankRecord = {
    id: "rec_" + Date.now(),
    timestamp: new Date().toISOString(),
    type: "weekend_catchup",
    goalName: event.title,
    dateStr: originalDateStr,
    description: `Rescheduled "${cleanTitle}" to ${weekendSlot?.dayName || "Weekend"} catch-up slot (${weekendSlot?.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}). Streak shielded!`,
  };

  const finalBank: StreakShieldBank = {
    ...updatedBank,
    totalRescued: updatedBank.totalRescued + 1,
    history: [newRecord, ...updatedBank.history].slice(0, 50),
  };
  saveStreakShieldBank(finalBank);

  return {
    updatedEvents,
    catchUpEvent,
    bank: finalBank,
    message: `🚀 "${cleanTitle}" successfully moved to ${weekendSlot?.dayName} catch-up buffer! Streak preserved.`,
  };
}
