export const SKILLS=['Số tự nhiên','Phép tính','Phân số','Đo lường','Hình học','Giải toán có lời văn','Thống kê'];
export const letter=(i)=>'ABCD'[i]||'';
export function grade(questions,answers={}){
 let correct=0;const per={};const detail=[];
 for(const q of questions){let skill=q.skill;per[skill]??={right:0,total:0};let ans=String(answers[q.id]||'').toUpperCase();let ok=ans===q.correct;per[skill].total++;if(ok){correct++;per[skill].right++}detail.push({id:q.id,skill,answer:ans,correct:q.correct,ok,explanation:q.explanation,hint:q.hint})}
 return {correct,total:questions.length,score:questions.length?Math.round(1000*correct/questions.length)/100:0,per,detail};
}
export function weakSkills(attempts){let agg={}; for(const a of attempts){const p=a.per||{};for(const [skill,v] of Object.entries(p)){agg[skill]??={right:0,total:0};agg[skill].right+=v.right;agg[skill].total+=v.total}}
 return Object.entries(agg).sort((a,b)=>a[1].right/a[1].total-b[1].right/b[1].total).map(([s,v])=>({skill:s,accuracy:Math.round(v.right/v.total*100),total:v.total}));}
export function adaptive(questions,history=[],limit=6){const weak=weakSkills(history);const priorities=new Map(weak.map((v,i)=>[v.skill,i]));return [...questions].sort((a,b)=>{let pa=priorities.has(a.skill)?priorities.get(a.skill):100;let pb=priorities.has(b.skill)?priorities.get(b.skill):100;if(pa!==pb)return pa-pb;return a.level-b.level||a.id-b.id}).slice(0,limit)}
export function publicQuestions(qs){return qs.map(({id,prompt,options,skill,level})=>({id,prompt,options,skill,level}))}
