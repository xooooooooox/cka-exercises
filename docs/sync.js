// GitHub Gist sync — pushes / pulls the localStorage progress payload as a
// private gist via a user-provided Personal Access Token (gist scope only).
// Exposes: window.GistSync.{createGist, updateGist, readGist, testAuth}.

(function () {
  'use strict';

  const API = 'https://api.github.com';
  const FILENAME = 'cka-progress.json';

  function withTimeoutLocal(p, ms = 15000, label = 'GitHub API') {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(t));
  }

  async function callGitHub(path, token, opts = {}) {
    if (!token) throw new Error('Missing GitHub PAT');
    const res = await withTimeoutLocal(fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'authorization': `Bearer ${token}`,
        'accept': 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    }), 15000, 'GitHub API');
    const raw = await res.text();
    if (!res.ok) {
      let msg = `GitHub ${res.status}`;
      try {
        const j = JSON.parse(raw);
        if (j.message) msg += `: ${j.message}`;
      } catch { if (raw) msg += `: ${raw.slice(0, 160)}`; }
      throw new Error(msg);
    }
    return raw ? JSON.parse(raw) : null;
  }

  async function createGist(token, payload) {
    return callGitHub('/gists', token, {
      method: 'POST',
      body: JSON.stringify({
        description: 'CKA practice — progress backup',
        public: false,
        files: { [FILENAME]: { content: JSON.stringify(payload, null, 2) } },
      }),
    });
  }

  async function updateGist(token, gistId, payload) {
    return callGitHub(`/gists/${encodeURIComponent(gistId)}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        files: { [FILENAME]: { content: JSON.stringify(payload, null, 2) } },
      }),
    });
  }

  async function readGist(token, gistId) {
    const data = await callGitHub(`/gists/${encodeURIComponent(gistId)}`, token);
    const file = data?.files?.[FILENAME];
    if (!file) throw new Error(`Gist has no '${FILENAME}' file — wrong ID, or pushed from a different repo`);
    let raw = file.content;
    if (file.truncated && file.raw_url) {
      const res = await withTimeoutLocal(fetch(file.raw_url), 15000, 'gist raw');
      if (!res.ok) throw new Error(`Couldn't fetch raw gist file (${res.status})`);
      raw = await res.text();
    }
    return JSON.parse(raw);
  }

  async function testAuth(token) {
    const data = await callGitHub('/user', token);
    return {
      login: data.login,
      scopesGranted: null, // headers not accessible across all transports; report login only
    };
  }

  window.GistSync = { createGist, updateGist, readGist, testAuth, FILENAME };
})();
