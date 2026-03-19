import { USER } from './user.js';

export const ghApi = async (path, method = 'GET', body = null) => {
  const t = USER.githubToken;
  if (!t) throw new Error('No GH token');
  const r = await fetch(`https://api.github.com/repos/${path}`, {
    method,
    headers: {
      'Authorization': `token ${t}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!r.ok && r.status !== 404) throw new Error(`GH API ${r.status}`);
  return r.status === 404 ? null : r.json();
};

export const parseGhUrl = u => {
  const p = u.substring(5).split('/'), owner = p[0], repoPart = p[1] || '',
    branch = repoPart.includes('@') ? repoPart.split('@')[1] : 'main',
    repo = repoPart.split('@')[0], path = p.slice(2).join('/').replace(/\/$/, '');
  return { owner, repo, branch, path, apiPath: `${owner}/${repo}/contents${path ? '/' + path : ''}` };
};
