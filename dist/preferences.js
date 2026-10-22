// Shared, public preference vocabulary. Order is a relevance signal, never eligibility.
export const QUICK_CHOICES={
 ambitions:['Build useful technology','Grow a business','Solve environmental problems','Improve communities','Create and communicate ideas','Understand global challenges','Design better systems','Manage money and investments','Shape public policy and diplomacy','Promote human rights and social justice','Develop education and youth opportunities','Build brands and reach customers','Understand people and organizations','Explore culture, languages and history','Advance science and research','Undecided'],
 activities:['Programming and building products','Analyzing data and patterns','Leading people and projects','Designing and creating','Writing and storytelling','Negotiating and connecting people','Experimenting with physical systems','Financial analysis and investment decisions','Accounting, auditing and managing risk','Studying politics and international relations','Researching social issues and public policy','Marketing, branding and customer research','Teaching, mentoring and supporting people','Organizing events and community initiatives','Learning languages and comparing cultures','Managing operations and supply chains','Producing film, journalism and digital media','Undecided'],
 strengths:['Mathematics and logic','Coding and technology','Business and economics','Science and engineering','Languages and writing','Creative projects','People and social questions','Finance and accounting','Politics, history and international affairs','Communication and public speaking','Psychology and human behavior','Environmental and sustainability studies','Marketing and consumer behavior','Research and critical analysis','Leadership and teamwork','Undecided'],
 industries:['Technology and AI','Finance and fintech','Energy and sustainability','Manufacturing and logistics','Media and creative industries','Public policy and international affairs','Startups and small businesses','Banking, investment and insurance','Accounting, audit and consulting','Diplomacy and international organizations','Education and social development','Nonprofits and humanitarian work','Marketing, advertising and public relations','Tourism, hospitality and cultural industries','Human resources and organizational development','Public administration and government','Consumer goods, retail and e-commerce','Agriculture, food and water','Still exploring'],
 priorities:['Good income','Stable employment','Meaningful impact','Creative freedom','International opportunities','Flexible working life','Learning and research','Professional qualifications and expertise','Working directly with people','Leadership and responsibility','Independence and ownership','Serving my local community','Work-life balance','I am still deciding'],
 entrepreneurship:['I want to start a business','I want startup experience first','I prefer an established employer','I am interested in research','I want to build a social enterprise','I am interested in public service or nonprofits','I want to work independently or freelance','I want to join or grow a family business','I am interested in creative or cultural ventures','I am still deciding'],
 automation:['Build AI systems','Use AI in another industry','Work with people and human judgment','Build or operate physical systems','Use AI in finance and business decisions','Use AI for communication and creative work','Study AI policy, ethics and social impact','Use AI for research and education','Learn practical AI tools before deciding','I am still exploring'],
 constraints:['A manageable regular workload','Finish as soon as feasible','Keep summers free','Include summer study','Explore an exchange','Keep costs in mind','Balance study with work or family','Avoid courses beyond my degree requirements','Leave time for clubs and community work','Plan for postgraduate study','Build professional experience during study','Stay close to home when possible','No particular constraints yet']
};
export const isUnsure=value=>/^(Undecided|Still exploring|I am still|No particular constraints)/.test(value);
export function cleanRankings(value={},questionnaire){
 return Object.fromEntries(Object.entries(QUICK_CHOICES).flatMap(([id,options])=>{
  const values=[...new Set((Array.isArray(value?.[id])?value[id]:[]).filter(v=>typeof v==='string'&&options.includes(v)&&(!questionnaire||String(questionnaire[id]||'').includes(v))))];
  return values.length?[[id,values.some(isUnsure)?[values.find(isUnsure)]:values]]:[];
 }));
}
// Each answer keeps its existing importance; first choices receive more weight.
// Residual free text still contributes at normal weight. Legacy answers stay equal.
export function weightedPreferences(questionnaire={},rankings={},visit){
 const clean=cleanRankings(rankings,questionnaire);
 for(const [id,answer]of Object.entries(questionnaire)){
  if(typeof answer!=='string')continue;
  const ordered=clean[id]||[];let remainder=answer;
  ordered.forEach((choice,index)=>{visit(choice,1.8-index/Math.max(1,ordered.length-1)*1.2,id);remainder=remainder.replace(choice,'');});
  visit(remainder,1,id);
 }
}
