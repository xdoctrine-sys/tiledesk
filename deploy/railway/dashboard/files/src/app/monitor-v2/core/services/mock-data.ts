import {
  HandoffReason,
  TarashliRequestExt,
  TdBot,
  TdCannedResponse,
  TdChannelName,
  TdDepartment,
  TdEventKey,
  TdHours,
  TdLabelDef,
  TdLead,
  TdLocation,
  TdMessage,
  TdMessageAttachmentRich,
  TdNote,
  TdPriority,
  TdProjectUser,
  TdRequest,
  TdRequestStatus,
  TdSavedView,
  TdTeam,
} from '../models/tiledesk.models';
import { BotStepVM } from '../models/view-models';

/**
 * Fake data. Everything is relative to `now`, so the demo always looks "live".
 * 14 web-widget conversations (13 involve the AI bot, i.e. > 80 %). WhatsApp conversations live in a separate
 * data set that is OFF by default (channel not connected).
 */

export interface MockData {
  meId: string;
  agents: TdProjectUser[];
  bots: TdBot[];
  departments: TdDepartment[];
  teams: TdTeam[];
  labels: TdLabelDef[];
  canned: TdCannedResponse[];
  hours: TdHours;
  savedViews: TdSavedView[];
  requests: TdRequest[];
  messages: Record<string, TdMessage[]>;
  botSteps: Record<string, BotStepVM[]>;
  leadNotes: Record<string, { _id: string; text: string; createdBy: string; createdAt: string }[]>;
}

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const UA_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

export function buildMockData(now: Date, opts: { whatsapp: boolean }): MockData {
  const t0 = now.getTime();
  const iso = (minAgo: number) => new Date(t0 - minAgo * 60_000).toISOString();
  const user = (id: string, first: string, last: string) => ({ _id: `u_${id}`, firstname: first, lastname: last, email: `${first.toLowerCase()}@demo-project.test` });

  // ---------------- directory
  const agents: TdProjectUser[] = [
    { _id: 'pu_sara', id_user: user('sara', 'Sara', 'Al-Mansoori'), role: 'agent', user_available: true, number_assigned_requests: 3, attributes: { tarashli: { languages: ['ar', 'en'], maxLoad: 5 } } },
    { _id: 'pu_karim', id_user: user('karim', 'Karim', 'Barakat'), role: 'admin', user_available: true, number_assigned_requests: 1, attributes: { tarashli: { languages: ['ar', 'en'], maxLoad: 5 } } },
    { _id: 'pu_ahmed', id_user: user('ahmed', 'Ahmed', 'Rashid'), role: 'agent', user_available: true, number_assigned_requests: 0, attributes: { tarashli: { languages: ['ar'], maxLoad: 5, break: { type: 'prayer', until: new Date(t0 + 12 * 60_000).toISOString() } } } },
    { _id: 'pu_lina', id_user: user('lina', 'Lina', 'Thomas'), role: 'agent', user_available: true, isBusy: true, number_assigned_requests: 5, attributes: { tarashli: { languages: ['en', 'tl'], maxLoad: 5 } } },
  ];
  const bots: TdBot[] = [
    { _id: 'assistant', name: 'Assistant' },
    { _id: 'booking', name: 'Booking Assistant' },
  ];
  const departments: TdDepartment[] = [
    { _id: 'dept_rentals', name: 'Rentals', default: true, id_bot: 'assistant', hasBot: true, routing: 'assigned' },
    { _id: 'dept_sales', name: 'Sales', id_bot: 'booking', hasBot: true, routing: 'pooled' },
    { _id: 'dept_support', name: 'Support', routing: 'assigned' },
  ];
  const teams: TdTeam[] = [
    { _id: 'team_rentals', name: 'Rentals team', members: ['pu_sara', 'pu_ahmed'] },
    { _id: 'team_sales', name: 'Sales team', members: ['pu_karim', 'pu_lina'] },
  ];
  const labels: TdLabelDef[] = [
    { id: 'VIP', name: 'VIP', color: 1 },
    { id: 'Lusail', name: 'Lusail', color: 3 },
    { id: 'Viewing', name: 'Viewing', color: 2 },
    { id: 'Follow-up', name: 'Follow-up', color: 4 },
    { id: 'Budget', name: 'Budget', color: 5 },
    { id: 'Documents', name: 'Documents', color: 6 },
  ];
  const canned: TdCannedResponse[] = [
    { _id: 'c1', title: 'Greeting', shortcut: 'hello', text: 'Hello {{lead.fullname}}, this is {{agent.firstname}}. How can I help you today?', language: 'en' },
    { _id: 'c2', title: 'Book a viewing', shortcut: 'viewing', text: 'I can arrange a viewing tomorrow at 4 pm or on Saturday morning. Which one suits you?', language: 'en' },
    { _id: 'c3', title: 'Documents needed', shortcut: 'docs', text: 'To go ahead, please send a copy of your ID and your salary certificate.', language: 'en' },
    { _id: 'c4', title: 'Thanks', shortcut: 'thanks', text: 'Thank you for contacting us. Is there anything else I can help you with?', language: 'en' },
    { _id: 'c5', title: 'ترحيب', shortcut: 'hala', text: 'هلا {{lead.fullname}}، معك {{agent.firstname}}. كيف أقدر أساعدك؟', language: 'ar' },
    { _id: 'c6', title: 'موعد معاينة', shortcut: 'moaayana', text: 'أقدر أرتب لك معاينة بكرة الساعة ٤ العصر أو يوم السبت الصبح. أي وقت يناسبك؟', language: 'ar' },
    { _id: 'c7', title: 'شكراً', shortcut: 'shukran', text: 'شكراً لتواصلك معنا. هل تحتاج أي مساعدة ثانية؟', language: 'ar' },
  ];
  const hours: TdHours = {
    enabled: true,
    timezone: 'Asia/Qatar',
    profile: 'standard',
    days: [0, 1, 2, 3, 4].map((day) => ({ day, open: 8 * 60, close: 18 * 60 })).concat([{ day: 6, open: 9 * 60, close: 13 * 60 }]),
  };
  const savedViews: TdSavedView[] = [
    { _id: 'sv1', name: 'VIP Doha', owner: 'pu_sara', shared: false, conjunction: 'and', sort: 'last_activity', filters: [{ attribute: 'label', operator: 'is', values: ['VIP'] }] },
    { _id: 'sv2', name: 'Urgent today', owner: 'pu_karim', shared: true, conjunction: 'or', sort: 'priority', filters: [{ attribute: 'priority', operator: 'is', values: ['urgent', 'high'] }] },
  ];

  const botSteps: Record<string, BotStepVM[]> = {
    bot_assistant: [
      { id: 'start', label: 'Start of the flow', preview: "Hello! I'm the Assistant. What are you looking for?" },
      { id: 'bedrooms', label: 'Bedroom count', preview: 'How many bedrooms do you need?' },
      { id: 'viewing', label: 'Book a viewing', preview: 'Which day works best for your visit?' },
    ],
    bot_booking: [
      { id: 'start', label: 'Start of the flow', preview: 'Welcome! Which property would you like to visit?' },
      { id: 'slot', label: 'Pick a time slot', preview: 'Here are the available slots this week.' },
    ],
  };

  // ---------------- builders
  const tagsOf = (names: string[]) => names.map((n) => ({ tag: n, color: 'neutral' }));
  const deptOf = (id: string) => departments.find((d) => d._id === id)!;
  const agentRef = (id: string) => {
    const a = agents.find((x) => x._id === id)!;
    return { _id: a._id, id_user: a.id_user };
  };
  const lead = (id: string, fullname: string, extra: Partial<TdLead> = {}): TdLead => ({ _id: `lead_${id}`, lead_id: `lead_${id}`, fullname, createdAt: iso(60 * 24 * 3), ...extra });

  interface ReqInit {
    ticket: number;
    lead: TdLead;
    status: TdRequestStatus;
    working?: 'open' | 'pending';
    agents?: string[];
    bots?: string[];
    dept: string;
    priority?: TdPriority;
    tags?: string[];
    createdMin: number;
    first: string;
    ext?: TarashliRequestExt;
    location?: TdLocation;
    lang?: string;
    subject?: string;
    channel?: TdChannelName;
    hasBot?: boolean;
    ua?: string;
    smart?: boolean;
    notes?: TdNote[];
    followers?: string[];
    slots?: { key: string; value: string; messageId?: string }[];
    pages?: { url: string; at: string }[];
    closedMin?: number;
    rating?: number;
    ratingMessage?: string;
    ip?: string;
  }
  const requests: TdRequest[] = [];
  const messages: Record<string, TdMessage[]> = {};

  const makeReq = (o: ReqInit): TdRequest => {
    const rid = `support-group-r${o.ticket}`;
    const botIds = (o.bots ?? []).map((b) => `bot_${b}`);
    const agentIds = o.agents ?? [];
    const d = deptOf(o.dept);
    const r: TdRequest = {
      _id: `req_${o.ticket}`,
      id: `req_${o.ticket}`,
      request_id: rid,
      ticket_id: o.ticket,
      status: o.status,
      workingStatus: o.working ?? 'open',
      hasBot: o.hasBot ?? (o.bots?.length ?? 0) > 0,
      participants: [...botIds, ...agentIds],
      participantsAgents: agentIds,
      participantsBots: botIds,
      participatingAgents: agentIds.map(agentRef),
      participatingBots: (o.bots ?? []).map((b) => bots.find((x) => x._id === b)!),
      requester: { uuid_user: o.lead.lead_id, role: 'guest', isAuthenticated: false },
      requester_id: o.lead.lead_id,
      lead: o.lead,
      first_text: o.first,
      subject: o.subject,
      department: d,
      channel: { name: o.channel ?? 'chat21' },
      priority: o.priority ?? 'medium',
      tags: tagsOf(o.tags ?? []),
      notes: o.notes ?? [],
      followers: o.followers ?? [],
      location: o.location ? { ...o.location, ipAddress: o.ip ?? '176.203.39.26' } : undefined,
      language: o.lang ?? 'en',
      userAgent: o.ua ?? UA_CHROME,
      sourcePage: 'https://demo-project.test/properties/lusail',
      attributes: {
        subtype: 'info',
        departmentId: d._id,
        departmentName: d.name,
        ipAddress: o.ip ?? '176.203.39.26',
        client: o.ua ?? UA_CHROME,
        sourcePage: 'https://demo-project.test/properties/lusail',
        sourceTitle: 'Apartments for rent in Lusail | Demo Project',
        projectId: 'demo-project',
        widgetVer: 'v6.0.12',
        userFullname: o.lead.fullname,
        requester_id: o.lead.lead_id,
        environment: 'production',
        site_language: o.lang ?? 'en',
        pagesViewed: o.pages,
        botSlots: o.slots,
        tarashli: o.ext ?? {},
      },
      smartAssignment: o.smart ?? true,
      createdAt: iso(o.createdMin),
      updatedAt: iso(0),
      closed_at: o.closedMin !== undefined ? iso(o.closedMin) : undefined,
      closed_by: o.closedMin !== undefined ? 'pu_sara' : undefined,
      rating: o.rating,
      rating_message: o.ratingMessage,
    };
    requests.push(r);
    messages[rid] = [];
    return r;
  };

  let seq = 0;
  const base = (rid: string, sender: string, senderFullname: string, minAgo: number): TdMessage => ({
    _id: `${rid}_m${++seq}`,
    sender,
    senderFullname,
    recipient: rid,
    text: '',
    type: 'text',
    status: 200,
    channel_type: 'group',
    createdAt: iso(minAgo),
  });
  const sys = (rid: string, key: TdEventKey, minAgo: number, params: Record<string, string> = {}, reason?: HandoffReason) =>
    messages[rid].push({ ...base(rid, 'system', 'System', minAgo), text: key, attributes: { subtype: 'info', messagelabel: { key, parameters: params }, tarashli_reason: reason } });
  const cust = (rid: string, l: TdLead, text: string, minAgo: number, extra: Partial<TdMessage> = {}) =>
    messages[rid].push({ ...base(rid, l.lead_id, l.fullname, minAgo), text, ...extra });
  const bot = (rid: string, botId: string, text: string, minAgo: number, rich?: TdMessageAttachmentRich, extra: Partial<TdMessage> = {}) =>
    messages[rid].push({ ...base(rid, `bot_${botId}`, bots.find((b) => b._id === botId)!.name, minAgo), text, attributes: rich ? { attachment: rich } : undefined, ...extra });
  const agent = (rid: string, agentId: string, text: string, minAgo: number, extra: Partial<TdMessage> = {}) => {
    const a = agents.find((x) => x._id === agentId)!;
    messages[rid].push({ ...base(rid, agentId, a.id_user.firstname, minAgo), text, ...extra });
  };
  const note = (rid: string, agentId: string, text: string, minAgo: number) => {
    const a = agents.find((x) => x._id === agentId)!;
    messages[rid].push({ ...base(rid, agentId, a.id_user.firstname, minAgo), text, attributes: { subtype: 'private' } });
  };
  const join = (rid: string, who: string, minAgo: number) => sys(rid, 'MEMBER_JOINED_GROUP', minAgo, { member_id: who });
  const leave = (rid: string, who: string, minAgo: number) => sys(rid, 'MEMBER_LEFT_GROUP', minAgo, { member_id: who });
  const btn = (value: string, chosen = false) => ({ type: 'text' as const, value, chosen });

  // ================= #50 — hero: bot → waiting → Sara (takeover 90 s ago)
  {
    const l = lead('a104', 'guest#a104', { createdAt: iso(14) });
    const r = makeReq({
      ticket: 50, lead: l, status: 200, agents: ['pu_sara'], bots: [], hasBot: true, dept: 'dept_rentals', priority: 'medium', tags: ['Lusail', 'VIP'],
      createdMin: 14, first: '3ndkm sha8a fe lusail?', location: { city: 'Doha', country: 'QA', region: 'Ad Dawhah' }, lang: 'ar', ua: UA_IOS,
      notes: [{ _id: 'n1', text: 'Asked about Lusail last week (see #44).', createdBy: 'pu_karim', createdAt: iso(2) }],
      slots: [], pages: [
        { url: 'https://demo-project.test/', at: iso(16) },
        { url: 'https://demo-project.test/properties/lusail', at: iso(15) },
        { url: 'https://demo-project.test/properties/lusail/marina-district', at: iso(14) },
      ],
    });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 14);
    join(id, 'bot_assistant', 14);
    cust(id, l, '/listing_en', 14);
    bot(id, 'assistant', "Hello! I'm the Assistant. What are you looking for?", 14, { buttons: [btn('For rent', true), btn('For sale'), btn('Talk to a person')] });
    cust(id, l, '3ndkm sha8a fe lusail?', 13, { attributes: { tarashli_detected: { language: 'ar', dialect: 'arabizi' }, tarashli_normalized: 'عندكم شقة في لوسيل؟', tarashli_translation: 'Do you have an apartment in Lusail?' } });
    bot(id, 'assistant', 'For rent · Lusail\nWhat is your budget?', 13);
    cust(id, l, 'من ١٠ آلاف أو أقل', 12, { attributes: { tarashli_detected: { language: 'ar', dialect: 'fusha' }, tarashli_translation: 'Up to 10 thousand' } });
    bot(id, 'assistant', 'For rent · Lusail · Up to 10,000 QAR\n\nIs that budget monthly, yearly, or for another period?', 12, { buttons: [btn('Monthly', true), btn('Yearly')] });
    cust(id, l, 'monthly', 11);
    bot(id, 'assistant', 'How many bedrooms do you need?', 10);
    cust(id, l, 'مو مهم، المهم الموقع', 9, { attributes: { tarashli_detected: { language: 'ar', dialect: 'khaleeji' }, tarashli_translation: "Doesn't matter, location is what matters" } });
    bot(id, 'assistant', "Sorry, I didn't get that. How many bedrooms do you need?", 8);
    cust(id, l, 'I want to talk to a person please', 7);
    bot(id, 'assistant', 'Of course. Connecting you with a colleague…', 7);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 6, {}, 'bot_failed');
    leave(id, 'bot_assistant', 6);
    cust(id, l, 'Hello? still there?', 3);
    join(id, 'pu_sara', 1.5);
    note(id, 'pu_karim', "Budget is flexible, he said on chat last week. Offer 2 options in Lusail Marina.", 1);
    r.attributes.botSlots = [
      { key: 'type', value: 'Rent', messageId: messages[id][3]!._id },
      { key: 'zone', value: 'Lusail', messageId: messages[id][4]!._id },
      { key: 'budget', value: '10,000 QAR / month', messageId: messages[id][7]!._id },
      { key: 'bedrooms', value: '' },
    ];
    r.attributes.tarashli = {
      unread: 1,
      handoff_reason: 'bot_failed',
      viewers: ['pu_karim'],
      sla: { policy: 'first_response', policy_minutes: 10, due_at: iso(-4) },
      last_message: { text: 'Budget is flexible, he said on chat last week. Offer 2 options in Lusail Marina.', sender: 'pu_karim', createdAt: iso(1), isNote: true },
    };
  }

  // ================= #51 — waiting for a human 4.5 min, SLA breached, Arabic
  {
    const l = lead('hamad', 'Hamad M.', { email: 'hamad.m@example.com', phone: '+974 5501 2233' });
    const r = makeReq({
      ticket: 51, lead: l, status: 100, bots: [], hasBot: true, dept: 'dept_rentals', priority: 'high', tags: ['Viewing'],
      createdMin: 9, first: 'أبي أحجز موعد معاينة لبرج في اللؤلؤة', location: { city: 'Doha', country: 'QA' }, lang: 'ar', ua: UA_ANDROID, ip: '82.148.12.40',
    });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 9);
    join(id, 'bot_assistant', 9);
    bot(id, 'assistant', 'مرحباً! أنا المساعد. كيف أقدر أخدمك؟', 9);
    cust(id, l, 'أبي أحجز موعد معاينة لبرج في اللؤلؤة', 8);
    bot(id, 'assistant', 'تمام! أي يوم يناسبك؟', 8);
    cust(id, l, 'بكرة العصر', 7);
    bot(id, 'assistant', 'آسف، ما فهمت. ممكن توضح اليوم والوقت؟', 6);
    cust(id, l, 'أبي أكلم موظف', 5);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 4.5, {}, 'customer_asked');
    leave(id, 'bot_assistant', 4.5);
    cust(id, l, '؟؟', 3);
    cust(id, l, 'هل من أحد؟', 1);
    r.attributes.tarashli = { waiting_since: iso(4.5), unread: 2, sla: { policy: 'first_response', policy_minutes: 3, due_at: iso(1.5) }, handoff_reason: 'customer_asked', last_message: { text: 'هل من أحد؟', sender: l.lead_id, createdAt: iso(1) } };
  }

  // ================= #52 — waiting 2.4 min, SLA at risk, English
  {
    const l = lead('b207', 'guest#b207', {});
    const r = makeReq({
      ticket: 52, lead: l, status: 100, bots: [], hasBot: true, dept: 'dept_sales', priority: 'medium', tags: [],
      createdMin: 5, first: 'How much is parking at the Pearl tower?', location: { city: 'Riyadh', country: 'SA' }, lang: 'en', ua: UA_CHROME, ip: '212.12.160.8',
    });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 5);
    join(id, 'bot_booking', 5);
    bot(id, 'booking', 'Welcome! Which property would you like to visit?', 5);
    cust(id, l, 'How much is parking at the Pearl tower?', 4);
    bot(id, 'booking', "I don't have pricing for parking. Let me find a colleague for you.", 3.5);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 2.4, {}, 'bot_failed');
    leave(id, 'bot_booking', 2.4);
    r.attributes.tarashli = { waiting_since: iso(2.4), unread: 1, sla: { policy: 'first_response', policy_minutes: 3, due_at: iso(-0.6) }, handoff_reason: 'bot_failed', last_message: { text: 'How much is parking at the Pearl tower?', sender: l.lead_id, createdAt: iso(4) } };
  }

  // ================= #53 — bot answering (bot typing is scripted by the mock realtime)
  {
    const l = lead('reema', 'Reema S.', { email: 'reema.s@example.com', phone: '+974 6612 0045' });
    const r = makeReq({ ticket: 53, lead: l, status: 200, bots: ['assistant'], dept: 'dept_rentals', createdMin: 6, first: 'Hi, is anything available in March?', location: { city: 'Doha', country: 'QA' }, lang: 'en', ua: UA_IOS, tags: [] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 6);
    join(id, 'bot_assistant', 6);
    bot(id, 'assistant', "Hello! I'm the Assistant. What are you looking for?", 6);
    cust(id, l, 'Hi, is anything available in March?', 3);
    bot(id, 'assistant', 'Let me check availability for March.', 3);
    cust(id, l, 'A 2-bedroom, please', 1);
    r.attributes.tarashli = { unread: 1, pen_holder: 'pu_ahmed', bot_intent: { name: 'availability_request', confidence: 0.92 }, last_message: { text: 'A 2-bedroom, please', sender: l.lead_id, createdAt: iso(1) } };
  }

  // ================= #54 — bot waiting for the customer
  {
    const l = lead('c311', 'guest#c311', {});
    const r = makeReq({ ticket: 54, lead: l, status: 200, bots: ['assistant'], dept: 'dept_rentals', createdMin: 12, first: 'Hello', location: { city: 'Al Khor', country: 'QA' }, lang: 'en', ua: UA_CHROME, tags: [] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 12);
    join(id, 'bot_assistant', 12);
    bot(id, 'assistant', "Hello! I'm the Assistant. What are you looking for?", 12);
    cust(id, l, 'Hello', 11);
    bot(id, 'assistant', 'Which area do you prefer: Lusail, The Pearl or West Bay?', 5, { buttons: [btn('Lusail'), btn('The Pearl'), btn('West Bay')] });
    r.attributes.tarashli = { bot_intent: { name: 'area_choice', confidence: 0.88 }, last_message: { text: 'Which area do you prefer: Lusail, The Pearl or West Bay?', sender: 'bot_assistant', createdAt: iso(5) } };
  }

  // ================= #55 — bot with a rich message (cards + chosen button)
  {
    const l = lead('noura', 'Noura A.', { email: 'noura.a@example.com' });
    const r = makeReq({ ticket: 55, lead: l, status: 200, bots: ['booking'], dept: 'dept_sales', createdMin: 22, first: 'I want to visit two apartments on Saturday', location: { city: 'Doha', country: 'QA' }, lang: 'en', ua: UA_IOS, tags: ['Viewing'] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 22);
    join(id, 'bot_booking', 22);
    cust(id, l, 'I want to visit two apartments on Saturday', 21);
    bot(id, 'booking', 'Here are two options near you:', 20, {
      cards: [
        { title: 'Marina Tower · 2BR', subtitle: '9,500 QAR / month · Lusail', buttons: [btn('Book a viewing', true)] },
        { title: 'Pearl Residence · 2BR', subtitle: '10,200 QAR / month · The Pearl', buttons: [btn('Book a viewing')] },
      ],
    });
    cust(id, l, 'Book a viewing', 19);
    bot(id, 'booking', 'Choose a time for Saturday:', 9, { buttons: [btn('10:00'), btn('12:00'), btn('16:00')] });
    r.attributes.tarashli = { unread: 0, bot_intent: { name: 'book_viewing', confidence: 0.95 }, last_message: { text: 'Choose a time for Saturday:', sender: 'bot_booking', createdAt: iso(9) } };
  }

  // ================= #56 — colleague (Karim) handling
  {
    const l = lead('faisal', 'Faisal K.', { email: 'faisal.k@example.com', phone: '+971 50 123 4567', company: 'Gulf Trading LLC' });
    const r = makeReq({ ticket: 56, lead: l, status: 200, agents: ['pu_karim'], bots: [], hasBot: true, dept: 'dept_sales', createdMin: 90, first: 'I need a contract for 3 apartments', location: { city: 'Dubai', country: 'AE' }, lang: 'en', ua: UA_CHROME, tags: ['VIP', 'Budget'], followers: ['pu_sara'] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 90);
    join(id, 'bot_booking', 90);
    cust(id, l, 'I need a contract for 3 apartments', 89);
    bot(id, 'booking', 'I will connect you with a sales colleague.', 88);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 87, {}, 'customer_asked');
    leave(id, 'bot_booking', 87);
    join(id, 'pu_karim', 85);
    agent(id, 'pu_karim', 'Hello Faisal, Karim here. Which move-in date do you have in mind?', 84);
    cust(id, l, 'Beginning of next month', 60);
    agent(id, 'pu_karim', "I'll send the contract by email today.", 25);
    r.attributes.tarashli = { last_message: { text: "I'll send the contract by email today.", sender: 'pu_karim', createdAt: iso(25) } };
  }

  // ================= #57 — pending (waiting for the customer), draft present
  {
    const l = lead('mariam', 'Mariam T.', { email: 'mariam.t@example.com', phone: '+974 5533 8890' });
    const r = makeReq({ ticket: 57, lead: l, status: 200, working: 'pending', agents: ['pu_sara'], bots: [], hasBot: true, dept: 'dept_rentals', priority: 'low', createdMin: 180, first: 'I would like to rent a studio', location: { city: 'Doha', country: 'QA' }, lang: 'en', ua: UA_ANDROID, tags: ['Documents'] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 180);
    join(id, 'bot_assistant', 180);
    cust(id, l, 'I would like to rent a studio', 179);
    bot(id, 'assistant', 'Great choice! A colleague will help you with the documents.', 178);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 177, {}, 'customer_asked');
    leave(id, 'bot_assistant', 177);
    join(id, 'pu_sara', 175);
    agent(id, 'pu_sara', 'Please send a copy of your ID and the salary certificate.', 40);
    sys(id, 'TARASHLI_PENDING', 40, { agent_id: 'pu_sara' });
    r.attributes.tarashli = { last_message: { text: 'Please send a copy of your ID and the salary certificate.', sender: 'pu_sara', createdAt: iso(40) } };
  }

  // ================= #58 — snoozed until tomorrow
  {
    const l = lead('yousef', 'Yousef H.', { phone: '+965 5550 1122' });
    const r = makeReq({ ticket: 58, lead: l, status: 200, agents: ['pu_sara'], bots: [], hasBot: true, dept: 'dept_sales', createdMin: 300, first: 'Is the villa still available?', location: { city: 'Kuwait City', country: 'KW' }, lang: 'en', ua: UA_CHROME, tags: ['Follow-up'] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 300);
    join(id, 'bot_booking', 300);
    cust(id, l, 'Is the villa still available?', 299);
    bot(id, 'booking', 'Let me connect you with an agent.', 298);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 297, {}, 'customer_asked');
    leave(id, 'bot_booking', 297);
    join(id, 'pu_sara', 290);
    agent(id, 'pu_sara', "I'll check with the owner and update you tomorrow.", 120);
    sys(id, 'TARASHLI_SNOOZED', 119, { agent_id: 'pu_sara', until: iso(-60 * 17) });
    r.attributes.tarashli = { snoozed_until: iso(-60 * 17), last_message: { text: "I'll check with the owner and update you tomorrow.", sender: 'pu_sara', createdAt: iso(120) } };
  }

  // ================= #59 — resolved yesterday, with a rating
  {
    const l = lead('d420', 'guest#d420', {});
    const r = makeReq({ ticket: 59, lead: l, status: 1000, agents: ['pu_sara'], bots: [], hasBot: true, dept: 'dept_support', createdMin: 60 * 26, first: 'Where is the parking entrance?', location: { city: 'Doha', country: 'QA' }, lang: 'en', ua: UA_CHROME, closedMin: 60 * 25, rating: 4, ratingMessage: 'Quick answer, thanks!', tags: [] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 60 * 26);
    join(id, 'bot_assistant', 60 * 26);
    cust(id, l, 'Where is the parking entrance?', 60 * 26 - 1);
    bot(id, 'assistant', 'I will ask a colleague to help you.', 60 * 26 - 2);
    leave(id, 'bot_assistant', 60 * 26 - 3);
    join(id, 'pu_sara', 60 * 26 - 4);
    agent(id, 'pu_sara', 'The parking entrance is on the north side, next to Gate 3.', 60 * 25 + 5);
    cust(id, l, 'Perfect, thank you!', 60 * 25 + 2);
    sys(id, 'CHAT_CLOSED', 60 * 25, { agent_id: 'pu_sara' });
    r.attributes.tarashli = { last_message: { text: 'Perfect, thank you!', sender: l.lead_id, createdAt: iso(60 * 25 + 2) } };
  }

  // ================= #60 — abandoned
  {
    const l = lead('salma', 'Salma R.', {});
    const r = makeReq({ ticket: 60, lead: l, status: 150, bots: ['assistant'], dept: 'dept_rentals', createdMin: 200, first: 'Hello, I need help', location: { city: 'Manama', country: 'BH' }, lang: 'en', ua: UA_ANDROID, tags: [] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 200);
    join(id, 'bot_assistant', 200);
    cust(id, l, 'Hello, I need help', 199);
    bot(id, 'assistant', 'Of course. Let me find a colleague for you.', 198);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 198, {}, 'customer_asked');
    leave(id, 'bot_assistant', 198);
    r.attributes.tarashli = { last_message: { text: 'Of course. Let me find a colleague for you.', sender: 'bot_assistant', createdAt: iso(198) } };
  }

  // ================= #61 — voice note, image, personal data (Sara)
  {
    const l = lead('khalid', 'Khalid Q.', { email: 'khalid.q@example.com', phone: '+974 3344 5566' });
    const r = makeReq({ ticket: 61, lead: l, status: 200, agents: ['pu_sara'], bots: [], hasBot: true, dept: 'dept_rentals', priority: 'high', createdMin: 50, first: 'أبي أستأجر شقة', location: { city: 'Doha', country: 'QA' }, lang: 'ar', ua: UA_IOS, tags: ['Documents'] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 50);
    join(id, 'bot_assistant', 50);
    cust(id, l, 'أبي أستأجر شقة', 49);
    bot(id, 'assistant', 'أهلاً! كم ميزانيتك الشهرية؟', 48);
    cust(id, l, 'خلني أرسل لك رسالة صوتية', 46);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 45, {}, 'customer_asked');
    leave(id, 'bot_assistant', 45);
    join(id, 'pu_sara', 44);
    cust(id, l, '', 8, {
      type: 'audio',
      metadata: { name: 'voice.webm', duration: 24, transcript: 'السلام عليكم، أبي شقة غرفتين في اللؤلؤة، الميزانية تقريباً ٩٥٠٠ ريال بالشهر، وأقدر أنتقل أول الشهر الجاي.', waveform: Array.from({ length: 36 }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.31))) },
    });
    cust(id, l, 'رقم هويتي 28435600123 وهذي صورة العقد القديم', 6);
    cust(id, l, '', 6, { attributes: { tarashli_sensitive: true }, type: 'image', metadata: { name: 'old-contract.jpg', type: 'image/jpeg', size: 482_000, width: 800, height: 520, src: 'assets/monitor-v2/img/old-contract.svg' } });
    r.attributes.tarashli = { unread: 1, last_message: { text: '📷 old-contract.jpg', sender: l.lead_id, createdAt: iso(6) } };
  }

  // ================= #62 — manual offline ticket (no bot)
  {
    const l = lead('deema', 'Deema F.', { email: 'deema.f@example.com', phone: '+974 6600 9087' });
    const r = makeReq({ ticket: 62, lead: l, status: 200, agents: ['pu_sara'], bots: [], hasBot: false, dept: 'dept_sales', priority: 'urgent', createdMin: 600, first: 'Contract renewal question', subject: 'Contract renewal question', smart: false, location: { city: 'Doha', country: 'QA' }, lang: 'en', ua: UA_CHROME, tags: ['Follow-up'], channel: 'chat21' });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 600);
    join(id, 'pu_sara', 600);
    agent(id, 'pu_sara', 'Hi Deema, following up on your question about the renewal. Could you confirm the new term?', 599);
    r.attributes.tarashli = { last_message: { text: 'Hi Deema, following up on your question about the renewal. Could you confirm the new term?', sender: 'pu_sara', createdAt: iso(599) } };
  }

  // ================= #63 — colleague mentions me in a note
  {
    const l = lead('e502', 'guest#e502', {});
    const r = makeReq({ ticket: 63, lead: l, status: 200, agents: ['pu_karim'], bots: [], hasBot: true, dept: 'dept_sales', createdMin: 35, first: 'Do you have offices to rent?', location: { city: 'Abu Dhabi', country: 'AE' }, lang: 'en', ua: UA_CHROME, tags: [] });
    const id = r.request_id;
    sys(id, 'CHAT_CREATED', 35);
    join(id, 'bot_booking', 35);
    cust(id, l, 'Do you have offices to rent?', 34);
    bot(id, 'booking', 'Let me connect you with a colleague.', 33);
    sys(id, 'TARASHLI_HANDOFF_REQUESTED', 33, {}, 'customer_asked');
    leave(id, 'bot_booking', 33);
    join(id, 'pu_karim', 30);
    agent(id, 'pu_karim', 'We have two offices in West Bay. Do you prefer a furnished one?', 28);
    cust(id, l, 'Yes please, can I visit on Saturday?', 12);
    note(id, 'pu_karim', '@Sara can you propose Saturday? I have a meeting.', 10);
    r.attributes.tarashli = { unread: 1, mentions_me: true, last_message: { text: '@Sara can you propose Saturday? I have a meeting.', sender: 'pu_karim', createdAt: iso(10), isNote: true } };
  }

  // ================= separate WhatsApp data set (channel not connected → off by default)
  if (opts.whatsapp) {
    const mk = (ticket: number, name: string, phone: string, closeness: number, text: string, mine: boolean) => {
      const l = lead(`wa${ticket}`, name, { phone });
      const r = makeReq({ ticket, lead: l, status: 200, agents: mine ? ['pu_sara'] : [], bots: mine ? [] : ['assistant'], hasBot: true, dept: 'dept_sales', createdMin: 60 * 20, first: text, channel: 'whatsapp', location: { city: 'Doha', country: 'QA' }, lang: 'ar', ua: UA_ANDROID, tags: [] });
      const id = r.request_id;
      sys(id, 'CHAT_CREATED', 60 * 20);
      cust(id, l, text, closeness);
      if (mine) join(id, 'pu_sara', closeness - 1);
      r.attributes.tarashli = { unread: 1, last_customer_at: iso(closeness), last_message: { text, sender: l.lead_id, createdAt: iso(closeness) } };
    };
    mk(70, 'Abdullah K.', '+974 5512 3456', 60 * 23 + 20, 'Thanks, I will come after the iftar', true); // window closing (40 min left)
    mk(71, 'Reema (WhatsApp)', '+974 6600 1100', 60 * 30, 'Is the apartment still available?', true); // window closed
    mk(72, 'Ahmad B.', '+971 50 998 7766', 60 * 4, 'مرحبا، عندكم شقق في دبي؟', false); // window open
  }

  return { meId: 'pu_sara', agents, bots, departments, teams, labels, canned, hours, savedViews, requests, messages, botSteps, leadNotes: {} };
}

