"""Build traceable course records from the supplied catalog's page extraction."""
import json,re,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=ROOT.parent/'.goplan-work'
pages=json.loads((WORK/'catalogue-pages.json').read_text(encoding='utf-8'))
headers=[]
pattern=re.compile(r'^([A-Z]{2,4})\s?(\d{4})\s+(.+?)\s*\((\d+)\s*SCH\)',re.M)
boundary=re.compile(r'^[A-Z]{2,4}\s?\d{4}(?:\b|,)',re.M)
records={}
for i,p in enumerate(pages):
 text=p['text']
 if not (195<=p['page']<=296 or 354<=p['page']<=422):continue
 matches=list(pattern.finditer(text))
 for j,m in enumerate(matches):
  code=m[1]+m[2]
  next_head=boundary.search(text,m.end())
  body=text[m.end():next_head.start()] if next_head else text[m.end():]
  if not next_head and i+1<len(pages):
   nxt=pages[i+1]['text'];head=boundary.search(nxt)
   body+='\n'+nxt[:head.start() if head else 0]
  prereq=re.search(r'(?im)^\s*Pre(?:-|\s)?requisite(?:s|\(s\))?\s*:\s*([^\n]*)',body)
  raw=prereq[1].strip() if prereq else ''
  if prereq:
   tail=body[prereq.end():].splitlines()
   for line in tail:
    line=line.strip()
    if not line:continue
    if len(line)<110 and (re.match(r'^(?:or |and |\(or |classification|standing|approval|permission)',line,re.I) or re.search(r'[A-Z]{2,4}\s?\d{4}',line) or raw.endswith((' and',',',' or'))):raw+=' '+line
    else:break
  raw=' '.join(raw.split())
  record={'id':code,'title':' '.join(m[3].split()),'credits':int(m[4]),'source':{'id':'catalogue','file':'aui academic catalogue.pdf','page':p['page'],'edition':'2025–2026'},'prerequisiteText':raw,'courseCodesMentioned':list(dict.fromkeys(re.findall(r'\b([A-Z]{2,4})\s?(\d{4})\b',raw))),'lab':bool(re.search(r'\b(?:lab|laboratory)\b',body[:130],re.I)),'evidenceText':(m[0]+'\n'+body).strip()[:4500]}
  record['courseCodesMentioned']=[''.join(x) for x in record['courseCodesMentioned']]
  records[code]=record
(WORK/'catalogue-courses.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Extracted {len(records)} catalog course headings with page references.')
for code in sorted(records):
 if code.startswith(('CSC','MTH','PHY','FAS','SSK','ENG')):print(code,records[code]['title'],'|',records[code]['prerequisiteText'])
