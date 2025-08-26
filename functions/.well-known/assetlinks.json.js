export const onRequestGet = async () => {
  const url = "https://raw.githubusercontent.com/multipleof4/sune/master/public/.well-known/assetlinks.json";
  const r = await fetch(url, { cf: { cacheTtl: 0, cacheEverything: false } });
  if (!r.ok) return new Response("not found", { status: 404 });
  const body = await r.text();
  return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
};
