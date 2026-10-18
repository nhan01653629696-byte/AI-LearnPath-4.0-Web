import QUESTIONS from './questions.json' with {type:'json'};
import {SKILLS,grade,weakSkills,adaptive,publicQuestions} from './logic.js';

const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const bad=(msg,status=400)=>{throw Object.assign(new Error(msg),{status})};
const read=async req=>{if(Number(req.headers.get('content-length')||0)>900000)bad('Tệp hoặc yêu cầu quá lớn',413);try{return await req.json()}catch{bad('Dữ liệu JSON không hợp lệ')}};
const random=()=>crypto.randomUUID().replaceAll('-','');
const now=()=>new Date().toISOString();
const day=()=>new Date().toISOString().slice(0,10);
const rows=(sql,q,...params)=>sql.exec(q,...params).toArray();
const first=(sql,q,...params)=>rows(sql,q,...params)[0]||null;
const safe=(s,max=100)=>String(s??'').trim().slice(0,max);
const parse=x=>{try{return JSON.parse(x||'{}')}catch{return {}}};
const cookie=req=>(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('lp_session='))?.split('=')[1]||'';
async function sha(s){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function password(pass,salt=random()){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);const hash=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:115000,hash:'SHA-256'},key,256);return salt+':'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function verify(pass,stored){if(!stored||!stored.includes(':'))return false;return await password(pass,stored.split(':')[0])===stored}
const sessionCookie=(token,maxAge)=>`lp_session=${token||''}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const QBYID=new Map(QUESTIONS.map(q=>[q.id,q]));

export class LearnPathDB {
 constructor(state,env){this.state=state;this.env=env;this.sql=state.storage.sql;state.blockConcurrencyWhile(async()=>{
  const s=this.sql;
  s.exec(`CREATE TABLE IF NOT EXISTS teachers(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,full_name TEXT NOT NULL,pass_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites(code_hash TEXT PRIMARY KEY,created_by TEXT NOT NULL,used_at TEXT);
CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY,teacher_id TEXT NOT NULL,name TEXT NOT NULL,code TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,class_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,pin_hash TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(class_id,code));
CREATE TABLE IF NOT EXISTS assignments(id TEXT PRIMARY KEY,class_id TEXT NOT NULL,teacher_id TEXT NOT NULL,title TEXT NOT NULL,question_ids TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,assignment_id TEXT,kind TEXT NOT NULL,answers TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS grades(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,label TEXT NOT NULL,score REAL NOT NULL,max_score REAL NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,role TEXT NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_issues(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,question_ids TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at TEXT);
CREATE TABLE IF NOT EXISTS approved_notes(id TEXT PRIMARY KEY,teacher_id TEXT NOT NULL,class_id TEXT,student_id TEXT,kind TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage(key TEXT NOT NULL,day TEXT NOT NULL,total INTEGER NOT NULL,PRIMARY KEY(key,day));`);
 });}
 async auth(req){let token=cookie(req);if(!token)return null;let h=await sha(token);let s=first(this.sql,'SELECT * FROM sessions WHERE hash=?',h);if(!s||s.expires_at<Date.now())return null;let u=s.role==='teacher'?first(this.sql,'SELECT id,email,full_name FROM teachers WHERE id=?',s.user_id):first(this.sql,'SELECT id,code,name,class_id FROM students WHERE id=?',s.user_id);return u?{...u,role:s.role}:null}
 async start(role,id){let token=random()+random();this.sql.exec('INSERT INTO sessions(hash,role,user_id,expires_at) VALUES(?,?,?,?)',await sha(token),role,id,Date.now()+7*86400000);return token}
 owned(cls,teacher){let c=first(this.sql,'SELECT * FROM classes WHERE id=? AND teacher_id=?',cls,teacher.id);if(!c)bad('Không tìm thấy lớp học hoặc không có quyền truy cập',404);return c}
 studentOwned(sid,teacher){let s=first(this.sql,'SELECT s.* FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=? AND c.teacher_id=?',sid,teacher.id);if(!s)bad('Không tìm thấy học sinh',404);return s}
 studentHistory(sid){return rows(this.sql,'SELECT * FROM attempts WHERE student_id=? ORDER BY created_at DESC LIMIT 30',sid).map(a=>({id:a.id,kind:a.kind,assignment_id:a.assignment_id,created_at:a.created_at,...parse(a.result)}));}
 studentProfile(s,includeName=false){let hist=this.studentHistory(s.id);let g=rows(this.sql,'SELECT label,score,max_score,created_at FROM grades WHERE student_id=? ORDER BY created_at',s.id);return {id:s.id,code:s.code,name:includeName?s.name:undefined,attempts:hist,grades:g,weak:weakSkills(hist),total:hist.length}}
 async fetch(req){try{return await this.route(req)}catch(e){return json({error:e.message||'Lỗi xử lý',code:e.status||500},e.status||500)}}
 async route(req){const sql=this.sql, url=new URL(req.url), path=url.pathname,method=req.method;
  if(method==='GET'&&path==='/api/bootstrap')return json({has_admin:!!first(sql,'SELECT id FROM teachers LIMIT 1'),skills:SKILLS,questions_count:QUESTIONS.length});
  if(method==='POST'&&path==='/api/auth/register'){
   const d=await read(req),email=safe(d.email,140).toLowerCase(),name=safe(d.name,100),pass=String(d.password||'');
   if(!email.includes('@')||!name||pass.length<10)bad('Vui lòng nhập tên, email và mật khẩu tối thiểu 10 ký tự');
   if(first(sql,'SELECT id FROM teachers WHERE email=?',email))bad('Email đã được sử dụng');
   const existed=first(sql,'SELECT id FROM teachers LIMIT 1');let codeHash='';
   if(!existed){if(req.headers.get('x-internal-setup')!=='yes')bad('Mã khởi tạo quản trị chưa hợp lệ',403)}
   else {const code=safe(d.invite,100);if(!code)bad('Cần mã mời từ giáo viên quản trị',403);codeHash=await sha(code);const inv=first(sql,'SELECT * FROM invites WHERE code_hash=? AND used_at IS NULL',codeHash);if(!inv)bad('Mã mời không hợp lệ hoặc đã sử dụng',403)}
   let id=random();sql.exec('INSERT INTO teachers VALUES(?,?,?,?,?)',id,email,name,await password(pass),now());if(codeHash)sql.exec('UPDATE invites SET used_at=? WHERE code_hash=?',now(),codeHash);
   const token=await this.start('teacher',id);return json({ok:true,role:'teacher',name},200,{'set-cookie':sessionCookie(token,604800)});
  }
  if(method==='POST'&&path==='/api/auth/login'){
   const d=await read(req);const t=first(sql,'SELECT * FROM teachers WHERE email=?',safe(d.email,140).toLowerCase());if(!t||!(await verify(String(d.password||''),t.pass_hash)))bad('Email hoặc mật khẩu chưa đúng',401);
   const token=await this.start('teacher',t.id);return json({ok:true,role:'teacher',name:t.full_name},200,{'set-cookie':sessionCookie(token,604800)});
  }
  if(method==='POST'&&path==='/api/auth/student-login'){
   const d=await read(req);const c=first(sql,'SELECT * FROM classes WHERE code=?',safe(d.class_code,30).toUpperCase());const s=c?first(sql,'SELECT * FROM students WHERE class_id=? AND code=?',c.id,safe(d.student_code,30).toUpperCase()):null;
   if(!s||!(await verify(String(d.pin||''),s.pin_hash)))bad('Mã lớp, mã học sinh hoặc PIN chưa đúng',401);
   const token=await this.start('student',s.id);return json({ok:true,role:'student',name:s.name},200,{'set-cookie':sessionCookie(token,604800)});
  }
  if(method==='POST'&&path==='/api/auth/logout'){
   let token=cookie(req);if(token)sql.exec('DELETE FROM sessions WHERE hash=?',await sha(token));return json({ok:true},200,{'set-cookie':sessionCookie('',0)});
  }
  let u=await this.auth(req);
  if(method==='GET'&&path==='/api/me')return json({user:u,ai_available:req.headers.get('x-ai-available')==='yes'});
  if(!u)bad('Vui lòng đăng nhập',401);
  if(u.role==='teacher'){
   if(method==='GET'&&path==='/api/teacher/invite-status')return json({message:'Chia sẻ mã mời một lần với đồng nghiệp để tạo tài khoản giáo viên.'});
   if(method==='POST'&&path==='/api/teacher/invite'){const invite=random().slice(0,12).toUpperCase();sql.exec('INSERT INTO invites VALUES(?,?,NULL)',await sha(invite),u.id);return json({invite})}
   if(method==='GET'&&path==='/api/teacher/overview'){
    const classes=rows(sql,'SELECT * FROM classes WHERE teacher_id=? ORDER BY created_at DESC',u.id);
    const clsids=classes.map(c=>c.id);let total=0;let attempts=0;let avg=0;
    const details=[];
    for(const c of classes){let students=rows(sql,'SELECT id,code,name FROM students WHERE class_id=? ORDER BY code',c.id);let assignments=rows(sql,'SELECT id,title,created_at,question_ids FROM assignments WHERE class_id=? ORDER BY created_at DESC',c.id);let stats=first(sql,`SELECT COUNT(*) AS total,AVG(CAST(json_extract(result,'$.score') AS REAL)) AS average FROM attempts WHERE student_id IN (SELECT id FROM students WHERE class_id=?)`,c.id);
      total+=students.length;attempts+=Number(stats.total||0);avg+=Number(stats.average||0)*Number(stats.total||0);
      details.push({...c,students:students.length,assignments:assignments.length,attempts:Number(stats.total||0),average:Math.round(Number(stats.average||0)*100)/100});
    }
    return json({classes:details,student_count:total,attempt_count:attempts,average:attempts?Math.round(avg/attempts*100)/100:0,skills:SKILLS});
   }
   if(method==='GET'&&path==='/api/teacher/questions')return json({questions:QUESTIONS,skills:SKILLS});
   if(method==='POST'&&path==='/api/teacher/classes'){
    const d=await read(req),name=safe(d.name,70);if(name.length<2)bad('Nhập tên lớp học');let id=random(),code='L4'+random().slice(0,6).toUpperCase();sql.exec('INSERT INTO classes VALUES(?,?,?,?,?)',id,u.id,name,code,now());return json({id,name,code});
   }
   if(method==='GET'&&path==='/api/teacher/class'){
    let c=this.owned(url.searchParams.get('id'),u);
    let students=rows(sql,'SELECT id,code,name FROM students WHERE class_id=? ORDER BY code',c.id).map(s=>({...s,profile:this.studentProfile(s)}));
    let assignments=rows(sql,'SELECT id,title,created_at,question_ids FROM assignments WHERE class_id=? ORDER BY created_at DESC',c.id).map(a=>({...a,question_count:parse(a.question_ids).length||JSON.parse(a.question_ids).length}));
    return json({class:c,students,assignments});
   }
   if(method==='POST'&&path==='/api/teacher/students'){
    const d=await read(req),c=this.owned(d.class_id,u),arr=Array.isArray(d.students)?d.students:[];
    if(!arr.length||arr.length>100)bad('Hãy nhập từ 1 đến 100 học sinh/lần');let out=[];
    for(const x of arr){let code=safe(x.code,30).toUpperCase(),name=safe(x.name,100),pin=String(x.pin||'').trim();if(!code||!name)continue;
     if(first(sql,'SELECT id FROM students WHERE class_id=? AND code=?',c.id,code))continue;
     if(!/^\d{6}$/.test(pin))pin=String(100000+(crypto.getRandomValues(new Uint32Array(1))[0]%900000));let id=random();sql.exec('INSERT INTO students VALUES(?,?,?,?,?,?)',id,c.id,code,name,await password(pin),now());out.push({id,code,name,pin});
    }
    if(!out.length)bad('Không có học sinh mới. Kiểm tra mã HS trùng hoặc dữ liệu trống');return json({inserted:out,count:out.length,class_code:c.code});
   }
   if(method==='POST'&&path==='/api/teacher/grades'){
    let d=await read(req);let c=this.owned(d.class_id,u);let rec=Array.isArray(d.rows)?d.rows.slice(0,300):[];let count=0;for(const x of rec){const s=first(sql,'SELECT id FROM students WHERE class_id=? AND code=?',c.id,safe(x.code,30).toUpperCase());let score=Number(x.score),max=Number(x.max_score||10);if(!s||!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)continue;sql.exec('INSERT INTO grades VALUES(?,?,?,?,?,?)',random(),s.id,safe(d.label,70)||'Đợt đánh giá',score,max,now());count++;}return json({count});
   }
   if(method==='POST'&&path==='/api/teacher/assignments'){
    let d=await read(req),c=this.owned(d.class_id,u);let ids=[...new Set((d.question_ids||[]).map(Number))].filter(id=>QBYID.has(id)).slice(0,20);if(ids.length<3)bad('Chọn ít nhất 3 câu hỏi');let title=safe(d.title,90)||'Bài luyện Toán 4';let id=random();sql.exec('INSERT INTO assignments VALUES(?,?,?,?,?,?)',id,c.id,u.id,title,JSON.stringify(ids),now());return json({id,title,question_count:ids.length,class_code:c.code});
   }
   if(method==='GET'&&path==='/api/teacher/student'){
    let s=this.studentOwned(url.searchParams.get('id'),u);return json({student:{id:s.id,code:s.code,name:s.name},profile:this.studentProfile(s,true)});
   }
   if(method==='GET'&&path==='/api/teacher/report'){
    let c=this.owned(url.searchParams.get('class_id'),u);let students=rows(sql,'SELECT id,code,name FROM students WHERE class_id=? ORDER BY code',c.id);
    let data=students.map(s=>({...s,...this.studentProfile(s)}));return json({class:c,students:data});
   }
   if(method==='POST'&&path==='/api/teacher/notes'){
    let d=await read(req);let content=safe(d.content,12000);if(content.length<10)bad('Nội dung nhận xét quá ngắn');
    let c=null,sid=null;if(d.class_id)c=this.owned(d.class_id,u);if(d.student_id){let st=this.studentOwned(d.student_id,u);sid=st.id;if(c&&st.class_id!==c.id)bad('Học sinh không thuộc lớp đã chọn',403)}
    let id=random();sql.exec('INSERT INTO approved_notes VALUES(?,?,?,?,?,?,?)',id,u.id,c?.id||null,sid,safe(d.kind,25)||'Nhận xét',content,now());return json({id,saved:true});
   }
   if(method==='GET'&&path==='/api/teacher/notes'){
     let cls=url.searchParams.get('class_id');let result=cls?(this.owned(cls,u),rows(sql,'SELECT id,kind,content,created_at FROM approved_notes WHERE teacher_id=? AND class_id=? ORDER BY created_at DESC LIMIT 30',u.id,cls)):rows(sql,'SELECT id,kind,content,created_at FROM approved_notes WHERE teacher_id=? ORDER BY created_at DESC LIMIT 30',u.id);
     return json({notes:result});
   }
   if(method==='POST'&&path==='/api/teacher/seed'){
    const d=await read(req);const c=this.owned(d.class_id,u);let made=[];for(let i=1;i<=34;i++){let code='HS'+String(i).padStart(2,'0');if(first(sql,'SELECT id FROM students WHERE class_id=? AND code=?',c.id,code))continue;let pin=String(100000+i);let id=random();sql.exec('INSERT INTO students VALUES(?,?,?,?,?,?)',id,c.id,code,'Học sinh '+String(i).padStart(2,'0'),await password(pin),now());made.push({code,pin});}
    return json({count:made.length,accounts:made,note:'Hồ sơ giả định để kiểm tra phần mềm, không phải dữ liệu học tập thật.'});
   }
   if(method==='POST'&&path==='/api/ai/teacher'){
    const d=await read(req),type=safe(d.type,25);if(!['class','student','worksheet','test'].includes(type))bad('Tác vụ AI chưa được hỗ trợ');
    let prompt='';const guard='Bạn là trợ lý sư phạm Toán lớp 4 Việt Nam. Không bịa ra kết quả học tập. Hãy viết tiếng Việt rõ ràng, có cấu trúc, kiểm tra phép tính, phù hợp tiểu học. Luôn yêu cầu giáo viên rà soát trước khi sử dụng. Không suy đoán danh tính hoặc sức khỏe học sinh.';
    if(type==='class'){let c=this.owned(d.class_id,u);let report=rows(sql,`SELECT s.code, a.result FROM attempts a JOIN students s ON s.id=a.student_id WHERE s.class_id=? ORDER BY a.created_at DESC LIMIT 100`,c.id).map(a=>({code:a.code,score:parse(a.result).score,per:parse(a.result).per}));let grades=rows(sql,`SELECT s.code,g.label,g.score,g.max_score FROM grades g JOIN students s ON s.id=g.student_id WHERE s.class_id=? ORDER BY g.created_at DESC LIMIT 100`,c.id);prompt=`${guard}\nPhân tích lớp ${c.name} dựa trên dữ liệu ẩn danh: ${JSON.stringify({attempts:report,grades})}. Hãy xác định các kỹ năng cần củng cố (chỉ nếu có dữ liệu theo kỹ năng), chia nhóm ôn tập và đề xuất 3 hoạt động kèm cách đánh giá lại. Nếu thiếu dữ liệu, nêu rõ.`}
    if(type==='student'){let s=this.studentOwned(d.student_id,u);let p=this.studentProfile(s);prompt=`${guard}\nPhân tích hồ sơ ẩn danh ${s.code}. Dữ liệu: ${JSON.stringify({attempts:p.attempts.map(a=>({score:a.score,per:a.per,correct:a.correct,total:a.total})),grades:p.grades,weak:p.weak})}. Trình bày điểm mạnh, kỹ năng cần củng cố, 3 bài luyện vừa sức, cách giáo viên theo dõi. Không kết luận năng lực từ một lần kiểm tra.`}
    if(type==='worksheet'){let topic=safe(d.topic,60),level=safe(d.level,30),note=safe(d.note,250);prompt=`${guard}\nHãy tạo PHIẾU HỌC TẬP TOÁN 4 để in, chủ đề ${topic||'Phân số'}, mức độ ${level||'Củng cố'}, yêu cầu thêm ${note||'phù hợp chương trình Toán 4 Kết nối tri thức với cuộc sống'}. Gồm tiêu đề, chỗ ghi họ tên/lớp, 8 câu đa dạng với đáp án ở cuối và lời giải chính xác. Đây là bản nháp để giáo viên duyệt.`}
    if(type==='test')prompt=`${guard}\nChỉ trả lời ngắn gọn: Kết nối AI LearnPath với Gemini thành công.`;
    const key='t:'+u.id;let lim=first(sql,'SELECT total FROM ai_usage WHERE key=? AND day=?',key,day());if((lim?.total||0)>=30)bad('Đã đạt giới hạn 30 lượt AI của giáo viên hôm nay',429);sql.exec('INSERT INTO ai_usage(key,day,total) VALUES(?,?,1) ON CONFLICT(key,day) DO UPDATE SET total=total+1',key,day());return json({__ai_request:true,prompt});
   }
  }
  if(u.role==='student'){
   const s=first(sql,'SELECT * FROM students WHERE id=?',u.id),c=first(sql,'SELECT code,name FROM classes WHERE id=?',s.class_id);
   if(method==='GET'&&path==='/api/student/dashboard'){
    const as=rows(sql,'SELECT id,title,question_ids,created_at FROM assignments WHERE class_id=? ORDER BY created_at DESC',s.class_id).map(a=>({...a,questions_count:JSON.parse(a.question_ids).length,completed:!!first(sql,'SELECT id FROM attempts WHERE student_id=? AND assignment_id=?',s.id,a.id)}));
    return json({student:{code:s.code,name:s.name},class:c,assignments:as,history:this.studentHistory(s.id).slice(0,15),skills:SKILLS});
   }
   if(method==='GET'&&path==='/api/student/quiz'){
    let aid=url.searchParams.get('assignment_id');let title='Ôn tập cá nhân hóa',qs=[];
    if(aid){let a=first(sql,'SELECT * FROM assignments WHERE id=? AND class_id=?',aid,s.class_id);if(!a)bad('Bài tập không tồn tại',404);title=a.title;qs=JSON.parse(a.question_ids).map(id=>QBYID.get(id)).filter(Boolean)}
    else{qs=adaptive(QUESTIONS,this.studentHistory(s.id),8);}
    let quizId=null;
    if(!aid){quizId=random();sql.exec('INSERT INTO quiz_issues VALUES(?,?,?,?,NULL)',quizId,s.id,JSON.stringify(qs.map(q=>q.id)),Date.now()+2*3600*1000)}
    return json({title,assignment_id:aid||null,quiz_id:quizId,questions:publicQuestions(qs)});
   }
   if(method==='POST'&&path==='/api/student/submit'){
    const d=await read(req),aid=d.assignment_id||null;let qs=[];
    if(aid){const a=first(sql,'SELECT * FROM assignments WHERE id=? AND class_id=?',aid,s.class_id);if(!a)bad('Không tìm thấy bài được giao',404);qs=JSON.parse(a.question_ids).map(id=>QBYID.get(id)).filter(Boolean);if(first(sql,'SELECT id FROM attempts WHERE assignment_id=? AND student_id=?',aid,s.id))bad('Em đã nộp bài này. Vui lòng mở bài ôn tập cá nhân hóa.',409)}
    else{let issue=first(sql,'SELECT * FROM quiz_issues WHERE id=? AND student_id=?',safe(d.quiz_id,80),s.id);
     if(!issue||issue.used_at||issue.expires_at<Date.now())bad('Phiên ôn tập đã hết hạn hoặc đã nộp. Tạo bài luyện mới.',409);
     let ids=JSON.parse(issue.question_ids);qs=ids.map(id=>QBYID.get(id)).filter(Boolean);if(qs.length<3)bad('Bài ôn tập không hợp lệ')
    }
    const answers=d.answers&&typeof d.answers==='object'?d.answers:{};let result=grade(qs,answers);let id=random();sql.exec('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)',id,s.id,aid,aid?'Bài được giao':'Ôn tập cá nhân',JSON.stringify(answers),JSON.stringify(result),now());
    if(!aid)sql.exec('UPDATE quiz_issues SET used_at=? WHERE id=? AND student_id=?',now(),safe(d.quiz_id,80),s.id);
    return json({id,result,weak:weakSkills([result])});
   }
   if(method==='POST'&&path==='/api/ai/hint'){
    const d=await read(req),q=QBYID.get(Number(d.question_id));if(!q)bad('Không tìm thấy câu hỏi');let key='s:'+s.id;let lim=first(sql,'SELECT total FROM ai_usage WHERE key=? AND day=?',key,day());if((lim?.total||0)>=5)bad('Em đã dùng hết 5 lượt gợi ý AI hôm nay. Hãy xem gợi ý của bài hoặc hỏi giáo viên.',429);sql.exec('INSERT INTO ai_usage(key,day,total) VALUES(?,?,1) ON CONFLICT(key,day) DO UPDATE SET total=total+1',key,day());let prompt=`Bạn là gia sư Toán lớp 4, chỉ trả lời bằng tiếng Việt, vui vẻ và khích lệ. KHÔNG cho ngay đáp án hay chỉ ra chữ cái đáp án. Hãy đưa một gợi ý 2–4 câu để học sinh tự tìm lời giải. Câu hỏi: ${q.prompt}. Gợi ý chuẩn: ${q.hint}. Đừng hỏi thông tin cá nhân.`;return json({__ai_request:true,prompt});
   }
  }
  bad('Đường dẫn không tồn tại hoặc không có quyền truy cập',404);
 }
}

async function gemini(prompt,env){
 const model=env.GEMINI_MODEL||'gemini-2.5-flash';
 const ctl=new AbortController();let timeout=setTimeout(()=>ctl.abort(),22000);
 try{let r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
 method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.35,maxOutputTokens:1100}}),signal:ctl.signal});
 let v=await r.json().catch(()=>({}));if(!r.ok){let msg=v.error?.message||'Nhà cung cấp AI không phản hồi';return json({error:`Gemini ${r.status}: ${String(msg).slice(0,250)}`},r.status===429?429:502)}
 let text=v.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n')||'';return text?json({text,model,provider:'Gemini'}):json({error:'Gemini chưa tạo được nội dung. Thử lại sau.'},502)
 }catch(e){return json({error:e.name==='AbortError'?'Gemini phản hồi quá thời gian. Thử lại sau.':'Không kết nối được Gemini. Kiểm tra hạn mức và quyền của dự án.'},502)}finally{clearTimeout(timeout)}
}
export default {async fetch(request,env){try{
 const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(request.method!=='GET'){let origin=request.headers.get('origin');if(origin&&origin!==u.origin)return json({error:'Yêu cầu không cùng nguồn gốc'},403);if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Chỉ hỗ trợ JSON'},415)}
 if(u.pathname.startsWith('/api/ai/')&&!env.GEMINI_API_KEY)return json({error:'Máy chủ chưa được quản trị viên cấu hình GEMINI_API_KEY. Người dùng không cần tự nhập khóa.'},503);
 const headers=new Headers(request.headers);headers.delete('x-internal-setup');headers.delete('x-ai-available');headers.set('x-ai-available',env.GEMINI_API_KEY?'yes':'no');
 if(u.pathname==='/api/auth/register'&&request.method==='POST'){
  const payload=await request.clone().json().catch(()=>({}));if(!env.ADMIN_SETUP_CODE)return json({error:'Quản trị viên chưa đặt ADMIN_SETUP_CODE ở Cloudflare Secrets'},503);
  if(payload.setup_code&&payload.setup_code===env.ADMIN_SETUP_CODE)headers.set('x-internal-setup','yes');
 }
 const stub=env.LEARNPATH_DB.getByName('school');const forwarded=new Request(request,{headers});const response=await stub.fetch(forwarded);
 const ct=response.headers.get('content-type')||'';if(ct.includes('application/json')){const data=await response.clone().json().catch(()=>({}));if(data.__ai_request===true){return gemini(data.prompt,env)}}
 return response;
 }catch(e){return json({error:e.message||'Lỗi máy chủ'},500)}}};
