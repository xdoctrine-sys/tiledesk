import { FilterRow } from '../core/models/tiledesk.models';
import { normalizeArabic } from '../core/util/text';

export interface NaturalFilterContext {
  departments: { id: string; name: string }[];
  labels: { id: string; name: string }[];
}

/**
 * Natural-language filter (AR / EN), e.g. "واتساب غير مسندة اليوم" or "unassigned high priority today".
 * Deliberately simple keyword matching (marked "Partial" in the coverage table): in production send the sentence to the
 * AI service and ask for the same `FilterRow[]` back.
 */
export function parseNaturalFilter(input: string, ctx: NaturalFilterContext): FilterRow[] {
  const text = ` ${normalizeArabic(input)} `;
  const has = (...words: string[]) => words.some((w) => text.includes(` ${normalizeArabic(w)}`) || text.includes(normalizeArabic(w) + ' '));
  const rows: FilterRow[] = [];
  const add = (attribute: FilterRow['attribute'], value: string, operator: FilterRow['operator'] = 'is') => {
    if (!rows.some((r) => r.attribute === attribute && r.values[0] === value)) rows.push({ attribute, operator, values: [value] });
  };

  if (has('urgent', 'عاجل', 'عاجلة')) add('priority', 'urgent');
  if (has('high', 'عالية', 'مرتفعة')) add('priority', 'high');
  if (has('bot', 'ai', 'مساعد', 'الي', 'آلي')) add('actor', 'bot');
  if (has('waiting', 'انتظار', 'بانتظار', 'ينتظر')) add('actor', 'waiting');
  if (has('unassigned', 'غير مسندة', 'غير مسند', 'بدون موظف')) add('assignee', 'none');
  if (has('mine', 'my ', 'لي', 'خاصتي', 'مسندة الي')) add('assignee', 'me');
  if (has('web', 'website', 'موقع', 'ويب')) add('channel', 'web');
  if (has('whatsapp', 'واتساب', 'واتس')) add('channel', 'whatsapp');
  if (has('instagram', 'انستقرام')) add('channel', 'instagram');
  if (has('messenger', 'ماسنجر')) add('channel', 'messenger');
  if (has('email', 'بريد')) add('channel', 'email');
  if (has('today', 'اليوم')) add('created', '1', 'after');
  if (has('week', 'اسبوع', 'الاسبوع')) add('created', '7', 'after');
  if (has('arabic', 'عربي', 'بالعربي')) add('language', 'ar');
  if (has('english', 'انجليزي', 'بالانجليزي')) add('language', 'en');
  if (has('open', 'مفتوحة', 'مفتوح')) add('status', 'open');
  if (has('snoozed', 'مؤجلة', 'مؤجل')) add('status', 'snoozed');
  if (has('resolved', 'محلولة', 'محلول')) add('status', 'resolved');
  for (const l of ctx.labels) if (text.includes(normalizeArabic(l.name))) add('label', l.id);
  for (const d of ctx.departments) if (text.includes(normalizeArabic(d.name))) add('department', d.id);
  return rows;
}
