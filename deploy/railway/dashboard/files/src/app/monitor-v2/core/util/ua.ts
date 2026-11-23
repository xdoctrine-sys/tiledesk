/** Tiny user-agent reader for the technical-context section: browser + OS with versions. Replace with ua-parser-js if you need more. */
export function parseUserAgent(ua: string | undefined): { browser: string; os: string; mobile: boolean } {
  if (!ua) return { browser: '—', os: '—', mobile: false };
  const mobile = /Mobile|iPhone|Android/i.test(ua);
  let os = 'Unknown';
  const ios = /iPhone OS (\d+)[_.](\d+)/.exec(ua) ?? /iPad.*OS (\d+)[_.](\d+)/.exec(ua);
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  const mac = /Mac OS X (\d+)[_.](\d+)/.exec(ua);
  const win = /Windows NT (\d+\.\d+)/.exec(ua);
  if (ios) os = `iOS ${ios[1]}.${ios[2]}`;
  else if (android) os = `Android ${android[1]}`;
  else if (mac) os = `macOS ${mac[1]}.${mac[2]}`;
  else if (win) os = `Windows ${win[1] === '10.0' ? '10/11' : win[1]}`;
  let browser = 'Unknown';
  const edge = /Edg\/(\d+)/.exec(ua);
  const chrome = /Chrome\/(\d+)/.exec(ua);
  const safari = /Version\/(\d+(?:\.\d+)?).*Safari/.exec(ua);
  const firefox = /Firefox\/(\d+)/.exec(ua);
  if (edge) browser = `Edge ${edge[1]}`;
  else if (firefox) browser = `Firefox ${firefox[1]}`;
  else if (chrome) browser = `${mobile ? 'Mobile Chrome' : 'Chrome'} ${chrome[1]}`;
  else if (safari) browser = `${mobile ? 'Mobile Safari' : 'Safari'} ${safari[1]}`;
  return { browser, os, mobile };
}
