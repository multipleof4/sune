export const USER = {
  get PAT() { return this.githubToken; },
  get name() { return localStorage.getItem('user_name') || 'Anon'; },
  set name(v) { localStorage.setItem('user_name', v || ''); },
  get avatar() { return localStorage.getItem('user_avatar') || ''; },
  set avatar(v) { localStorage.setItem('user_avatar', v || ''); },
  get provider() { return localStorage.getItem('provider') || 'openrouter'; },
  set provider(v) { localStorage.setItem('provider', ['openai', 'google', 'claude'].includes(v) ? v : 'openrouter'); },
  get apiKeyOpenRouter() { return localStorage.getItem('openrouter_api_key') || ''; },
  set apiKeyOpenRouter(v) { localStorage.setItem('openrouter_api_key', v || ''); },
  get apiKeyOpenAI() { return localStorage.getItem('openai_api_key') || ''; },
  set apiKeyOpenAI(v) { localStorage.setItem('openai_api_key', v || ''); },
  get apiKeyGoogle() { return localStorage.getItem('google_api_key') || ''; },
  set apiKeyGoogle(v) { localStorage.setItem('google_api_key', v || ''); },
  get apiKeyClaude() { return localStorage.getItem('claude_api_key') || ''; },
  set apiKeyClaude(v) { localStorage.setItem('claude_api_key', v || ''); },
  get apiKeyCloudflare() { return localStorage.getItem('cloudflare_api_key') || ''; },
  set apiKeyCloudflare(v) { localStorage.setItem('cloudflare_api_key', v || ''); },
  get apiKey() {
    const p = this.provider;
    return p === 'openai' ? this.apiKeyOpenAI : p === 'google' ? this.apiKeyGoogle : p === 'claude' ? this.apiKeyClaude : p === 'cloudflare' ? this.apiKeyCloudflare : this.apiKeyOpenRouter;
  },
  set apiKey(v) {
    const p = this.provider;
    if (p === 'openai') this.apiKeyOpenAI = v;
    else if (p === 'google') this.apiKeyGoogle = v;
    else if (p === 'claude') this.apiKeyClaude = v;
    else if (p === 'cloudflare') this.apiKeyCloudflare = v;
    else this.apiKeyOpenRouter = v;
  },
  get masterPrompt() { return localStorage.getItem('master_prompt') || 'Always respond using markdown.'; },
  set masterPrompt(v) { localStorage.setItem('master_prompt', v || ''); },
  get titleModel() { return localStorage.getItem('title_model') ?? 'or:amazon/nova-micro-v1'; },
  set titleModel(v) { localStorage.setItem('title_model', v || ''); },
  get githubToken() { return localStorage.getItem('gh_token') || ''; },
  set githubToken(v) { localStorage.setItem('gh_token', v || ''); },
  get customKey1() { return localStorage.getItem('custom_key_1') || ''; },
  set customKey1(v) { localStorage.setItem('custom_key_1', v || ''); }
};
