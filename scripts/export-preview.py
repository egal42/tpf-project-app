"""Export an offline UI review artifact, never used by the hosted app."""
from pathlib import Path
import base64,json,re,sys
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1])
# Snapshot verified against the public TPF endpoint during this implementation.
summary={'schema':'tpf_website_summary_v1','revision':'1d624359a4ffaeadf9e501c962a1568741cb289c16ec5c240b5fc0dba3c1b658','publishedAt':'2026-10-08T21:53:50.843Z','impact':{'asOf':'2026-10-08','trees':'1096','estimatedCo2Kg':'124290'}}
html=(root/'index.html').read_text()
html=re.sub(r'  <script[^>]*></script>\n','',html)
html=html.replace('<link rel="manifest" href="manifest.json" />','')
html=html.replace('<link rel="stylesheet" href="assets/styles-092.css" />','<style>'+(root/'assets/styles-092.css').read_text()+'</style>')
logo='data:image/png;base64,'+base64.b64encode((root/'assets/tpf-logo.png').read_bytes()).decode()
html=html.replace('assets/tpf-logo.png',logo)
html=html.replace('<body>','<body><aside class="preview-banner">OFFLINE UI PREVIEW · Simulated Pi login and payments; records in this file are temporary. No account backend or transfer. Global figures are the real TPF summary checked through 8 October 2026; this file does not refresh them.</aside>')
bootstrap="""window.previewImpact = %s;
"""%json.dumps(summary)
common=(root/'assets/app-common-092.js').read_text().replace('tpf_testnet_history_','tpf_offline_preview_history_').replace('tpf_session_username','tpf_offline_preview_session')
app=(root/'assets/app-092.js').read_text().replace('tpf_app_public_impact_v1','tpf_offline_preview_impact_v1').replace('From the public TPF summary; updates can take up to 6 hours to appear here.','Offline preview: verified public summary snapshot. Live refresh is available in the local server version.')
scripts=[bootstrap,(root/'scripts/offline-preview-api.js').read_text(),(root/'scripts/preview-sdk.js').read_text(),(root/'assets/pi-init-092.js').read_text(),(root/'assets/impact-contract.js').read_text(),common,app]
html=html.replace('</body>','\n'.join('<script>'+s.replace('</script','<\\/script')+'</script>' for s in scripts)+'\n</body>')
out.write_text(html)
print(out)
