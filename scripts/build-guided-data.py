"""Compile reviewed source transcriptions for the guided planner."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
work=root/'GoPlan/data/guidance'
m=json.loads((work/'minors-reviewed.json').read_text(encoding='utf-8'))
p=json.loads((work/'pathways-reviewed.json').read_text(encoding='utf-8'))
o=json.loads((work/'opportunities-reviewed.json').read_text(encoding='utf-8'))
mapping={'software':'technology','computing':'technology','ai':'ai-data','data':'ai-data','research':'ai-data','energy':'sustainability','climate':'sustainability','entrepreneurship':'business','finance':'business','marketing':'business','management':'people','leadership':'people','psychology':'people','education':'people','diplomacy':'international','policy':'international','politics':'international','media':'communication','writing':'communication'}
def tagged(x):
    x['tags']=list(dict.fromkeys(mapping.get(t,t) for t in x.get('interestTags',x.get('tags',[]))))
    x.setdefault('source',next((s for s in x.get('sources',[]) if s.get('file')),None))
    return x
data={'reviewedAt':m['reviewedAt'],'minors':[tagged(x) for x in m['minors']], 'internships':[tagged(x) for x in o['internships']], 'exchanges':[tagged(x) for x in o['exchanges']], 'auiMasters':[tagged(x) for x in p['auiMasters']], 'globalMasters':[tagged({**x,'name':x['topic'],'sourceUrl':x['example']['url'],'reason':x['example']['whyRelevant'],'caveat':x['example']['checkBeforeApplying']}) for x in p['globalTopics']], 'policies':p['policies'],'combinedRoutes':p['combinedRoutes'],'exchangePolicy':o['exchangePolicy'],'integrationPolicy':m['integrationPolicy'],'supplementaryCourses':m['supplementaryCourseEvidence'],'notes':o['researchNotes']}
(root/'GoPlan/dist/guided-data.js').write_text('export default '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('Compiled 20 minors, 12 AUI masters, 8 global topics, 18 experience targets.')
