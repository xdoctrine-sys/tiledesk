/** Text direction of the page (set by I18nService). The page lives in a shadow root, so there is no <html dir> to read. */
let rtl = true;
export function setPageRtl(value: boolean): void {
  rtl = value;
}
export function isRtlNow(): boolean {
  return rtl;
}
