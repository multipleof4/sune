import { partsToText } from './utils.js';

export const titleFrom = t => {
  if (!t) return 'Untitled';
  const s = typeof t === 'string' ? t : (Array.isArray(t) ? partsToText({ content: t }) : 'Untitled');
  return s.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Untitled';
};

export const serializeThreadName = t => {
  const s = (t.title || 'Untitled').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
  return `${t.pinned ? '1' : '0'}-${t.updatedAt || Date.now()}-${t.id}-${s}.json`;
};

export const deserializeThreadName = n => {
  const p = n.replace('.json', '').split('-');
  if (p.length < 4) return null;
  return { pinned: p[0] === '1', updatedAt: parseInt(p[1]), id: p[2], title: p.slice(3).join('-').replace(/_/g, ' '), status: 'synced', type: 'thread' };
};
