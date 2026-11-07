// Sürüm karşılaştırma (Sentinel Hub'daki electron/github.js ile aynı kural): "v0.4.0" > "0.3.1"
const parse = (v) => String(v || '').trim().replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);

function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

const isNewer = (latest, current) => compare(latest, current) > 0;

module.exports = { compare, isNewer };
