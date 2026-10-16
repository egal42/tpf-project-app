/* Public, reviewed website summary only. No Testnet-to-impact conversion. */
(function(root) {
  function validSummary(data) {
    if (!data || data.schema !== 'tpf_website_summary_v1') return false;
    if (!/^[a-f0-9]{64}$/.test(data.revision || '') || !Number.isFinite(Date.parse(data.publishedAt))) return false;
    if (data.impact === null) return true;
    const p = data.impact;
    if (!p || !/^\d+$/.test(String(p.trees)) || !/^\d+(\.\d{1,3})?$/.test(String(p.estimatedCo2Kg))) return false;
    if (!Number.isSafeInteger(Number(p.trees)) || Number(p.trees) > 1e12 || !Number.isFinite(Number(p.estimatedCo2Kg)) || Number(p.estimatedCo2Kg) > 1e15) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.asOf || '')) return false;
    const date = new Date(p.asOf + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === p.asOf && p.asOf <= new Date().toISOString().slice(0,10);
  }
  const api = { validSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TPFImpact = api;
})(typeof window === 'undefined' ? globalThis : window);
