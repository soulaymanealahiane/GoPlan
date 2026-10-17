// Explicit facts from the applicable 2025-2026/2025-2027 program sheets.
// A sheet rule replaces a conflicting catalog rule; it is not combined with it.
export const SHEET_POLICY='Use the program sheet for the applicable curriculum when it explicitly defines a requirement, course option, prerequisite or course title. Use the catalog for facts the sheet does not specify. An older curriculum sheet does not replace the applicable curriculum. Where a sheet explicitly delegates a minor to its providing school, follow that school’s requirements.';
const csFile='BSCSC_Course-Sequence_Catalog 2025-2027_October_2025.pdf',bbaFile='BBA-Program-sheet-Nov-2025 (5).pdf';
const source=(file,page)=>({file,page,edition:'2025–2026'});
const complete=(rule={})=>({all:[],any:[],coreq:[],minCredits:0,review:false,...rule});
export function applyProgramSheetPolicy(data){
 data.version='aui-2025-26-r4-degree-only';
 const cs=data.programs.find(p=>p.id==='BSCSC'),bba=data.programs.find(p=>p.id==='BBA');
 for(const p of data.programs)p.sourcePolicy=SHEET_POLICY;
 for(const override of Object.values(cs.overrides))Object.assign(override,{coreq:override.coreq||[],minCredits:override.minCredits||0});
 const csGenEd={
  PSC2301:{all:['ENG1301']},LIT2301:{all:['ENG1301']},PHI2301:{all:['ENG1301']},PHI2302:{all:['ENG1301']},
  HUM2301:{all:['FAS1220']},ENG2320:{all:['ENG1301']},
  ART1301:{all:['FYE1101']},ART1302:{all:['FYE1101']},ART1303:{all:['FYE1101']},ART1304:{all:['FYE1101']},ART1305:{all:['FYE1101']},ART1399:{all:['FYE1101']},
  COM2327:{all:['COM2403']},LIT3370:{minCredits:60},ECO1300:{}
 };
 for(const [code,rule] of Object.entries(csGenEd))cs.overrides[code]={...complete(rule),source:source(csFile,code==='COM2327'||code==='ECO1300'||code==='LIT3370'?3:1)};
 const arts=cs.requirements.find(r=>r.id==='bscsc-arts');arts.options=arts.options.map(id=>id==='ART3399'?'ART1399':id==='COM2427'?'COM2327':id);arts.allowedCourses=[...arts.options];arts.source=source(csFile,3);
 const bbaGenEd={
  COM1301:{all:['ENG1301']},ENG1301:{coreq:['FAS0210']},ENG2302:{all:['ENG1301','COM1301']},
  HIS1301:{coreq:['FAS1220']},HIS2301:{all:['ENG1301','FAS1220']},HUM2302:{all:['FAS1220'],minCredits:30},HUM1310:{coreq:['FAS1220']},
  PSC2301:{all:['ENG1301','FAS1220']},LIT2301:{all:['FAS1220','ENG1301']},HUM2306:{all:['FAS1220'],minCredits:30},PHI2301:{all:['FAS1220','ENG1301']},PHI2302:{all:['FAS1220','ENG1301']},
  ART1301:{all:['FAS1220']},ART1302:{all:['FAS1220']},ART1303:{all:['FAS1220']},ART1304:{all:['FAS1220']},ART1305:{all:['FAS1220']},ART1399:{all:['FAS1220']},
  ENG2320:{all:['FAS1220','ENG1301']},COM2327:{minCredits:30},HUM2301:{all:['FAS1220']},LIT3370:{minCredits:60},
  SOC1301:{coreq:['FAS1220']},GEO1301:{coreq:['FAS1220']},SSC1310:{coreq:['FAS1220']},PSY1301:{coreq:['FAS1220']}
 };
 for(const [code,rule] of Object.entries(bbaGenEd))bba.overrides[code]={...complete(rule),source:source(bbaFile,2)};
 const bbaFocus={
  FIN3302:{all:['FIN3301']},FIN3303:{all:['FIN3301']},FIN3305:{all:['FIN3301']},FIN3306:{all:['FIN3301']},FIN3307:{all:['FIN3301']},FIN3399:{all:['FIN3301']},
  FIN4304:{all:['FIN3301','GBU3311']},FIN4305:{all:['FIN3302','FIN3303','GBU3311']},FIN4306:{all:['GBU3311','FIN3303']},FIN4307:{all:['GBU3311','FIN3303']},FIN4308:{all:['FIN4306']},
  HRD3401:{coreq:['HRD2300']},HRD4303:{any:['PSY3302','MGT3305']},MGT3305:{all:['MGT3301']},MGT3306:{all:['MGT3301','COM1301']},
  MGT3399:{all:['MGT3301']},MGT4305:{all:['MGT3305'],minCredits:60},MGT4307:{all:['MGT3301']},MGT4308:{all:['MGT3301']},MGT4310:{all:['MGT3301']},MGT4311:{all:['GBU2301','MGT3301']},MGT4312:{all:['GBU2301','MGT3301']},MGT4314:{all:['MGT3301']},
  MKT3302:{all:['MKT3301']},MKT3303:{all:['MKT3301']},MKT3304:{all:['MKT3301']},MKT3305:{all:['MKT3301']},MKT3399:{all:['MKT3301']},MKT4302:{all:['MKT3301']},MKT4304:{all:['MKT3301'],any:['GBU3311','STA2401','MTH3301']},MKT4305:{all:['MGT3301'],any:['MKT3302','MKT3303']},MKT4307:{all:['MGT3301','MKT3301']},MKT4311:{all:['MKT3301','MIS3301']},
  BAI3302:{any:['GBU2301','MTH3301','EGR3303']},BAI3303:{any:['SCM3301','BAI3302']},BAI3399:{all:['BAI3301','BAI3302']},BAI3304:{all:['BAI3301','BAI3302']},BAI3305:{all:['BAI3301','BAI3302']},
  ACC4305:{all:['FIN3301']},ECO3301:{all:['ECO2302','GBU3311']},MIS3302:{all:['MIS3301']},GBU4308:{all:['MGT3301','MIS3301']},GBU3399:{minCredits:60},
  SCM3301:{any:['GBU2301','MTH3301','EGR3303']},SCM4301:{all:['SCM3301']},SCM4302:{all:['SCM3301']},SCM4303:{all:['SCM4301']},SCM3399:{all:['SCM3301']},
  TIM3301:{all:['MIS3301']},TIM3302:{all:['TIM3301']},TIM3399:{all:['TIM3301']},SDE3301:{all:['MGT3301']},SDE3302:{all:['SDE3301']},SDE3303:{all:['SDE3301']},SDE3399:{all:['SDE3301']},
  FIT3301:{all:['FIN3301']},FIT3302:{all:['FIT3301']},FIT3303:{all:['FIT3301']},FIT3304:{all:['FIT3301']},FIT3305:{all:['FIT3301']}
 };
 for(const [code,rule] of Object.entries(bbaFocus)){
  const page=code.startsWith('FIT')?8:/^(TIM|SDE|SCM)/.test(code)?7:/^(MKT|BAI|ACC4305|ECO3301|MIS3302|GBU4308|GBU3399)/.test(code)?6:/^(MGT3399|MGT4305|MGT4307|MGT4308|MGT431)/.test(code)?5:4;
  bba.overrides[code]={...complete(rule),source:source(bbaFile,page)};
 }
 bba.trackOverrides={MGT:{MGT4306:{...complete({all:['MGT3301'],minCredits:60}),source:source(bbaFile,5)}},MKT:{MKT4306:{...complete({all:['MGT3301','MKT3301']}),source:source(bbaFile,6)}},IB:{MGT4306:{...complete({all:['MGT3301']}),source:source(bbaFile,6)},MKT4306:{...complete({all:['MGT3301'],any:['MKT3302','MKT3303']}),source:source(bbaFile,6)}}};
 cs.notes=cs.notes.filter(n=>!n.startsWith('Use current catalogue civic/French'));
 const conflict=cs.conflicts.find(c=>c.field==='CSC 4307 prerequisite');if(conflict)conflict.details='The applicable CS program sheet p2 requires CSC3324 and CSC3351. These prerequisites replace the different catalog prerequisite and classification condition.';
 const artTitles={ART1301:'Music & Vocal Performance',ART1302:'Dance & Choreography',ART1303:'Painting & Sculpture',ART1304:'Drama & Theater',ART1305:'Art Appreciation',ART1399:'Special Topics in Arts',COM2327:'Art & Design Production'};
 for(const p of [cs,bba])for(const [code,title] of Object.entries(artTitles))p.overrides[code]={...p.overrides[code],title};
 // The same BBA sheet explicitly requires the minor-providing school's rules (p9).
 bba.sourcePolicy+=' BBA sheet page 9 delegates minors outside SBA to the providing school.';
}
export function sheetRule(override){return complete(Object.fromEntries(['all','any','coreq','minCredits','review','finalTerm'].filter(k=>override[k]!==undefined).map(k=>[k,override[k]])));}
