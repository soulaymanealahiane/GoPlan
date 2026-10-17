export const SERVICE_STAGES=[
 {id:'direction',title:'Direction',panel:'direction',agent:'direction'},
 {id:'courses',title:'Courses',panel:'courses',agent:'courses'},
 {id:'companies',title:'Companies',panel:'opportunities',target:'internships',agent:'targets'},
 {id:'exchanges',title:'Exchanges',panel:'opportunities',target:'exchanges',agent:'targets'},
 {id:'semesters',title:'Semesters',panel:'semesters',agent:'pace'}
];
export const STAGE_CHANGES=2,GLOBAL_CHANGES=5,AI_REQUEST_BUDGET=0.25,GLOBAL_REQUESTS=5;
export const SERVICE_API_BUDGET=(SERVICE_STAGES.length*(1+STAGE_CHANGES)+GLOBAL_CHANGES*GLOBAL_REQUESTS)*AI_REQUEST_BUDGET;
export const SERVICE_MARKUP=0.20;
export const SERVICE_PRICE=Number((SERVICE_API_BUDGET*(1+SERVICE_MARKUP)).toFixed(2));
