// Browser-only XLSX reader for simple student tables (OOXML). No external scripts or API needed.
const td=new TextDecoder('utf-8');
const u16=(v,p)=>v.getUint16(p,true),u32=(v,p)=>v.getUint32(p,true);
async function openZip(file){const buf=await file.arrayBuffer();const view=new DataView(buf);let end=-1;for(let p=buf.byteLength-22;p>=Math.max(0,buf.byteLength-66000);p--){if(u32(view,p)===0x06054b50){end=p;break}}
if(end<0)throw Error('Không phải tệp Excel .xlsx hợp lệ');let n=u16(view,end+10),offset=u32(view,end+16);const out=new Map();
for(let i=0;i<n;i++){if(u32(view,offset)!==0x02014b50)throw Error('Cấu trúc ZIP Excel không hợp lệ');const method=u16(view,offset+10),size=u32(view,offset+20),nameLen=u16(view,offset+28),extra=u16(view,offset+30),comment=u16(view,offset+32),local=u32(view,offset+42);const filename=td.decode(new Uint8Array(buf,offset+46,nameLen));offset+=46+nameLen+extra+comment;
if(!filename.startsWith('xl/')||!(/(^xl\/sharedStrings\.xml$)|(^xl\/worksheets\/sheet\d+\.xml$)/.test(filename)))continue;
if(u32(view,local)!==0x04034b50)throw Error('Tệp Excel hỏng');const start=local+30+u16(view,local+26)+u16(view,local+28);if(size>15000000)throw Error('Tệp Excel quá lớn');const bytes=new Uint8Array(buf.slice(start,start+size));let contents;
if(method===0)contents=bytes;else if(method===8){if(typeof DecompressionStream==='undefined')throw Error('Vui lòng sử dụng Chrome hoặc Edge phiên bản mới để nhập Excel');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));contents=new Uint8Array(await new Response(stream).arrayBuffer())}else throw Error('Kiểu nén Excel không được hỗ trợ');out.set(filename,td.decode(contents))}
return out}
function parseXML(text){let d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('Không đọc được cấu trúc Excel');return d}
function nodes(el,name){return [...el.getElementsByTagName(name)]}
function colNumber(ref){let a=(ref||'').match(/^[A-Z]+/)?.[0]||'';let n=0;for(let c of a)n=n*26+c.charCodeAt(0)-64;return n-1}
export default async function readXlsxFile(file){let zip=await openZip(file);let sheets=[...zip.keys()].filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort((a,b)=>Number(a.match(/(\d+)\.xml/)[1])-Number(b.match(/(\d+)\.xml/)[1]));if(!sheets.length)throw Error('Không tìm thấy trang tính Excel');let strings=[];
if(zip.has('xl/sharedStrings.xml')){let doc=parseXML(zip.get('xl/sharedStrings.xml'));strings=nodes(doc,'si').map(si=>nodes(si,'t').map(t=>t.textContent).join(''))}
const xml=parseXML(zip.get(sheets[0]));let rows=[];for(const r of nodes(xml,'row')){let arr=[];for(const c of nodes(r,'c')){let p=colNumber(c.getAttribute('r'));if(p<0||p>100)continue;let type=c.getAttribute('t');let val=nodes(c,'v')[0]?.textContent??'';
if(type==='s')val=strings[Number(val)]??'';else if(type==='inlineStr')val=nodes(c,'t').map(n=>n.textContent).join('');arr[p]=val}
rows.push(Array.from({length:arr.length},(_,i)=>arr[i]??''))}
return rows}
export function readCSV(text){let rows=[],row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value=''}else value+=c}row.push(value);if(row.some(x=>x.trim()))rows.push(row);return rows}
