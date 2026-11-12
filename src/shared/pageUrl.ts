// Canonical page URL: highlights are saved under it and matched against it, so the same
// page reached through a share link, a sort option or an in-page anchor shows the same
// highlights. It stays a working URL (used as the "Source" link in exports).

// Tracking/attribution parameters that never change page content, on any site
const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_', '_hs'];
const TRACKING_PARAMS: Record<string, true> = {
  fbclid: true,
  gclid: true,
  dclid: true,
  gbraid: true,
  wbraid: true,
  msclkid: true,
  yclid: true,
  twclid: true,
  igshid: true,
  si: true,
  ref: true,
  ref_src: true,
  ref_url: true,
  share_id: true,
};

// Per-site parameters that change sorting/attribution but not which page it is. Too
// generic to drop everywhere (`s`, `t`, `r`, `sort` mean content on other sites).
const SITE_PARAMS: [host: string, params: string[]][] = [
  ['reddit.com', ['sort', 'context', 'rdt']],
  ['x.com', ['s', 't']],
  ['substack.com', ['r', 'triedRedirect', 'showWelcomeOnShare']],
];

// Same site under another host name
const HOST_ALIASES: Record<string, string> = {
  'twitter.com': 'x.com',
  'www.twitter.com': 'x.com',
  'mobile.twitter.com': 'x.com',
  'mobile.x.com': 'x.com',
};

const onHost = (hostname: string, site: string) =>
  hostname === site || hostname.endsWith(`.${site}`);

export function pageUrl(href: string = window.location.href): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return href;

  url.hostname = HOST_ALIASES[url.hostname] ?? url.hostname;
  const siteParams = SITE_PARAMS.filter(([site]) => onHost(url.hostname, site)).flatMap(
    ([, params]) => params
  );

  const kept = [...url.searchParams.entries()]
    .filter(
      ([key]) =>
        !TRACKING_PARAMS[key] &&
        !siteParams.includes(key) &&
        !TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(kept).toString();

  // In-page anchors point into the same page; hash routes (#/path, #!/path) are pages
  if (!url.hash.startsWith('#/') && !url.hash.startsWith('#!')) url.hash = '';

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}
