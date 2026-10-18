import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {LearnPathDB} from '../src/worker.js';
const db=new DatabaseSync(':memory:');
const sql={exec(query,...values){if(!values.length&&query.includes('CREATE TABLE')){db.exec(query);return {toArray:()=>[]}}const stm=db.prepare(query);if(/^\s*(?:SELECT|PRAGMA)/i.test(query))return {toArray:()=>stm.all(...values)};stm.run(...values);return {toArray:()=>[]}}};
let init;const state={storage:{sql},blockConcurrencyWhile(fn){init=Promise.resolve(fn());return init}};const app=new LearnPathDB(state,{});await init;
function req(path,method='GET',body=null,token='',headers={}){return new Request('https://web.test'+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{cookie:`lp_session=${token}`}:{}) ,...headers},...(body?{body:JSON.stringify(body)}:{})})}
const read=async req=>(await app.fetch(req)).json();
let teacherToken='',studentToken='',classId='',classCode='',studentId='',assId='';
const extract=(result)=>result.headers.get('set-cookie')?.match(/lp_session=([^;]+)/)?.[1]||'';
test('first user requires verified setup code',async()=>{let r=await app.fetch(req('/api/auth/register','POST',{name:'Cô A',email:'co@example.org',password:'StrongPass!123'}));assert.equal(r.status,403)});
test('teacher init, session and authorization',async()=>{
 let r=await app.fetch(req('/api/auth/register','POST',{name:'Cô A',email:'co@example.org',password:'StrongPass!123'},'',{'x-internal-setup':'yes'}));assert.equal(r.status,200);teacherToken=extract(r);assert.ok(teacherToken.length>30);
 let me=await read(req('/api/me','GET',null,teacherToken));assert.equal(me.user.role,'teacher');assert.equal(me.user.email,'co@example.org');
 let forbidden=await app.fetch(req('/api/teacher/overview'));assert.equal(forbidden.status,401);
});
test('teacher classes and student enrollment',async()=>{
 let r=await read(req('/api/teacher/classes','POST',{name:'Bốn A2'},teacherToken));classId=r.id;classCode=r.code;assert.match(classCode,/^L4[A-Z0-9]+/);
 let add=await read(req('/api/teacher/students','POST',{class_id:classId,students:[{code:'HS01',name:'Học sinh 01',pin:'111111'}]},teacherToken));assert.equal(add.count,1);studentId=add.inserted[0].id;
 let overview=await read(req('/api/teacher/overview','GET',null,teacherToken));assert.equal(overview.student_count,1);assert.equal(overview.classes[0].name,'Bốn A2');
});
test('student login, assignment and result',async()=>{
 let r=await app.fetch(req('/api/auth/student-login','POST',{class_code:classCode,student_code:'HS01',pin:'111111'}));assert.equal(r.status,200);studentToken=extract(r);
 let assign=await read(req('/api/teacher/assignments','POST',{class_id:classId,title:'Toán 4',question_ids:[1,2,3,4]},teacherToken));assId=assign.id;
 let quiz=await read(req('/api/student/quiz?assignment_id='+assId,'GET',null,studentToken));assert.equal(quiz.questions.length,4);assert.ok(!('correct' in quiz.questions[0]));
 let result=await read(req('/api/student/submit','POST',{assignment_id:assId,answers:{1:'B',2:'C',3:'B',4:'A'}},studentToken));assert.equal(result.result.correct,4);assert.equal(result.result.score,10);
 let again=await app.fetch(req('/api/student/submit','POST',{assignment_id:assId,answers:{}},studentToken));assert.equal(again.status,409);
 let dash=await read(req('/api/student/dashboard','GET',null,studentToken));assert.equal(dash.assignments[0].completed,true);assert.equal(dash.history.length,1);
});
test('teacher grade import, report and AI restricted data',async()=>{
 let grades=await read(req('/api/teacher/grades','POST',{class_id:classId,label:'Kiểm tra giữa kì',rows:[{code:'HS01',score:8,max_score:10}]},teacherToken));assert.equal(grades.count,1);
 let report=await read(req('/api/teacher/report?class_id='+classId,'GET',null,teacherToken));assert.equal(report.students.length,1);assert.equal(report.students[0].grades[0].score,8);
 let ai=await read(req('/api/ai/teacher','POST',{type:'student',student_id:studentId},teacherToken));assert.equal(ai.__ai_request,true);assert.ok(!ai.prompt.includes('Học sinh 01'));assert.ok(ai.prompt.includes('HS01'));
 let hint=await read(req('/api/ai/hint','POST',{question_id:1},studentToken));assert.equal(hint.__ai_request,true);
});
test('student cannot access teacher data',async()=>{let r=await app.fetch(req('/api/teacher/overview','GET',null,studentToken));assert.equal(r.status,404)});
