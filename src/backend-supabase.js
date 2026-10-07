// Cloud backend: Supabase auth (email code), Postgres tables, realtime.
// Loaded lazily so demo mode never downloads the Supabase client.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CLIENT_URL = 'https://esm.sh/@supabase/supabase-js@2.117.2?bundle';

let client = null;
async function sb() {
  if (client) return client;
  const { createClient } = await import(CLIENT_URL);
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'datejar.auth' },
  });
  return client;
}

function check({ data, error }) {
  if (error) {
    const err = new Error(error.message || 'Something went wrong');
    err.status = error.status ?? (error.code ? 400 : undefined);
    err.code = error.code;
    throw err;
  }
  return data;
}

export const cloud = {
  mode: 'cloud',

  async restore() {
    const c = await sb();
    const { data } = await c.auth.getSession();
    const user = data?.session?.user;
    return user ? { userId: user.id, email: user.email } : null;
  },

  async sendCode(email) {
    const c = await sb();
    check(await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
  },

  async verifyCode(email, token) {
    const c = await sb();
    const data = check(await c.auth.verifyOtp({ email, token, type: 'email' }));
    return { userId: data.user.id, email: data.user.email };
  },

  async signOut() {
    const c = await sb();
    await c.auth.signOut();
  },

  /** Everything for the signed-in user's couple, or { couple: null }. */
  async fetchAll(userId) {
    const c = await sb();
    const mine = check(await c.from('members').select('couple_id').eq('user_id', userId).maybeSingle());
    if (!mine) return { couple: null, members: [], expenses: [], settlements: [] };
    const id = mine.couple_id;
    const [couple, members, expenses, settlements] = await Promise.all([
      c.from('couples').select('*').eq('id', id).single().then(check),
      c.from('members').select('*').eq('couple_id', id).order('joined_at').then(check),
      c.from('expenses').select('*').eq('couple_id', id).is('deleted_at', null).order('spent_on', { ascending: false }).then(check),
      c.from('settlements').select('*').eq('couple_id', id).then(check),
    ]);
    return { couple, members, expenses, settlements };
  },

  async createCouple({ displayName, currency, budget }) {
    const c = await sb();
    return check(await c.rpc('create_couple', { p_display_name: displayName, p_currency: currency, p_budget: budget }));
  },

  async createInvite() {
    const c = await sb();
    return check(await c.rpc('create_invite'));
  },

  async joinCouple({ code, displayName }) {
    const c = await sb();
    return check(await c.rpc('join_couple', { p_code: code.trim().toUpperCase(), p_display_name: displayName }));
  },

  async leaveCouple() {
    const c = await sb();
    check(await c.rpc('leave_couple'));
  },

  /** Apply one queued change. Throws on failure (status 4xx = permanent). */
  async push(op) {
    const c = await sb();
    switch (op.type) {
      case 'expense':
        return check(await c.from('expenses').upsert(op.row));
      case 'settlement':
        return check(await c.from('settlements').upsert(op.row));
      case 'couple': {
        const { id, ...fields } = op.row;
        return check(await c.from('couples').update(fields).eq('id', id));
      }
      case 'member': {
        const { couple_id, user_id, display_name, avatar } = op.row;
        return check(await c.from('members').update({ display_name, avatar: avatar ?? null }).eq('couple_id', couple_id).eq('user_id', user_id));
      }
      default:
        return null;
    }
  },

  /** Live updates for one couple. Returns an unsubscribe function. */
  subscribe(coupleId, onChange) {
    let channel;
    let closed = false;
    sb().then((c) => {
      if (closed) return;
      const f = `couple_id=eq.${coupleId}`;
      channel = c
        .channel(`couple-${coupleId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: f }, (p) => onChange('expense', p.new))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: f }, (p) => onChange('settlement', p.new))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: f }, () => onChange('members'))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` }, (p) => onChange('couple', p.new))
        .subscribe();
    });
    return () => {
      closed = true;
      if (channel && client) client.removeChannel(channel);
    };
  },
};
