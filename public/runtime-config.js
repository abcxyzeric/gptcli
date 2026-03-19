// Change this to your real backend URL when deploying the panel against
// a remote CLIProxyAPI server. Keeping localhost here makes the Cloudflare
// Pages build usable immediately for users who run CLIProxyAPI on their PC.
window.__CLIPROXY_WEB_CONFIG__ = Object.assign(
  {
    defaultApiBase: 'http://127.0.0.1:8317'
  },
  window.__CLIPROXY_WEB_CONFIG__ || {}
);
