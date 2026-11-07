// Relevance within a business sector, never a vacancy or student eligibility claim.
import {weightedPreferences} from './preferences.js';
const normalize=value=>' '+String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
const vocabulary={
 cybersecurity:['cyber','infosec','digital security','securite numerique','identity security'],
 cloud:['cloud','devops','data center','data centre','infrastructure informatique'],
 ai:['artificial intelligence','machine learning','intelligence artificielle','computer vision','robotics',' ai '],
 payments:['payment','paiement','monetique','digital wallet','transaction processing'],
 banking:['bank','banque','bancaire'],
 investment:['invest','asset management','capital markets','private equity','fund management','portfolio'],
 accounting:['accounting','audit','comptab','expertise comptable'],
 insurance:['insurance','assurance','reinsurance','actuar','claims'],
 marketing:['marketing','branding','advertis','public relations','customer research','brand management'],
 journalism:['journalis','publishing','publisher','editorial','newsroom','presse'],
 media:['film','cinema','audiovis','broadcast','television','multimedia'],
 hospitality:['hospitality','hotel','touris','travel','hotellerie','airline'],
 healthcare:['healthcare','medical','pharma','biotech','sante','clinique'],
 agriculture:['agricultur','agritech','food','aliment','farmer','farming','irrigation'],
 water:['water','waste','wastewater','desalin','dessal','traitement des eaux'],
 renewables:['renewable','solar','wind energy','solaire','eolien','renouvelable'],
 automotive:['automotive','automobile','vehicle','vehicule'],
 aerospace:['aerospace','aeronaut','aerospat','aviation'],
 manufacturing:['manufactur','industrial production','production industrielle','industrial engineering'],
 logistics:['logistic','supply chain','freight','shipping','transport de marchandises'],
 construction:['construction','civil engineering','civil infrastructure','transport infrastructure','real estate','immobilier'],
 people:['human resources','recruit','recrut','ressources humaines','hr tech'],
 trade:['international trade','import','export','cross border','commerce international'],
 education:['educat','teaching','edtech','e learning','training services']
};
export function detectCompanySpecialisms(value){const text=normalize(value).replace(/\b(?:quality assurance|assurance qualite|software publisher|software publishing|editeur de logiciels)\b/g,' ');return Object.keys(vocabulary).filter(key=>vocabulary[key].some(term=>text.includes(term)));}
export function companyPreferenceWeights(request,interests={}){
 const weights={},add=(text,weight)=>{for(const key of detectCompanySpecialisms(text))weights[key]=(weights[key]||0)+weight;};
 add(request.refinement,10);const importance={activities:8,ambitions:7,industries:6,strengths:4,entrepreneurship:3,automation:2};
 weightedPreferences(request.questionnaire,request.questionnaireRankings,(text,weight,id)=>{if(importance[id])add(text,weight*importance[id]);});
 if(!Object.values(request.questionnaire||{}).some(Boolean))add(request.goal,5);
 add(interests.focus,2);add(interests.secondFocus,1);add(interests.minor,1);
 // Aerospace/automotive manufacturing is a narrower request than manufacturing
 // in general; a cement plant must not earn the same specialist match.
 if(weights.aerospace||weights.automotive)delete weights.manufacturing;
 return weights;
}
