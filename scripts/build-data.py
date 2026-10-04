"""Build public academic reference data from the user-supplied documents.
Never reads the personal degree-plan workbook. JSON inputs are research artifacts.
"""
from pathlib import Path
import json, re, runpy
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent / '.goplan-work'
INPUT = ROOT.parent / 'GoPlan Database'
OUT = ROOT / 'dist'
def read(name): return json.loads((WORK / name).read_text(encoding='utf-8'))
def code(s): return re.sub(r'\s+', '', s).upper()
def source(s):
    return {'file':s.get('filename',s.get('file','aui academic catalogue.pdf')), 'page':s.get('pdfPage',s.get('page',(s.get('pages') or [1])[0])), 'edition':s.get('edition','2025–2026')}

catalog = read('catalogue-courses.json')
for c in catalog.values():
    c['code']=c['id']
    c['description']=c.pop('evidenceText','').split('www.aui.ma')[0].strip()
    c.pop('courseCodesMentioned',None)
    c['title']=c['title'].replace('\ufffd','’')
    raw = c.get('prerequisiteText','')
    c['rule']={'all':[], 'any':[], 'coreq':[], 'minCredits':0, 'review':True}
    # Only pure course-code lists are safe to translate automatically.
    compact = re.sub(r'([A-Z]{3})\s+(\d{4})',r'\1\2',raw)
    clean = re.sub(r'\b[A-Z]{3}\d{4}\b','',compact)
    clean = re.sub(r'\b(and|or|none|None)\b|[,.;:\s]','',clean)
    codes = re.findall(r'\b[A-Z]{3}\d{4}\b',compact)
    if raw.strip().lower() in ['none','none.']:
        c['rule']['review']=False
    elif codes and not clean and not (' and ' in compact and ' or ' in compact):
        c['rule']['any' if ' or ' in compact else 'all']=codes
        c['rule']['review']=False

def rule(cid, all=(), any=(), coreq=(), minCredits=0, review=False, **extra):
    if cid in catalog: catalog[cid]['rule']={'all':list(all),'any':list(any),'coreq':list(coreq),'minCredits':minCredits,'review':review,**extra}

# Manually checked Boolean/corequisite/standing clauses in catalogue pp216–240.
rule('CSC1401'); rule('MTH1311'); rule('MTH1304')
rule('CSC2305',['CSC2302'],coreq=['PHY1402'])
rule('CSC2306',['CSC2302','MTH1304'])
rule('CSC3308',any=['CSC1402','CSC1401','BAI3301'],review=True)
rule('CSC3309',['CSC2306','CSC3323','EGR3393'],minCredits=60)
rule('CSC3315',['CSC2305','CSC2306'],minCredits=60)
rule('CSC3323',['CSC2302','MTH2320'],minCredits=60)
rule('CSC3326',any=['CSC2306','CSC3308','BAI3301'],minCredits=60,review=True)
rule('CSC3324',['CSC3326']); rule('CSC3374',['CSC3324','CSC3351'])
rule('CSC4307',any=['CSC3324','CSC3373'],minCredits=60)
rule('CSC4308',['CSC3324','CSC3351','CSC3371'])
rule('CSC4306',['CSC3324'],minCredits=60)
rule('CSC4309',['CSC3374']); rule('CSC4310',['CSC4308'])
rule('ENG1301',coreq=['FAS1220'],review=True)
rule('FAS1220',['FAS0210'])
rule('EGR4300',['ENG2303'],any=['FRN3210','FRN3310'],review=True)
rule('EGR4402',['ENG2303'],review=True,finalTerm=True)

ug = read('undergraduate.json')
programs=[]
def req(r):
    o={**r,'source':source(r['source'])}
    if r.get('courseCode'): o['code']=code(r['courseCode'])
    o['options']=[code(x) for x in r.get('allowedCourses',[])]
    o['choice']=r.get('type')=='requirementChoice'
    if o.get('code') and o['code'] not in catalog:
        catalog[o['code']]={'code':o['code'],'title':r['title'],'credits':r['credits'],'source':o['source'],'prerequisiteText':'No course-description prerequisite was extracted. Check the program source.','rule':{'all':[],'any':[],'coreq':[],'minCredits':0,'review':True}}
    return o

for p in ug['programs']:
    q={k:p[k] for k in ['id','name','level','degreeCredits','notes','conflicts']}
    q.update({'edition':p['catalog'],'source':source(p['primarySource']),'requirements':[req(x) for x in p['requirements']], 'tracks':[]})
    for t in p['tracks']:
        q['tracks'].append({**t,'source':source(t['source']),'requirements':[req(x) for x in t['requirements']]})
    q['overrides']={}
    for x in p.get('explicitRequisites',[]):
        cid=code(x['courseCode']); text=x['prerequisiteText']; codes=re.findall(r'[A-Z]{3}\s*\d{4}',text)
        q['overrides'][cid]={'prerequisiteText':text,'source':source(x['source']),'all':[] if ' or ' in text else [code(x) for x in codes],'any':[code(x) for x in codes] if ' or ' in text else [],'review':not bool(codes)}
    if p['id']=='BSCSC':
        q['conflicts'].append({'field':'CSC 4307 prerequisite','details':'October 2025 CS sheet p2 requires CSC 3324 AND CSC 3351; catalogue p225 says CSC 3324 OR CSC 3373 and junior standing. The planner uses the later CS sheet plus junior standing; confirm your applicable rule.','sources':[source(p['primarySource']),{'file':'aui academic catalogue.pdf','page':225}]})
    if p['id']=='BSEMS': q['conflicts'].append({'field':'Finance thematic course codes','details':'The finance thematic list p186 labels FIN 3302 Principles of Finance, whereas the course description uses FIN 3301 for that title. Confirm the thematic course mapping before registration.','sources':[{'file':'aui academic catalogue.pdf','page':186}]})
    programs.append(q)

grad_path=WORK/'graduate.json'
graduate=read('graduate.json') if grad_path.exists() else {'programs':[], 'policies':[], 'combinedPathways':[]}
# Graduate normalization is intentionally separate from extraction for auditability.
for p in graduate['programs']:
    credits=p.get('credits',30)
    q={'id':p['id'],'name':p['name'],'level':'graduate','degreeCredits':{'min':credits,'max':credits},'edition':'2025–2026','source':source(p['source']),'requirements':[], 'tracks':[], 'overrides':{},'notes':[], 'conflicts':p.get('conflicts',[]),'admissionNotes':p.get('admissionNotes',[]),'policies':p.get('policies',[])}
    def gr(c, ident=None):
        cid=code(c['code']) if c.get('code') else ''
        r={'id':ident or cid.lower(),'code':cid,'title':c['title'],'credits':c['credits'],'category':'Graduate core','source':source(c.get('source',p['source'])),'choice':False,'options':[]}
        if cid and cid not in catalog: catalog[cid]={'code':cid,'title':c['title'],'credits':c['credits'],'source':r['source'],'prerequisiteText':'See program and admission requirements.','rule':{'all':[],'any':[],'coreq':[],'minCredits':0,'review':True}}
        return r
    for c in p['curriculum']['core']: q['requirements'].append(gr(c))
    for j,g in enumerate(p['curriculum'].get('electiveGroups',[])):
        for c in g.get('courses',[]): gr(c)
        for i in range(g.get('choose',1)):
            q['requirements'].append({'id':f"{p['id']}-option-{j}-{i}",'title':f"{g['name']} {i+1}",'credits':g.get('creditsPerCourse',3),'category':'Graduate elective','source':source(g.get('source',p['source'])),'choice':True,'options':[code(c['code']) for c in g.get('courses',[]) if c.get('code')],'condition':g.get('notes','Choose from the source-listed options; approval may apply.')})
    # Culminating alternatives can represent a complete set of registrations.
    for j,g in enumerate(p['curriculum'].get('culminatingOptions',[])):
        pass  # finalized once extraction schema is available
    programs.append(q)

reviewed=runpy.run_path(str(ROOT/'scripts'/'graduate-data.py'))
programs=[p for p in programs if p['level']=='undergraduate']+reviewed['graduate_programs']()
catalog_pages=read('catalogue-pages.json')
mba_options=sorted(set(re.findall(r'\b[A-Z]{3}\s*5\d{3}\b',' '.join(x['text'] for x in catalog_pages if 305<=x['page']<=308))))
mba_options=[code(x) for x in mba_options]
for p in programs:
    if p['id']=='MBA':
        for t in p['tracks']:
            for r in t['requirements']:
                if r['choice']:r['options']=[x for x in mba_options if x in catalog and x not in [c['code'] for c in p['requirements']]]
for p in programs:
    for r in p['requirements']+[r for t in p['tracks'] for r in t['requirements']]:
        cid=r.get('code')
        if cid and cid not in catalog:
            catalog[cid]={'code':cid,'title':r['title'],'credits':r['credits'],'source':r['source'],'prerequisiteText':'Check program requirements and coordinator approval; no current course-description rule is available.','rule':{'all':[],'any':[],'coreq':[],'minCredits':0,'review':True}}
        for option in r.get('options',[]):
            if option not in catalog:
                catalog[option]={'code':option,'title':option+' · source-listed option','credits':r['credits'],'creditsProvisional':True,'source':r['source'],'prerequisiteText':'This code is listed in the program options, but its course-description entry was not extracted. Credits shown are the requirement allocation. Confirm its title, actual credits, prerequisites and availability.','rule':{'all':[],'any':[],'coreq':[],'minCredits':0,'review':True}}
data={'version':'aui-2025-26-r2','programs':programs,'courses':catalog,'policies':reviewed['policies'](),'combinedPathways':[], 'documents':[]}
pages=json.loads((OUT/'source-pages.json').read_text(encoding='utf-8')) if (OUT/'source-pages.json').exists() else {}
for path in sorted(INPUT.glob('*.pdf')):
    if path.name not in pages:
        reader=PdfReader(path)
        pages[path.name]=[p.extract_text() or '' for p in reader.pages]
    data['documents'].append({'file':path.name,'pages':len(pages[path.name])})
(OUT/'academic-data.js').write_text('export default '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(OUT/'source-pages.json').write_text(json.dumps(pages,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Built',len(programs),'programs,',len(catalog),'courses,',len(pages),'documents')
