export type SnoozePreset = 'next_reply' | '1h' | 'tonight' | 'tomorrow' | 'weekend';

/** Far-future marker meaning "until the customer replies" (the server lifts it on the next inbound message). */
export const SNOOZE_UNTIL_REPLY = '9999-12-31T00:00:00.000Z';

export function isUntilReply(iso: string | Date | undefined): boolean {
  return !!iso && new Date(iso).getFullYear() >= 9000;
}

/**
 * Snooze presets (F-41). "Tomorrow at opening" and "After the weekend" follow the Gulf week (Fri-Sat weekend) and an
 * 08:00 opening; in production take them from the project's opening hours (`TdHours`, Ramadan profile included).
 */
export function resolveSnooze(preset: SnoozePreset, now = new Date(), openHour = 8): Date {
  const d = new Date(now);
  switch (preset) {
    case 'next_reply':
      return new Date(SNOOZE_UNTIL_REPLY);
    case '1h':
      return new Date(now.getTime() + 3_600_000);
    case 'tonight': {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d;
    }
    case 'tomorrow':
      d.setDate(d.getDate() + 1);
      d.setHours(openHour, 0, 0, 0);
      return d;
    case 'weekend': {
      // next Sunday at opening (week starts on Sunday in the Gulf; weekend = Friday + Saturday)
      const add = (7 - d.getDay()) % 7 || 7;
      d.setDate(d.getDate() + add);
      d.setHours(openHour, 0, 0, 0);
      return d;
    }
  }
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAYS_AR = ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * Free-text snooze ("tomorrow 10am", "in 2 hours", "next sunday", "بعد ساعتين", "بكرة ١٠ الصبح"). Returns the interpreted
 * date so the picker can show it BEFORE the agent validates. Keyword based; in production send the sentence to the
 * AI service with the project's opening hours as context.
 */
export function parseSnoozeText(input: string, now = new Date()): Date | null {
  const text = ' ' + input.toLowerCase().replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim() + ' ';
  const d = new Date(now);
  const time = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|صباحا|الصبح|مساء|العصر|الليل)?/.exec(text.replace(/(in|after|بعد)\s+\d+/g, ''));
  const setTime = (date: Date, defH = 9) => {
    if (time && time[1] !== undefined && /(at|الساعه|ساعه|\d\s*(am|pm)|:\d{2}|صباحا|الصبح|مساء|العصر)/.test(text)) {
      let h = Number(time[1]);
      const pm = /(pm|مساء|العصر|الليل)/.test(time[3] ?? '') ;
      if (pm && h < 12) h += 12;
      date.setHours(h, Number(time[2] ?? 0), 0, 0);
    } else date.setHours(defH, 0, 0, 0);
    return date;
  };
  const rel = /(?:in|after|بعد)\s+(\d+)?\s*(min|minute|minutes|دقيقه|دقائق|دقيقتين|hour|hours|h|ساعه|ساعات|ساعتين|day|days|يوم|ايام|يومين)/.exec(text);
  if (rel) {
    const n = rel[1] ? Number(rel[1]) : /(تين)/.test(rel[2]!) ? 2 : 1;
    const unit = rel[2]!;
    const ms = /^(min|minute|minutes|دقيقه|دقائق|دقيقتين)$/.test(unit) ? 60_000 : /^(hour|hours|h|ساعه|ساعات|ساعتين)$/.test(unit) ? 3_600_000 : 86_400_000;
    return new Date(now.getTime() + n * ms);
  }
  if (/\b(tonight)\b|الليله|هالليل/.test(text)) { d.setHours(18, 0, 0, 0); return d.getTime() > now.getTime() ? d : new Date(d.getTime() + 86_400_000); }
  if (/(tomorrow|بكره|غدا|باكر)/.test(text)) { d.setDate(d.getDate() + 1); return setTime(d); }
  if (/(next week|الاسبوع الجاي|الاسبوع القادم|الاسبوع المقبل)/.test(text)) { d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return setTime(d, 8); }
  for (let i = 0; i < 7; i++) {
    if (text.includes(DAYS_EN[i]!) || text.includes(DAYS_AR[i]!)) {
      d.setDate(d.getDate() + (((i - d.getDay() + 7) % 7) || 7));
      return setTime(d);
    }
  }
  if (time && /(am|pm|:\d{2}|الساعه)/.test(text)) { const t = setTime(d); return t.getTime() > now.getTime() ? t : new Date(t.getTime() + 86_400_000); }
  return null;
}
