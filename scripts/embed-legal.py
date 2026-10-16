"""Copy approved public text into the app without changing its wording."""
from pathlib import Path
import re,html,json
root=Path(__file__).resolve().parents[1]
source=root.parent/'legal-work/site'
pages=[('privacy-policy','Privacy Policy',source/'privacy-policy/index.html'),('terms-of-service','Terms of Service',source/'terms-of-service/index.html'),('transparency','Transparency &amp; Scope',source/'transparency.html')]
texts={}
def local_links(match):
 attrs,body=match.group(1),match.group(2)
 href=re.search(r'href=["\']([^"\']+)',attrs).group(1)
 targets={'/privacy-policy/':'privacy-policy','/terms-of-service/':'terms-of-service','/transparency.html':'transparency'}
 if href in targets:return '<button type="button" class="inline-link" data-open-legal="'+targets[href]+'">'+body+'</button>'
 if href.startswith(('https://fireside.pinet.com/','https://blockexplorer.minepi.com/')):return '<a href="'+href+'">'+body+'</a>'
 return '<span>'+body+'</span>'
sections=[]
for name,title,path in pages:
 raw=path.read_text()
 content='\n'.join(re.findall(r'<section\b[\s\S]*?</section>',raw))
 texts[name]=re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',content))).strip()
 content=re.sub(r'<a\b([^>]*href=[^>]*)>([\s\S]*?)</a>',local_links,content)
 content=re.sub(r'<p[^>]*data-tpf-policy-status[^>]*>\s*</p>','',content)
 sections.append('<article class="legal-document hidden" data-legal-document="'+name+'"><h1 tabindex="-1">'+title+'</h1>'+content+'</article>')
p=root/'index.html';s=p.read_text()
if '<!-- APP LEGAL START -->' in s:s=re.sub(r'<!-- APP LEGAL START -->[\s\S]*?<!-- APP LEGAL END -->','',s)
block='<!-- APP LEGAL START -->\n<section id="legal-screen" class="hidden" aria-label="Legal and transparency information"><button type="button" class="text-button" id="closeLegalBtn">← Back to the app</button><div class="legal-tabs" aria-label="Legal information"><button type="button" data-open-legal="privacy-policy">Privacy Policy</button><button type="button" data-open-legal="terms-of-service">Terms of Service</button><button type="button" data-open-legal="transparency">Transparency &amp; Scope</button></div>'+''.join(sections)+'</section>\n<!-- APP LEGAL END -->\n'
s=s.replace('    <footer>',block+'    <footer>')
s=re.sub(r'<a[^>]*href="https://thepioneerforest.org/impact"[^>]*>([\s\S]*?)</a>',r'<button type="button" class="text-button" data-open-legal="transparency">Impact &amp; transparency</button>',s)
s=re.sub(r'<a[^>]*href="https://thepioneerforest.org/privacy-policy/"[^>]*>Privacy Policy</a>','<button type="button" class="text-button" data-open-legal="privacy-policy">Privacy Policy</button>',s)
s=re.sub(r'<a[^>]*href="https://thepioneerforest.org/terms-of-service/"[^>]*>Terms of Service</a>','<button type="button" class="text-button" data-open-legal="terms-of-service">Terms of Service</button>',s)
s=re.sub(r'<li><a href="https://thepioneerforest.org/[^"]*"[^>]*>[\s\S]*?</a></li>','',s)
s=re.sub(r'\s*<a href="https://minepi.com/pi-browser/"[^>]*>[\s\S]*?</a>','',s)
s=s.replace(' target="_blank" rel="noopener"','')
s=s.replace(' href="https://thepioneerforest.org/"','')
s=s.replace('<a>Visit the TPF website</a>.','')
s=s.replace('Explore TPF’s public impact summary and its official Fireside channel for project updates and planting records.','View The Pioneer Forest’s impact and transparency information here, or follow the official Fireside channel for project updates and planting records.')
p.write_text('\n'.join(line.rstrip() for line in s.splitlines())+'\n')
(root/'tests/approved-legal-text.json').write_text(json.dumps(texts,indent=2))
print('Approved legal text embedded; website links replaced with in-app navigation.')
