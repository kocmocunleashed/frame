export function authReturnPath() {
  const next = new URLSearchParams(location.search).get("next");
  return next && /^\/(view|review)\/[^/?#]+$/.test(next) ? next : "/";
}
