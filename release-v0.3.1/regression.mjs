import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const root=new URL('../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8');let passed=[];
function ok(name){passed.push(name)}
const raw=read('Index.html'),html=raw.replace('/* DOMAIN_MODULE */',read('client-domain.js')).replace('/* SYNC_MODULE */',read('client-sync.js'));
const manifest=JSON.parse(read('appsscript.json')),pkg=JSON.parse(read('package.json'));assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');assert.equal(manifest.webapp.access,'MYSELF');assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive'));assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/documents'));ok('Private per-copy deployment manifest remains fail-closed and declares report scopes');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);new vm.Script(read('Kode.gs'));ok('Source and generated bundle syntax');
const buildSource=read('build.mjs');assert.ok(buildSource.includes('Build: deterministic from checked-in sources'));assert.ok(!buildSource.includes('new Date()'));ok('Generated Apps Script bundle is reproducible and contains no volatile build timestamp');
for(const id of ['reportView','wfhWorkspace','wfhProfileDetails','profileView','profileForm','wfhSelectionPane','previewWfhBtn','reportWrap','reportPreviewDialog','reportPreviewPaper'])assert.equal((raw.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' must be unique');
assert.ok(raw.indexOf('id="reportView"')<raw.indexOf('id="wfhWorkspace"'));
assert.ok(raw.indexOf('id="wfhWorkspace"')<raw.indexOf('id="profileView"'));
assert.ok(raw.indexOf('id="profileView"')<raw.indexOf('id="wfhSelectionPane"'));
assert.ok(raw.indexOf('id="previewWfhBtn"')<raw.indexOf('id="reportWrap"'));
assert.match(raw,/<section id="reportPreviewDialog"[^>]*role="tabpanel"[^>]*hidden>/);
assert.doesNotMatch(raw,/<dialog id="reportPreviewDialog"/);
assert.match(raw,/#reportView\[data-wfh-pane="selection"\] #reportPreviewDialog/);
assert.match(raw,/body\.printing-report \.report-paper table\{display:table!important/);
assert.match(raw,/<div id="batchBar"[^>]*hidden>/);
ok('WFH layout keeps profile inline, action above table, nonmodal preview, mobile/print gates, and idle batch bar hidden');
let grid=[],held=false,lockAcquires=0,capacity=1000,reads=0,opened=[],auxSheets=new Map(),templateBook=null,templateShared=false,templateTrashed=false,authorizationRequired=false,driveCreates=0,driveCreateFailures=0,driveCreateHook=null,driveBeforeCreateHook=null;const driveFolders=new Map(),driveFiles=new Map();let config=JSON.stringify({scriptId:'script-copy-A',spreadsheetId:'copy-A'}),publicTemplate=null;
const iterator=items=>{let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]}};
function makeDriveFile(id,name){return {getId:()=>id,getName:()=>name,getUrl:()=>`https://drive.google.com/file/d/${id}/view`};}
function makeDriveFolder(id,name){const files=[];const folder={getId:()=>id,getName:()=>name,isTrashed:()=>false,getFilesByName:value=>iterator(files.filter(f=>f.getName()===value)),createFile:blob=>{if(driveCreateFailures>0){driveCreateFailures--;throw Error('simulated storage failure')}if(driveBeforeCreateHook){const hook=driveBeforeCreateHook;driveBeforeCreateHook=null;hook()}const file=makeDriveFile('file-'+(++driveCreates),blob.name);files.push(file);driveFiles.set(file.getId(),file);if(driveCreateHook){const hook=driveCreateHook;driveCreateHook=null;hook(file)}return file}};Object.defineProperty(folder,'_files',{value:files});return folder;}
function makeAuxSheet(name){
  let sheetName=name;
  const rows=[];
  const aux={getName:()=>sheetName,setName:value=>{sheetName=value;return aux},isSheetHidden:()=>false,getLastRow:()=>rows.length,getMaxRows:()=>Math.max(1000,rows.length),getMaxColumns:()=>Math.max(26,rows[0]?.length||0),setFrozenRows(){},setColumnWidths(){},setColumnWidth(){},getRange(row,col,n,m){
    const range={getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[row-1+i]?.[col-1+j]??''))},getNotes(){return Array.from({length:n},()=>Array(m).fill(''))},setValues(values){values.forEach((a,i)=>{rows[row-1+i]??=[];a.forEach((v,j)=>rows[row-1+i][col-1+j]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v)});return range;}};
    ['setBackground','setFontColor','setFontWeight','setNumberFormat','setWrap','setVerticalAlignment'].forEach(k=>range[k]=()=>range);return range;
  }};
  Object.defineProperty(aux,'_rows',{value:rows});return aux;
}
const book={getSheetByName:name=>name==='Catatan Harian'?sh:auxSheets.get(name)||null,insertSheet:name=>{const next=makeAuxSheet(name);auxSheets.set(name,next);return next},deleteSheet:sheet=>auxSheets.delete(sheet.getName()),getSheets:()=>[sh,...auxSheets.values()],getNamedRanges:()=>[],getId:()=> 'copy-A',getUrl:()=> 'https://docs.google.com/spreadsheets/d/copy-A/edit',getSpreadsheetTimeZone:()=> 'Asia/Jakarta'};
const sh={getParent:()=>book,getMaxRows:()=>capacity,insertRowsAfter:(n,k)=>capacity+=k,getLastRow:()=>grid.length,getRange(row,col,n,m){const range={getValues(){reads++;return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>grid[row-1+i]?.[col-1+j]??''))},setValues(values){values.forEach((a,i)=>{grid[row-1+i]??=[];a.forEach((v,j)=>grid[row-1+i][col-1+j]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v)});return range;}};['setBackground','setFontColor','setFontWeight','setNumberFormat','setWrap','setVerticalAlignment'].forEach(k=>range[k]=()=>range);return range;}};
const scriptProps=new Map();
const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>book,openById:id=>{opened.push(id);if(id==='copy-A')return book;if(templateBook&&id===templateBook.getId())return templateBook;throw Error('unknown sheet')},create:()=>{const sheet=makeAuxSheet('Sheet1');templateBook={getId:()=> 'template-clean',getSheets:()=>[sheet],getNamedRanges:()=>[],setSpreadsheetTimeZone(){},getSpreadsheetTimeZone:()=> 'Asia/Jakarta'};return templateBook},flush(){}},DriveApp:{Access:{ANYONE_WITH_LINK:'link'},Permission:{VIEW:'view'},getFileById:id=>{if(id==='template-clean')return {setSharing:(access,permission)=>{assert.equal(access,'link');assert.equal(permission,'view');templateShared=true},setTrashed:value=>{templateTrashed=value}};const file=driveFiles.get(id);if(!file)throw Error('missing file');return file},getFolderById:id=>{const folder=driveFolders.get(id);if(!folder)throw Error('missing folder');return folder},getFoldersByName:name=>iterator([...driveFolders.values()].filter(f=>f.getName()===name)),createFolder:name=>{const folder=makeDriveFolder('folder-'+(driveFolders.size+1),name);driveFolders.set(folder.getId(),folder);return folder}},ScriptApp:{getScriptId:()=> 'script-copy-A',AuthMode:{FULL:'full'},AuthorizationStatus:{REQUIRED:'required'},getAuthorizationInfo:()=>({getAuthorizationStatus:()=>authorizationRequired?'required':'authorized',getAuthorizationUrl:()=>authorizationRequired?'https://accounts.google.com/o/oauth2/auth?fixture=drive':''})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='INSTALLATION'?config:k==='PUBLIC_TEMPLATE_SPREADSHEET_ID'?publicTemplate:(scriptProps.get(k)||''),setProperty:(k,v)=>{if(k==='INSTALLATION')config=v;else if(k==='PUBLIC_TEMPLATE_SPREADSHEET_ID')publicTemplate=v;else scriptProps.set(k,v)}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,bytes)=>[...crypto.createHash(algorithm).update(Buffer.from(bytes.map(value=>(Number(value)+256)%256))).digest()],getUuid:()=>crypto.randomUUID(),formatDate:(date,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date),base64Decode:value=>[...Buffer.from(value,'base64')],newBlob:(bytes,mime,name)=>({bytes,mime,name})},LockService:{getScriptLock:()=>({tryLock:()=>{assert.equal(held,false);held=true;lockAcquires++;return true},releaseLock(){held=false}})}});
vm.runInContext(read('Server.gs'),ctx);grid=[vm.runInContext('HEADERS.slice()',ctx)];
assert.equal(ctx.getDriveAuthorizationStatus().authorized,true);authorizationRequired=true;const authGate=ctx.getDriveAuthorizationStatus();assert.equal(authGate.authorized,false);assert.match(authGate.authorizationUrl,/accounts\.google\.com/);authorizationRequired=false;ok('Drive authorization endpoint distinguishes granted and required consent states');
config=null;assert.throws(()=>ctx.book_(),/SETUP/);assert.equal(opened.length,0);config=JSON.stringify({scriptId:'original',spreadsheetId:'original'});assert.throws(()=>ctx.book_(),/SETUP/);assert.equal(opened.length,0);ctx.setupInstallation();ctx.book_();assert.equal(opened.at(-1),'copy-A');ok('Missing/copied installation fails closed; setup binds only current copy');
const sideNames=vm.runInContext('Object.keys(AUX_SCHEMAS)',ctx),coreHeaderBefore=JSON.stringify(grid[0]);
assert.equal(auxSheets.size,sideNames.length);assert.deepEqual(auxSheets.get('SchemaMigrations')._rows[1].slice(0,2),['schema-1','1']);
auxSheets.get('Profile').getRange(2,1,1,4).setValues([['fullName','Synthetic User','2026-09-10T00:00:00Z','1']]);
const rerun=ctx.migrateInstallationSchema();assert.equal(rerun.created.length,0);assert.equal(auxSheets.get('SchemaMigrations')._rows.length,2);assert.equal(auxSheets.get('Profile')._rows[1][1],'Synthetic User');assert.equal(JSON.stringify(grid[0]),coreHeaderBefore);
auxSheets.delete('Profile');const autoProfile=ctx.getProfile();assert.equal(autoProfile.version,0);assert.equal(auxSheets.has('Profile'),true);ctx.saveProfile({version:0,fullName:'Synthetic User'});
ok('Schema v1 fresh install and rerun are idempotent and preserve core/profile data');
auxSheets.delete('ActivityMeta');const projects=auxSheets.get('Projects'),projectHeader=projects._rows[0].slice();projects._rows[0][0]='BrokenID';
assert.throws(()=>ctx.migrateInstallationSchema(),/Projects: header tidak sesuai/);assert.equal(auxSheets.has('ActivityMeta'),false);projects._rows[0]=projectHeader;
const originalInsert=book.insertSheet;auxSheets.delete('Reminders');let migrationInserts=0;book.insertSheet=name=>{migrationInserts++;if(migrationInserts===2)throw Error('simulated insert failure');return originalInsert(name)};
assert.throws(()=>ctx.migrateInstallationSchema(),/tab baru telah dibatalkan/);assert.equal(auxSheets.has('ActivityMeta'),false);assert.equal(auxSheets.has('Reminders'),false);book.insertSheet=originalInsert;
const recovered=ctx.migrateInstallationSchema();assert.equal([...recovered.created].sort().join(','),'ActivityMeta,Reminders');assert.equal(auxSheets.size,sideNames.length);assert.equal(JSON.stringify(grid[0]),coreHeaderBefore);
ok('Schema preflight blocks unsafe writes; partial creation rolls back and recovers cleanly');
let profile=ctx.getProfile();assert.equal(profile.version,1);assert.equal(profile.values.fullName,'Synthetic User');
profile=ctx.saveProfile({version:1,fullName:'ASN Sintetis',employeeId:'000000',position:'Analis',unit:'Unit Uji',timeZone:'Asia/Jakarta',reportMode:'WFH',pageSize:'Letter'});assert.equal(profile.version,2);assert.equal(profile.values.fullName,'ASN Sintetis');
assert.throws(()=>ctx.saveProfile({version:1,fullName:'stale'}),/sesi lain/);assert.throws(()=>ctx.saveProfile({version:2,timeZone:'UTC'}),/Zona waktu/);assert.throws(()=>ctx.saveProfile({version:2,reportMode:'OFFICE'}),/Mode laporan/);
profile=ctx.saveProfile({version:2,fullName:'=FORMULA',timeZone:'Asia/Jakarta',reportMode:'WFH',pageSize:'A4'});assert.equal(profile.values.fullName,'=FORMULA');
profile=ctx.deleteProfile(3);assert.equal(profile.version,4);assert.equal(profile.values.fullName,'');ok('Private profile CRUD validates enums, resists stale writes, and stores literal text');
function isolatedInstall(scriptId,spreadsheetId){
  const openedIds=[];
  const installation=JSON.stringify({scriptId,spreadsheetId});
  const isolatedBook={getId:()=>spreadsheetId};
  const isolated=vm.createContext({
    SpreadsheetApp:{openById:id=>{openedIds.push(id);if(id!==spreadsheetId)throw Error('cross-install access');return isolatedBook}},
    ScriptApp:{getScriptId:()=>scriptId},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='INSTALLATION'?installation:null})}
  });
  vm.runInContext(read('Server.gs'),isolated);
  return {isolated,openedIds};
}
const installA=isolatedInstall('script-owner-A','sheet-owner-A'),installB=isolatedInstall('script-owner-B','sheet-owner-B');
assert.equal(installA.isolated.book_().getId(),'sheet-owner-A');assert.deepEqual(installA.openedIds,['sheet-owner-A']);
assert.equal(installB.isolated.book_().getId(),'sheet-owner-B');assert.deepEqual(installB.openedIds,['sheet-owner-B']);
vm.runInContext("PropertiesService={getScriptProperties:()=>({getProperty:()=>JSON.stringify({scriptId:'script-owner-B',spreadsheetId:'sheet-owner-B'})})}",installA.isolated);
assert.throws(()=>installA.isolated.book_(),/SETUP/);assert.deepEqual(installA.openedIds,['sheet-owner-A']);
ok('Two simulated installations keep Script Properties and spreadsheet access isolated');
const base={id:'test-0001',date:'2026-09-09',activity:'Test',result:'Actual output',evidence:'',status:'Berjalan',followup:'',version:0};
let saved=ctx.saveRecord(base);assert.equal(saved.version,1);assert.equal(ctx.saveRecord(base).version,1);assert.equal(grid.length,2);ok('Stable-ID retry does not duplicate');
profile=ctx.saveProfile({version:4,fullName:'ASN Sintetis',employeeId:'000000',position:'Analis',unit:'Unit Uji',timeZone:'Asia/Jakarta',reportMode:'WFH',pageSize:'Letter'});
const reportSnapshot=ctx.createReportSnapshot({start:'2026-09-01',end:'2026-09-30',recordIds:[base.id],profileVersion:profile.version});assert.equal(reportSnapshot.kind,'WFH');assert.equal(reportSnapshot.rows.length,1);assert.equal(reportSnapshot.rows[0].version,1);
const previewed=ctx.confirmReportPreview(reportSnapshot.reportId,1);assert.equal(previewed.state,'previewed');assert.equal(previewed.revision,2);
const staleSnapshot=ctx.createReportSnapshot({start:'2026-09-01',end:'2026-09-30',recordIds:[base.id],profileVersion:profile.version});profile=ctx.saveProfile({version:profile.version,fullName:'ASN Sintetis',position:'Analis Senior',unit:'Unit Uji',timeZone:'Asia/Jakarta',reportMode:'WFH',pageSize:'Letter'});assert.throws(()=>ctx.confirmReportPreview(staleSnapshot.reportId,1),/Profil berubah/);ok('WFH report snapshot freezes profile and activity revisions before preview confirmation');
const exportSnapshot=ctx.createReportSnapshot({start:'2026-09-01',end:'2026-09-30',recordIds:[base.id],profileVersion:profile.version});const exportPreview=ctx.confirmReportPreview(exportSnapshot.reportId,1);let exportBuilds=0;ctx.createReportFiles_=()=>{exportBuilds++;return {documentId:'doc-fixture-1',pdfId:'pdf-fixture-1'}};const exportResult=ctx.exportWfhReport(exportSnapshot.reportId,exportPreview.revision);assert.equal(exportResult.state,'exported');assert.equal(exportResult.revision,4);assert.match(exportResult.docxUrl,/format=docx/);assert.match(exportResult.pdfUrl,/pdf-fixture-1/);const exportRetry=ctx.exportWfhReport(exportSnapshot.reportId,exportPreview.revision);assert.equal(exportRetry.documentId,'doc-fixture-1');assert.equal(exportBuilds,1);ok('WFH export is reserved outside long file work and response-loss retry returns the same Drive files');
const validPdfBytes=[...Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.alloc(140,1)])],validPdfFile={getSize:()=>validPdfBytes.length,getBlob:()=>({getContentType:()=>'application/pdf',getBytes:()=>validPdfBytes})},pdfValidation=ctx.validatePdfFile_(validPdfFile);assert.equal(pdfValidation.verified,true);assert.equal(pdfValidation.signature,'%PDF-');assert.equal(pdfValidation.sizeBytes,validPdfBytes.length);assert.match(pdfValidation.sha256,/^[a-f0-9]{64}$/);assert.throws(()=>ctx.validatePdfFile_({getSize:()=>200,getBlob:()=>({getContentType:()=>'application/pdf',getBytes:()=>[1,2,3,4,5,...Array(195).fill(0)]})}),/%PDF-/);assert.throws(()=>ctx.validatePdfFile_({getSize:()=>200,getBlob:()=>({getContentType:()=>'text\/plain',getBytes:()=>validPdfBytes})}),/MIME/);ok('Server verifies exported PDF MIME, signature, minimum size, and SHA-256 before committing export metadata');
const failedSnapshot=ctx.createReportSnapshot({start:'2026-09-01',end:'2026-09-30',recordIds:[base.id],profileVersion:profile.version});const failedPreview=ctx.confirmReportPreview(failedSnapshot.reportId,1);ctx.createReportFiles_=()=>{throw Error('simulated Drive failure')};assert.throws(()=>ctx.exportWfhReport(failedSnapshot.reportId,failedPreview.revision),/Google Docs\/PDF gagal dibuat/);const failedEntry=auxSheets.get('ReportExports')._rows.find(row=>row[0]===failedSnapshot.reportId);assert.equal(failedEntry[6],'previewed');assert.equal(Number(failedEntry[10]),failedPreview.revision);ok('Failed Drive export rolls its reservation back to the confirmed preview revision');
const second={...base,id:'test-0002',date:'2026-10-01',activity:'=1+1'};grid.push(Array(10).fill(''));ctx.saveRecord(second);ctx.saveRecord({...second,activity:"'literal",version:1});assert.equal(grid[3][2],"'literal");assert.equal(grid[2][0],'');ok('Literal input and physical rows after blanks');
ctx.saveRecord({...base,status:'Selesai',version:1});assert.throws(()=>ctx.saveRecord({...base,result:'stale',version:1}),/sesi lain/);assert.equal(held,false);ok('Two-client stale revision rejected; lock released');
for(const date of ['2026-02-30','2026-13-01','bad'])assert.throws(()=>ctx.saveRecord({...base,date}));assert.throws(()=>ctx.saveRecord({...base,activity:' '}));assert.throws(()=>ctx.saveRecord({...base,status:'invalid'}));assert.throws(()=>ctx.getRecords('2026-10-01','2026-09-01'));ok('Date, required, status, and reversed range validation');
grid.push([...grid[1]]);assert.throws(()=>ctx.getRecords('2026-01-01','2026-12-31'),/duplikat/);grid.pop();grid[0][2]='bad';assert.throws(()=>ctx.saveRecord(base),/Kolom/);grid[0][2]='Kegiatan';ok('Duplicate ID and broken schema rejected');
reads=0;ctx.saveRecord({...base,version:2,result:'new output'});assert.equal(reads,3);ok('Save uses header + one full read + readback, no second ID scan');
const preserved=grid;grid=[grid[0],...Array.from({length:10000},(_,i)=>['bulk-'+i,'2026-09-09','a','b','','Berjalan','','2026-09-09T00:00:00Z','2026-09-09T00:00:00Z','1'])];reads=0;const locksBeforeRead=lockAcquires;assert.equal(ctx.getRecords('2026-09-01','2026-09-30').length,10000);assert.equal(reads,2);assert.equal(lockAcquires,locksBeforeRead);assert.equal(ctx.getSnapshot('2026-09-01','2026-09-30').records.length,10000);assert.equal(lockAcquires,locksBeforeRead);grid=preserved;ok('10k read endpoints use bounded service reads without holding ScriptLock (mock, cloud latency separate)');
const pdfBytes=Buffer.from('%PDF-1.4 synthetic fixture'),pdfBase64=pdfBytes.toString('base64');let attachRecord=ctx.getRecord(base.id);const uploadInput={activityId:base.id,activityRevision:attachRecord.version,uploadSessionId:'upload-session-0001',name:'bukti.pdf',mimeType:'application/pdf',sizeBytes:pdfBytes.length,dataBase64:pdfBase64};const linked=ctx.uploadAttachment(uploadInput);assert.equal(linked.attachment.state,'linked');assert.match(linked.record.evidence,/drive\.google\.com/);assert.equal(ctx.getAttachments(base.id).length,1);const createsAfterFirst=driveCreates;const linkedRetry=ctx.uploadAttachment(uploadInput);assert.equal(linkedRetry.attachment.fileId,linked.attachment.fileId);assert.equal(driveCreates,createsAfterFirst);ok('Attachment upload reserves a stable operation, links one private Drive URL, and deduplicates response-loss retry');
const detached=ctx.detachAttachment(linked.attachment.attachmentId,linked.attachment.revision,linked.record.version);assert.equal(detached.attachment.state,'detached');assert.equal(detached.record.evidence.includes(linked.attachment.url),false);assert.equal(driveFiles.has(linked.attachment.fileId),true);ok('Detaching removes only the evidence link and metadata state; the Drive file is retained');
attachRecord=ctx.getRecord(base.id);const overlapInput={...uploadInput,activityRevision:attachRecord.version,uploadSessionId:'upload-session-overlap',name:'overlap.pdf'};const beforeOverlap=driveCreates;driveBeforeCreateHook=()=>{assert.throws(()=>ctx.uploadAttachment(overlapInput),/BUSY_UPLOAD/);const pending=ctx.recoverAttachment(overlapInput.uploadSessionId,attachRecord.version);assert.equal(pending.attachment.state,'uploading');assert.equal(pending.recovered,false)};const overlap=ctx.uploadAttachment(overlapInput);assert.equal(overlap.attachment.state,'linked');assert.equal(driveCreates,beforeOverlap+1);ok('Overlapping upload requests with the same session cannot create duplicate Drive files');
attachRecord=ctx.getRecord(base.id);driveCreateFailures=1;const retryInput={...uploadInput,activityRevision:attachRecord.version,uploadSessionId:'upload-session-0002',name:'retry.pdf'};assert.throws(()=>ctx.uploadAttachment(retryInput),/simulated storage failure/);assert.equal(ctx.getAttachments(base.id).find(a=>a.uploadSessionId===retryInput.uploadSessionId).state,'failed');const recoveredRetry=ctx.uploadAttachment(retryInput);assert.equal(recoveredRetry.attachment.state,'linked');ok('Storage failure records a retryable failed checkpoint and a same-operation retry creates one linked file');
attachRecord=ctx.getRecord(base.id);const conflictInput={...uploadInput,activityRevision:attachRecord.version,uploadSessionId:'upload-session-0003',name:'conflict.pdf'};driveCreateHook=()=>ctx.saveRecord({...ctx.getRecord(base.id),followup:'concurrent update'});assert.throws(()=>ctx.uploadAttachment(conflictInput),/CONFLICT_UPLOAD/);const uploadedCheckpoint=ctx.getAttachments(base.id).find(a=>a.uploadSessionId===conflictInput.uploadSessionId);assert.equal(uploadedCheckpoint.state,'uploaded');const afterConcurrent=ctx.getRecord(base.id),recoveredConflict=ctx.recoverAttachment(conflictInput.uploadSessionId,afterConcurrent.version);assert.equal(recoveredConflict.recovered,true);assert.equal(recoveredConflict.attachment.state,'linked');assert.equal(driveCreates,createsAfterFirst+3);ok('Cross-device revision conflict preserves an uploaded checkpoint and recovery reuses the existing Drive file');
attachRecord=ctx.getRecord(base.id);const badBytes=Buffer.from('not a pdf');assert.throws(()=>ctx.uploadAttachment({...uploadInput,activityRevision:attachRecord.version,uploadSessionId:'upload-session-0004',name:'fake.pdf',sizeBytes:badBytes.length,dataBase64:badBytes.toString('base64')}),/Isi file tidak cocok/);assert.throws(()=>ctx.uploadAttachment({...uploadInput,activityRevision:attachRecord.version,uploadSessionId:'upload-session-0005',name:'malware.exe'}),/Format harus/);ok('Attachment validation rejects spoofed file signatures, unsupported extensions, and invalid payloads before linking');
const dc=vm.createContext({Intl,Date});vm.runInContext(read('client-domain.js')+';this.D=Domain;',dc);const D=dc.D;
assert.deepEqual([...D.week('2026-08-02')],['2026-07-27','2026-08-02']);assert.deepEqual([...D.week('2027-01-01')],['2026-12-28','2027-01-03']);assert.equal(D.addDays('2028-02-28',1),'2028-02-29');assert.equal(D.addDays('2028-02-29',1),'2028-03-01');assert.equal(D.streak(['2026-02-28','2026-03-01'],'2026-03-01'),2);assert.equal(D.streak(['2026-02-28'],'2026-03-01'),1);assert.equal(D.streak(['2026-02-27'],'2026-03-02'),0);
const instant=new Date('2026-09-09T16:30:00Z');assert.equal(D.ymd(instant,'Asia/Jakarta'),'2026-09-09');assert.equal(D.ymd(instant,'Asia/Makassar'),'2026-09-10');assert.equal(D.ymd(instant,'Asia/Jayapura'),'2026-09-10');ok('Leap/year/month/week boundaries, grace day, WIB/WITA/WIT');
assert.doesNotThrow(()=>[{date:'2026-09-09'},{date:'2026-09-09'}].sort(D.recent));ok('Sorter tolerates pending metadata');
class El{constructor(id=''){this.id=id;this.value='';this.hidden=false;this.open=false;this.textContent='';this.children=[];this.disabled=false;this.style={};this.attrs={};this.listeners={};this.classList={add(){},remove(){},toggle(){}};this.parentElement={setAttribute(){}};this.elements=[];}append(...xs){this.children.push(...xs)}replaceChildren(...xs){this.children=xs}setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}addEventListener(k,v){this.listeners[k]=v}focus(){}select(){}showModal(){this.open=true}close(){this.open=false}reset(){}querySelector(){return this.children.find(x=>x.tag==='button')}click(){return this.onclick?.()}}
const els=new Map();const $=id=>{if(!els.has(id))els.set(id,new El(id));return els.get(id)};const listeners={};let rpc=[];
const fc=vm.createContext({console,document:{getElementById:$,createElement:tag=>Object.assign(new El(),{tag}),activeElement:{tagName:'BODY'},body:new El('body'),addEventListener(){}},window:{addEventListener:(k,fn)=>listeners[k]=fn,scrollTo(){}},crypto:{randomUUID:()=>crypto.randomUUID()},Intl,Date,Math,setTimeout:fn=>{queueMicrotask(fn);return 1},clearTimeout(){},setInterval(){},navigator:{clipboard:{writeText:async()=>{throw Error('denied')}}},localStorage:{getItem:()=> '[]'},URL,Blob});
// Register actual app handlers, but do not run boot I/O/timers.
vm.runInContext(script.slice(0,script.indexOf("document.addEventListener('visibilitychange'")),fc);
vm.runInContext("let readAttempts=0;call=async()=>{readAttempts++;if(readAttempts<3)throw Error('BUSY: test');return 'ok'};this.readResult=readWithRetry('getSnapshot');this.readAttempts=()=>readAttempts",fc);assert.equal(await fc.readResult,'ok');assert.equal(fc.readAttempts(),3);ok('Transient reads retry outside the server lock');
fc.rpc=(name,...args)=>new Promise((resolve,reject)=>rpc.push({name,args:JSON.parse(JSON.stringify(args)),resolve,reject}));
vm.runInContext("call=(name,...args)=>rpc(name,...args);render=()=>{};dataReady=true;",fc);
let record=ctx.getRecord(base.id);fc.input={...record,status:'Berjalan'};
let promise=vm.runInContext('persistRecord(input)',fc);if(!rpc[0])await promise;assert.equal(rpc[0].name,'saveRecord');const committed=ctx.saveRecord(rpc[0].args[0]);rpc[0].reject(Error('Response lost'));await new Promise(setImmediate);assert.equal(rpc[1].name,'getRecord');rpc[1].resolve(ctx.getRecord(base.id));const confirmed=await promise;assert.equal(confirmed.version,committed.version);assert.equal(confirmed.status,'Berjalan');ok('Commit-response loss reconciles canonical record without false rollback');
rpc=[];fc.input={...confirmed,status:'Selesai'};promise=vm.runInContext('persistRecord(input)',fc);await assert.rejects(vm.runInContext('persistRecord(input)',fc),/berlangsung/);rpc[0].resolve(ctx.saveRecord(rpc[0].args[0]));await promise;ok('Shared mutation gate blocks duplicate/concurrent in-page writes');
vm.runInContext("monthCache.set('2026-09',[{date:'2026-09-09'}]);records=[{date:'2026-10-01'}]",fc);rpc=[];fc.input={...ctx.getRecord(base.id),status:'Berjalan'};promise=vm.runInContext('persistRecord(input)',fc);rpc[0].resolve(ctx.saveRecord(rpc[0].args[0]));await promise;assert.equal(vm.runInContext('monthCache.size',fc),0);ok('Mutation invalidates cache; cannot insert records of another month');
vm.runInContext("selected='2026-08-10';today='2026-09-09';openQuickAdd(today)",fc);assert.equal($('quickAddDate').value,'2026-09-09');ok('Focus Quick Add honors explicit today');
assert.ok(raw.includes('id="offlineBanner"'));assert.ok(raw.includes('updateOnlineStatus'));listeners.offline && listeners.offline();assert.equal(vm.runInContext("isOnline",fc),false);assert.equal(vm.runInContext("$('offlineBanner').hidden",fc),false);await assert.rejects(vm.runInContext("persistRecord(input)",fc),/OFFLINE/);listeners.online && listeners.online();assert.equal(vm.runInContext("isOnline",fc),true);assert.equal(vm.runInContext("$('offlineBanner').hidden",fc),true);ok('Offline detection fails fast, shows offline banner, and auto-reconnects on online (BUG-PWA-01)');
vm.runInContext("reportRows=[];reportRange={start:'2026-09-01',end:'2026-09-30'};applyReportFilter()",fc);assert.match($('reportHint').textContent,/0 kegiatan/);ok('Empty report exits loading state');
vm.runInContext("reportRows=[{date:'2026-09-09',activity:'a',result:'b',status:'Selesai'}];",fc);$('reportStatusFilter').value='pending';vm.runInContext('applyReportFilter()',fc);assert.equal($('copy').disabled,true);assert.equal($('csv').disabled,true);ok('Empty filter disables report exports');
vm.runInContext("reportRows=[{id:'wfh-1',date:'2026-09-09',activity:'<img src=x onerror=alert(1)>',result:'Hasil nyata',evidence:'https://drive.google.com/example',status:'Selesai',followup:'Tindak lanjut'}];reportRange={start:'2026-09-01',end:'2026-09-30'};reportSelectedIds.clear();reportStatusFilter='all';applyReportFilter()",fc);assert.equal($('previewWfhBtn').disabled,true);vm.runInContext("reportSelectedIds.add('wfh-1');applyReportFilter()",fc);assert.equal($('previewWfhBtn').disabled,false);
{assert.ok(raw.includes('id="reportWrap"'));assert.ok(raw.includes('id="previewWfhBtn"'));assert.match($('reportSelectionSummary').textContent,/1 kegiatan dipilih/);$('reportStatusFilter').value='pending';vm.runInContext('applyReportFilter()',fc);assert.match($('reportSelectionSummary').textContent,/1 di luar filter/);assert.equal($('previewWfhBtn').disabled,false);$('reportStatusFilter').value='all';vm.runInContext('applyReportFilter()',fc);ok('WFH selection controls preview availability and keeps hidden selections explicit');}
vm.runInContext("renderReportPreview({profile:{fullName:'ASN <script>uji</script>',employeeId:'000000',rankGrade:'Penata',position:'Analis',unit:'Unit Uji',division:'Bagian Uji',reviewerPosition:'Atasan',reviewerName:'Pejabat Uji'},period:{start:'2026-09-01',end:'2026-09-30'},rows:[{date:'2026-09-09',activity:'<img src=x onerror=alert(1)>',result:'Hasil nyata',evidence:'https://drive.google.com/example',followup:'Tindak lanjut'}]})",fc);const previewTexts=[];(function walk(el){if(el&&typeof el.textContent==='string'&&el.textContent)previewTexts.push(el.textContent);(el?.children||[]).forEach(walk)})($('reportPreviewPaper'));assert.ok(previewTexts.includes('<img src=x onerror=alert(1)>'));assert.ok(previewTexts.includes('ASN <script>uji</script>'));assert.ok(previewTexts.includes('Laporan Harian Pelaksanaan Work From Home (WFH)'));assert.ok(!raw.includes('Work From WFH'));assert.ok(!raw.includes('id="printBtn"'));assert.ok(raw.includes('id="printPreviewBtn"'));assert.ok(raw.includes('id="exportWfhBtn"'));assert.ok(raw.includes('id="downloadWfhDocx"'));assert.ok(raw.includes('id="downloadWfhPdf"'));assert.ok(raw.includes("call('confirmReportPreview',snapshot.reportId,1)"));assert.ok(raw.includes("call('exportWfhReport'"));ok('WFH preview requires selection and renders untrusted values as text');
const wfhProfile={fullName:'ASN Sintetis',position:'Analis',unit:'Unit Uji',timeZone:'Asia/Jakarta',reportMode:'WFH',pageSize:'Letter'};
const wfhRow={id:'wfh-1',date:'2026-09-09',activity:'Uji laporan',result:'Hasil nyata',evidence:'',status:'Selesai',followup:'',version:1};
const wfhSnapshot=id=>({reportId:id,kind:'WFH',period:{start:'2026-09-01',end:'2026-09-30'},profileVersion:2,profile:wfhProfile,rows:[wfhRow],created:'2026-09-13T00:00:00Z'});
let printCalls=0;fc.window.print=()=>{printCalls++};
vm.runInContext("reportRows=[{id:'wfh-1',date:'2026-09-09',activity:'Uji laporan',result:'Hasil nyata',evidence:'',status:'Selesai',followup:'',version:1}];reportRange={start:'2026-09-01',end:'2026-09-30'};reportSelectedIds.clear();reportSelectedIds.add('wfh-1');profileVersion=2;fillProfile({fullName:'ASN Sintetis',position:'Analis',unit:'Unit Uji',timeZone:'Asia/Jakarta',reportMode:'WFH',pageSize:'Letter'});invalidateReportPreview();",fc);
rpc=[];let previewPromise=$('previewWfhBtn').onclick();assert.equal(rpc[0].name,'getProfile');$('previewWfhBtn').onclick();assert.equal(rpc.length,1);$('printPreviewBtn').onclick();assert.equal(printCalls,0);assert.equal($('printPreviewBtn').disabled,true);
rpc[0].resolve({version:2,values:wfhProfile});await new Promise(setImmediate);assert.equal(rpc[1].name,'createReportSnapshot');rpc[1].resolve(wfhSnapshot('report-ux-1'));await new Promise(setImmediate);assert.equal(rpc[2].name,'confirmReportPreview');assert.equal($('reportPreviewDialog').hidden,false);assert.equal($('reportView').attrs['data-wfh-pane'],'preview');assert.equal($('printPreviewBtn').disabled,true);$('printPreviewBtn').onclick();assert.equal(printCalls,0);
rpc[2].resolve({reportId:'report-ux-1',state:'previewed',revision:2});await previewPromise;assert.equal(vm.runInContext('reportPreviewIsCurrent()',fc),true);assert.equal($('printPreviewBtn').disabled,false);$('printPreviewBtn').onclick();assert.equal(printCalls,1);
const selectionTable=vm.runInContext('makeTable(reportRows)',fc),selectionBox=selectionTable.children[1].children[0].children[0].children[0];selectionBox.checked=false;selectionBox.onchange();assert.equal(vm.runInContext('reportPreviewIsCurrent()',fc),false);assert.equal($('printPreviewBtn').disabled,true);assert.equal($('exportWfhBtn').disabled,true);$('printPreviewBtn').onclick();assert.equal(printCalls,1);ok('WFH print stays blocked until confirmation and a checkbox edit invalidates the verified snapshot');
vm.runInContext("reportSelectedIds.add('wfh-1');invalidateReportPreview();",fc);rpc=[];previewPromise=$('previewWfhBtn').onclick();rpc[0].resolve({version:2,values:wfhProfile});await new Promise(setImmediate);rpc[1].resolve(wfhSnapshot('report-ux-2'));await new Promise(setImmediate);assert.equal(rpc[2].name,'confirmReportPreview');vm.runInContext("reportSelectedIds.add('wfh-2');invalidateReportPreview('Pilihan berubah.');",fc);rpc[2].resolve({reportId:'report-ux-2',state:'previewed',revision:2});await previewPromise;assert.equal(vm.runInContext('activeReportPreview',fc),null);assert.equal($('printPreviewBtn').disabled,true);assert.equal($('exportWfhBtn').disabled,true);ok('Late WFH confirmation cannot revive a stale draft');
vm.runInContext("reportSelectedIds.delete('wfh-2');activeReportPreview={reportId:'profile-snapshot',revision:2,draftKey:reportDraftKey()};",fc);$('printPreviewBtn').disabled=false;$('profileFullName').value='Nama Diperbarui';$('profileForm').listeners.input();assert.equal(vm.runInContext('profileDirty()',fc),true);assert.equal(vm.runInContext('reportPreviewIsCurrent()',fc),false);rpc=[];const profileSave=$('profileForm').onsubmit({preventDefault(){}});assert.equal(rpc[0].name,'saveProfile');rpc[0].resolve({version:3,values:{...wfhProfile,fullName:'Nama Diperbarui'}});await profileSave;assert.equal(vm.runInContext('reportRange.start',fc),'2026-09-01');assert.equal(vm.runInContext("reportSelectedIds.has('wfh-1')",fc),true);assert.equal(vm.runInContext('profileVersion',fc),3);assert.equal(vm.runInContext('profileDirty()',fc),false);assert.equal($('printPreviewBtn').disabled,true);ok('Saving WFH identity preserves period and selected activities while invalidating old output');
vm.runInContext("activeReportPreview={reportId:'export-snapshot',revision:2,draftKey:reportDraftKey(),profile:{pageSize:'Letter'}};",fc);rpc=[];const exportPromise=$('exportWfhBtn').onclick();assert.equal(rpc[0].name,'getDriveAuthorizationStatus');rpc[0].resolve({authorized:true});await new Promise(setImmediate);assert.equal(rpc[1].name,'exportWfhReport');assert.equal(rpc[1].args[0],'export-snapshot');assert.equal(rpc[1].args[1],2);$('exportWfhBtn').onclick();assert.equal(rpc.length,2);vm.runInContext("reportSelectedIds.add('wfh-2');invalidateReportPreview('Pilihan berubah.');",fc);rpc[1].resolve({reportId:'export-snapshot',revision:4,documentUrl:'https://docs.google.com/document/d/old/edit',docxUrl:'https://docs.google.com/document/d/old/export?format=docx',pdfUrl:'https://drive.google.com/old'});await exportPromise;assert.equal($('openWfhDoc').hidden,true);assert.equal($('downloadWfhPdf').hidden,true);assert.equal(vm.runInContext('activeReportPreview',fc),null);ok('WFH export sends the confirmed revision once and cannot present a late old-draft result as current');
vm.runInContext("reportSelectedIds.delete('wfh-2');",fc);rpc=[];previewPromise=$('previewWfhBtn').onclick();rpc[0].resolve({version:3,values:{...wfhProfile,fullName:'Nama Diperbarui'}});await new Promise(setImmediate);rpc[1].resolve(wfhSnapshot('report-ux-fail'));await new Promise(setImmediate);rpc[2].reject(Error('Profile changed on other device'));await previewPromise;assert.equal(vm.runInContext('activeReportPreview',fc),null);assert.equal($('printPreviewBtn').disabled,true);assert.equal($('exportWfhBtn').disabled,true);assert.match($('reportPreviewState').textContent,/tidak valid/);ok('Failed WFH confirmation remains visible as invalid and never enables print or export');
const previewSurface=$('reportPreviewDialog');previewSurface.hidden=true;vm.runInContext('openReportPreviewSurface()',fc);assert.equal(previewSurface.hidden,false);assert.equal(previewSurface.open,false);assert.equal(previewSurface.attrs['data-open'],'true');assert.equal($('reportView').attrs['data-wfh-pane'],'preview');vm.runInContext('closeReportPreviewSurface()',fc);assert.equal($('reportView').attrs['data-wfh-pane'],'selection');ok('WFH preview uses the nonmodal document pane and mobile tabs');
$('profileView').closest=selector=>selector==='#reportView'?$('reportView'):null;rpc=[];vm.runInContext("go('report')",fc);assert.equal($('profileView').hidden,false);assert.equal(rpc[0].name,'getProfile');rpc[0].resolve({version:3,values:{...wfhProfile,fullName:'Nama Diperbarui'}});await new Promise(setImmediate);delete $('profileView').closest;ok('WFH profile route keeps the existing form usable when moved inside Rekap');
await vm.runInContext("copyFormat('ekin')",fc);assert.match($('message').textContent,/Salin manual/);ok('Clipboard denied provides manual fallback');
$('quickAddDialog').open=false;$('inputView').hidden=false;$('activity').value='Unsaved';listeners.keydown({key:'Escape',preventDefault(){}});assert.equal($('activity').value,'Unsaved');ok('Escape preserves unsaved form');
assert.ok(!raw.includes('Terlaksana sesuai rencana.'));assert.ok(raw.includes('id="quickAddResult" required'));assert.ok(!read('Server.gs').includes('BOOK_ID'));assert.ok(!raw.includes('1qovAR2'));ok('No fabricated Quick Add result or author database/link');
assert.equal(ctx.getDistributionInfo().ready,false);publicTemplate='copy-A';assert.equal(ctx.getDistributionInfo().ready,false);publicTemplate=null;const distribution=ctx.ensureDistributionTemplate();assert.equal(distribution.ready,true);assert.equal(publicTemplate,'template-clean');assert.equal(templateShared,true);assert.equal(templateTrashed,false);assert.equal(templateBook.getSheets()[0].getName(),'Catatan Harian');assert.equal(JSON.stringify(templateBook.getSheets()[0]._rows[0]),JSON.stringify(grid[0]));assert.ok(!raw.includes("snap.spreadsheetUrl.replace(/\\/edit.*$/,'/copy')"));assert.ok(raw.includes("call('ensureDistributionTemplate')"));assert.ok(raw.includes('Salinan Sheet saja belum memiliki menu atau aplikasi.'));assert.ok(raw.includes('Paket rilis publik belum tersedia; jangan kirim tautan ini sebagai aplikasi siap pakai.'));assert.ok(raw.includes('Deploy &rarr; New deployment &rarr; Web app'));ok('Distribution creates a separate empty master and explains source installation and private deployment');
assert.ok(raw.includes('id="driveAuthDialog"'));assert.ok(raw.includes('id="driveAuthLink"'));assert.ok(raw.includes('id="driveAuthCheckBtn"'));assert.ok(raw.includes('Siapa saja yang memiliki link — Pelihat'));assert.ok(raw.includes('File laporan WFH tetap privat'));assert.ok(raw.includes("call('getDriveAuthorizationStatus')"));assert.ok(raw.includes("if(!await ensureDriveAuthorization())return;"));assert.ok(raw.includes("await ensureDriveAuthorization()"));ok('Drive-dependent template and WFH actions expose a recoverable and informed in-app authorization gate');
assert.match(raw,/\.mini-date \{\s*min-height: 44px/);assert.ok(raw.includes("document.body.append(a)"));assert.ok(raw.includes("message('Unduhan CSV dimulai.')"));ok('Mobile controls and CSV download feedback are explicit');
assert.ok(raw.includes('.progress-status-pill.neutral{color:#475569}'));assert.ok(raw.includes('textarea::placeholder,input::placeholder{color:#64748b;opacity:1}'));ok('Small neutral text and placeholders use AA-oriented contrast tokens');
assert.ok(raw.includes('id="profileForm"'));assert.ok(raw.includes('id="profileFullName"'));assert.ok(raw.includes('id="profilePageSize"'));assert.ok(raw.includes("call('saveProfile'"));vm.runInContext("profileVersion=2;fillProfile({fullName:'ASN Sintetis',position:'Analis',unit:'Unit Uji',timeZone:'Asia/Jakarta',reportMode:'WFH',pageSize:'Letter'})",fc);assert.equal(vm.runInContext('profileDirty()',fc),false);$('profileFullName').value='Nama Baru';$('profileForm').listeners.input();assert.equal(vm.runInContext('profileDirty()',fc),true);assert.match($('profileState').textContent,/belum disimpan/);ok('Profile data remains editable and detects unsaved changes independent of navigation placement');
assert.ok(raw.includes('id="attachmentFiles"'));assert.ok(raw.includes('id="attachmentList"'));assert.ok(raw.includes("call('uploadAttachment'"));assert.ok(raw.includes("call('recoverAttachment'"));assert.ok(raw.includes("call('detachAttachment'"));vm.runInContext("formAttachments=[];queuedUploads=[{file:{name:'oversize.pdf',size:10485761}}]",fc);assert.throws(()=>vm.runInContext('validateQueuedUploads()',fc),/10 MB/);assert.equal(vm.runInContext('formDirty()',fc),true);vm.runInContext("queuedUploads=[{file:{name:'unsafe.exe',size:100}}]",fc);assert.throws(()=>vm.runInContext('validateQueuedUploads()',fc),/format belum didukung/);vm.runInContext('queuedUploads=[]',fc);ok('Attachment UI validates queue limits, preserves unsaved file intent, and exposes upload/recovery/detach actions');
assert.ok(raw.includes(':root[data-theme="dark"]'));assert.ok(raw.includes('prefers-color-scheme: dark'));assert.ok(raw.includes('id="themeToggleBtn"'));assert.ok(raw.includes('id="sideThemeToggleBtn"'));assert.ok(raw.includes('--bg-app: #0b1120'));assert.ok(raw.includes('--bg-surface: #1e293b'));
vm.runInContext("setTheme('auto', false)", fc);assert.equal(vm.runInContext("currentThemeSetting", fc), 'auto');
vm.runInContext("cycleTheme()", fc);assert.equal(vm.runInContext("currentThemeSetting", fc), 'dark');
vm.runInContext("cycleTheme()", fc);assert.equal(vm.runInContext("currentThemeSetting", fc), 'light');
vm.runInContext("cycleTheme()", fc);assert.equal(vm.runInContext("currentThemeSetting", fc), 'auto');
ok('Adaptive Dark Mode (FR-401–403): media queries, Slate tokens, and cycle transitions');
assert.ok(raw.includes('id="navKanban"'));assert.ok(raw.includes('id="kanbanView"'));assert.ok(raw.includes('class="kanban-board"'));assert.ok(raw.includes('id="cardsWait"'));assert.ok(raw.includes('id="cardsProgress"'));assert.ok(raw.includes('id="cardsDone"'));
vm.runInContext("go('kanban')", fc);assert.equal(vm.runInContext("$('kanbanView').hidden", fc), false);assert.equal(vm.runInContext("$('homeView').hidden", fc), true);assert.equal(vm.runInContext("$('pageTitle').textContent", fc), 'Papan Kanban');
vm.runInContext("records=[{id:'k1',date:'2026-09-09',activity:'[P1] Urgent task',result:'Pending',status:'Menunggu',version:1},{id:'k2',date:'2026-09-09',activity:'[P2] Active task',result:'In progress',status:'Berjalan',version:1},{id:'k3',date:'2026-09-09',activity:'[P3] Finished task',result:'Completed',status:'Selesai',version:1}];dataReady=true;renderKanban();", fc);
assert.equal(vm.runInContext("$('countWait').textContent", fc), 1);assert.equal(vm.runInContext("$('countProgress').textContent", fc), 1);assert.equal(vm.runInContext("$('countDone').textContent", fc), 1);
assert.equal(vm.runInContext("$('cardsWait').children.length", fc), 1);assert.equal(vm.runInContext("$('cardsProgress').children.length", fc), 1);assert.equal(vm.runInContext("$('cardsDone').children.length", fc), 1);
ok('Kanban Board View (TASK-501–503): 3-column partitioning, router switcher, and status badges');
assert.ok(raw.includes('id="kanbanSearchInput"'));assert.ok(raw.includes('id="kanbanScopeChips"'));assert.ok(raw.includes('id="kanbanPriorityChips"'));
$('kanbanSearchInput').value='urgent';$('kanbanSearchInput').oninput();
assert.equal(vm.runInContext("$('countWait').textContent", fc), 1);assert.equal(vm.runInContext("$('countProgress').textContent", fc), 0);assert.equal(vm.runInContext("$('countDone').textContent", fc), 0);
$('kanbanSearchInput').value='';$('kanbanSearchInput').oninput();
$('chipPrioP2').click();
assert.equal(vm.runInContext("$('countWait').textContent", fc), 0);assert.equal(vm.runInContext("$('countProgress').textContent", fc), 1);assert.equal(vm.runInContext("$('countDone').textContent", fc), 0);
$('chipPrioAll').click();
assert.equal(vm.runInContext("$('countWait').textContent", fc), 1);
$('chipScopeToday').click();
assert.equal(vm.runInContext("$('countWait').textContent", fc), 1);
$('chipScopeAll').click();
ok('Kanban Live Search and Filter Chips (TASK-504–505): keyword search, priority filter, and date scope filtering');
assert.ok(raw.includes('rel="manifest"'));assert.ok(raw.includes('apple-mobile-web-app-capable'));assert.ok(raw.includes('id="installAppBtn"'));assert.ok(raw.includes('id="toggleSelectModeBtn"'));assert.ok(raw.includes('id="batchBar"'));assert.ok(raw.includes('id="templateClonerDialog"'));
vm.runInContext("toggleSelectMode(true)", fc);assert.equal(vm.runInContext("selectMode", fc), true);
vm.runInContext("toggleRecordSelection('k1')", fc);assert.equal(vm.runInContext("selectedRecordIds.has('k1')", fc), true);
vm.runInContext("updateBatchBar()", fc);assert.equal(vm.runInContext("$('batchCount').textContent", fc), '1 kegiatan dipilih');
vm.runInContext("toggleSelectMode(false)", fc);assert.equal(vm.runInContext("selectedRecordIds.size", fc), 0);
const rCheck={id:'c1',activity:'Task',result:'- [ ] Sub1\n- [x] Sub2',status:'Berjalan',version:1};
let curIdx=0;
const newLines=rCheck.result.split('\n').map(line=>{
  const m=line.match(/^([ \t]*[-*]\s*\[)([ xX])(\]\s*.*)$/);
  if(m){if(curIdx===0){curIdx++;return m[1]+'x'+m[3];}curIdx++;}return line;
}).join('\n');
assert.equal(newLines,'- [x] Sub1\n- [x] Sub2');
assert.ok(raw.includes('id="formatChecklistBtn"'));assert.ok(raw.includes('id="formatBulletBtn"'));assert.ok(raw.includes('id="formatTextBtn"'));assert.ok(raw.includes('id="quickFormatChecklistBtn"'));assert.ok(raw.includes('applyResultFormat'));
vm.runInContext("$('result').value='Draft awal';applyResultFormat('result','checklist')",fc);assert.equal(vm.runInContext("$('result').value",fc),'- [ ] Draft awal');
vm.runInContext("applyResultFormat('result','bullet')",fc);assert.equal(vm.runInContext("$('result').value",fc),'- Draft awal');
vm.runInContext("applyResultFormat('result','text')",fc);assert.equal(vm.runInContext("$('result').value",fc),'Draft awal');
const bulletTestEl=vm.runInContext("const c=document.createElement('div');renderResultContent({result:'- Poin 1\\n- Poin 2'},c,'todo-desc');c",fc);
assert.ok(bulletTestEl.children[0].children.some(ch=>ch.className==='subbullet-list'&&ch.children.length===2));
vm.runInContext("{ const ta=$('result');ta.value='- [ ] Tugas 1';ta.selectionStart=ta.value.length;handleListSmartEnter({key:'Enter',preventDefault(){}},'result'); }",fc);assert.equal(vm.runInContext("$('result').value",fc),'- [ ] Tugas 1\n- [ ] ');
vm.runInContext("{ const ta=$('result');ta.selectionStart=ta.value.length;handleListSmartEnter({key:'Enter',preventDefault(){}},'result'); }",fc);assert.equal(vm.runInContext("$('result').value",fc),'- [ ] Tugas 1\n');
ok('PWA, Multi-Select Batch Actions, Sub-Checklist & Result Formatting Toolbar (TASK-601–604)');
vm.runInContext("records=[{id:'b1',status:'Menunggu',version:1},{id:'b2',status:'Menunggu',version:1},{id:'b3',status:'Menunggu',version:1}];selectedRecordIds.clear();selectedRecordIds.add('b1');selectedRecordIds.add('b2');selectedRecordIds.add('b3');persistRecord=async r=>{if(r.id==='b2')throw Error('simulated failure');return {...r,version:r.version+1}};load=async()=>true;render=()=>{};dataReady=true;mutationBusy=false;",fc);
const partialBatch=await vm.runInContext("executeBatchStatus('Selesai')",fc);assert.equal(partialBatch.status,'partial');assert.equal(partialBatch.successCount,1);assert.equal(partialBatch.remainingCount,2);assert.equal(partialBatch.failedId,'b2');assert.equal(vm.runInContext("selectedRecordIds.has('b1')",fc),false);assert.equal(vm.runInContext("selectedRecordIds.has('b2')&&selectedRecordIds.has('b3')",fc),true);assert.match($('message').textContent,/Pembaruan sebagian: 1 berhasil, 2 belum diproses/);ok('Batch partial failure stays visible and keeps failed/unprocessed selection');
vm.runInContext("selectedRecordIds.clear();selectedRecordIds.add('b1');selectedRecordIds.add('b2');selectedRecordIds.add('b3');persistRecord=async r=>{if(r.id==='b1')throw Error('Response lost');return r};",fc);const firstFailed=await vm.runInContext("executeBatchStatus('Selesai')",fc);assert.equal(firstFailed.successCount,0);assert.equal(firstFailed.remainingCount,3);assert.equal(vm.runInContext('selectedRecordIds.size',fc),3);assert.match($('message').textContent,/Response lost/);
vm.runInContext("selectedRecordIds.clear();selectedRecordIds.add('b1');selectedRecordIds.add('b2');selectedRecordIds.add('b3');persistRecord=async r=>{if(r.id==='b3')throw Error('last failed');return r};",fc);const lastFailed=await vm.runInContext("executeBatchStatus('Selesai')",fc);assert.equal(lastFailed.successCount,2);assert.equal(lastFailed.remainingCount,1);assert.equal(vm.runInContext("selectedRecordIds.size===1&&selectedRecordIds.has('b3')",fc),true);
vm.runInContext("selectedRecordIds.clear();selectedRecordIds.add('b1');selectedRecordIds.add('b2');persistRecord=async r=>r;",fc);const completeBatch=await vm.runInContext("executeBatchStatus('Selesai')",fc);assert.equal(completeBatch.status,'complete');assert.equal(completeBatch.successCount,2);assert.equal(vm.runInContext('selectedRecordIds.size',fc),0);ok('Batch covers first/last failure, response-loss signal, and complete success');
const requiredIcons = [
  { name: 'favicon-16x16.png', w: 16, h: 16 },
  { name: 'favicon-32x32.png', w: 32, h: 32 },
  { name: 'apple-touch-icon.png', w: 180, h: 180 },
  { name: 'icon-192.png', w: 192, h: 192 },
  { name: 'icon-512.png', w: 512, h: 512 },
  { name: 'icon-maskable-192.png', w: 192, h: 192 },
  { name: 'icon-maskable-512.png', w: 512, h: 512 }
];
const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const icon of requiredIcons) {
  const iconPath = new URL('../assets/icons/' + icon.name, import.meta.url);
  assert.ok(fs.existsSync(iconPath), 'Icon asset missing: ' + icon.name);
  const iconBuf = fs.readFileSync(iconPath);
  assert.ok(iconBuf.subarray(0, 8).equals(pngSig), 'Invalid PNG signature for ' + icon.name);
  assert.equal(iconBuf.readUInt32BE(16), icon.w, 'Invalid width for ' + icon.name);
  assert.equal(iconBuf.readUInt32BE(20), icon.h, 'Invalid height for ' + icon.name);
}
const pwaManifest = JSON.parse(fs.readFileSync(new URL('../assets/icons/manifest.json', import.meta.url), 'utf8'));
assert.equal(pwaManifest.name, 'E-Kinerja Harian ASN');
assert.ok(pwaManifest.icons.some(i => i.src.includes('apple-touch-icon.png') && i.sizes === '180x180'));
assert.ok(pwaManifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
assert.ok(raw.includes('rel="apple-touch-icon"'));
assert.ok(raw.includes('favicon-32x32.png'));
assert.ok(raw.includes('.todo-check-btn {') && raw.includes('aspect-ratio: 1 / 1 !important;') && raw.includes('border-radius: 50% !important;'));
assert.ok(raw.includes('.todo-check-btn::after {') && raw.includes('width: 44px;') && raw.includes('height: 44px;'));
ok('Multi-Size Raster Icon Kit, PWA Assets, and Undistorted Circle Checklist (QA-LEGACY-02, BUG-PWA-01)');

// ARC-05 / RPT-HTML-01: Multi-Page WFH Report Print & Repeating Header Fixture
const multiRows = Array.from({ length: 25 }, (_, i) => ({
  date: '2026-09-' + String(i + 1).padStart(2, '0'),
  activity: 'Kegiatan WFH hari ke-' + (i + 1) + ' Penelaahan Dokumen Keuangan',
  result: '- Menelaah SPJ pos belanja ' + (i + 1) + '\n- Mengisi checklist kepatuhan standar',
  evidence: 'https://drive.google.com/file/' + (i + 1),
  followup: 'Koordinasikan dengan sub-bagian terkait'
}));
const multiSnapshotA4 = {
  profile: {
    fullName: 'Drs. ASN Teladan, M.Si.',
    employeeId: 'SYNTHETIC-NIP-001',
    rankGrade: 'Pembina / IV/a',
    position: 'Auditor Ahli Madya',
    unit: 'Inspektorat Jenderal',
    division: 'Sub-bagian Akuntansi & Pelaporan',
    reviewerPosition: 'Inspektur Wilayah I',
    reviewerName: 'Dr. Pejabat Penilai, M.M.',
    pageSize: 'A4'
  },
  period: { start: '2026-09-01', end: '2026-09-30' },
  rows: multiRows
};
vm.runInContext('renderReportPreview(' + JSON.stringify(multiSnapshotA4) + ')', fc);
assert.equal(vm.runInContext("const tbl=$('reportPreviewPaper').children.find(c=>c.tag==='table');const tb=tbl.children.find(c=>c.tag==='tbody');tb.children.length", fc), 25);
assert.equal(vm.runInContext("$('reportPaperBadge').textContent.includes('A4')", fc), true);
assert.equal(vm.runInContext("$('reportPaperBadge').textContent.includes('Hlm')", fc), true);
assert.equal(vm.runInContext("document.getElementById('reportDynamicPrintStyle').textContent.includes('A4 portrait')", fc), true);

const multiSnapshotLetter = { ...multiSnapshotA4, profile: { ...multiSnapshotA4.profile, pageSize: 'Letter' } };
vm.runInContext('renderReportPreview(' + JSON.stringify(multiSnapshotLetter) + ')', fc);
assert.equal(vm.runInContext("$('reportPaperBadge').textContent.includes('Letter')", fc), true);
assert.equal(vm.runInContext("document.getElementById('reportDynamicPrintStyle').textContent.includes('Letter portrait')", fc), true);

assert.ok(raw.includes('.report-paper thead{display:table-header-group!important}'));
assert.ok(raw.includes('.report-paper tr,.report-paper td,.report-paper th{page-break-inside:avoid!important;break-inside:avoid!important}'));
assert.ok(raw.includes('.report-signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;text-align:center;font-size:10pt;page-break-inside:avoid!important;break-inside:avoid!important;break-before:auto}'));
assert.ok(raw.includes('body.printing-report .report-paper thead{display:table-header-group!important}'));
ok('Multi-Page WFH Report Print Perfection, Repeating Table Headers, and Synthetic Fixture (ARC-05, RPT-HTML-01)');

// Home Dashboard Real-Time Live Search (TASK-105 / ST1-02)
assert.ok(raw.includes('id="homeSearchInput"'));
assert.ok(raw.includes('id="clearHomeSearch"'));
assert.ok(raw.includes('id="homeSearchResultMeta"'));
assert.ok(raw.includes('function filterHomeNotes'));

vm.runInContext(`
records = [
  { id: 'h1', date: '2026-09-10', activity: 'Audit Keuangan Triwulan', result: 'Laporan audit selesai', evidence: 'bukti1.pdf', followup: 'Tindak lanjut A', status: 'Selesai', version: 1 },
  { id: 'h2', date: '2026-09-10', activity: 'Rapat Koordinasi Tim', result: 'Notula tersimpan', evidence: 'notula.docx', followup: 'Segera kirim ke koordinator', status: 'Berjalan', version: 1 },
  { id: 'h3', date: '2026-09-11', activity: 'Penyusunan Kertas Kerja', result: 'KKA rampung', evidence: 'kka.xlsx', followup: 'Reviu atasan', status: 'Menunggu', version: 1 }
];
$('homeSearchInput').value = '';
renderHome();
`, fc);

assert.equal(vm.runInContext("$('recentNotes').children.length", fc), 3);
assert.equal(vm.runInContext("$('clearHomeSearch').style.display", fc), 'none');
assert.equal(vm.runInContext("$('homeSearchResultMeta').style.display", fc), 'none');

// Search matching activity
vm.runInContext("$('homeSearchInput').value = 'Keuangan'; $('homeSearchInput').oninput();", fc);
assert.equal(vm.runInContext("$('recentNotes').children.length", fc), 1);
assert.equal(vm.runInContext("$('clearHomeSearch').style.display", fc), 'inline-block');
assert.equal(vm.runInContext("$('homeSearchResultMeta').style.display", fc), 'block');
assert.ok(vm.runInContext("$('homeSearchResultMeta').textContent.includes('1')", fc));

// Search matching followup
vm.runInContext("$('homeSearchInput').value = 'koordinator'; $('homeSearchInput').oninput();", fc);
assert.equal(vm.runInContext("$('recentNotes').children.length", fc), 1);
assert.ok(vm.runInContext("$('homeSearchResultMeta').textContent.includes('1')", fc));

// Search non-matching
vm.runInContext("$('homeSearchInput').value = 'tidakada'; $('homeSearchInput').oninput();", fc);
assert.equal(vm.runInContext("$('recentNotes').children.length", fc), 1);
assert.ok(vm.runInContext("$('recentNotes').children[0].className.includes('empty')", fc));
assert.ok(vm.runInContext("$('homeSearchResultMeta').textContent.includes('0')", fc));

// Quick clear button
vm.runInContext("$('clearHomeSearch').onclick();", fc);
assert.equal(vm.runInContext("$('homeSearchInput').value", fc), '');
assert.equal(vm.runInContext("$('recentNotes').children.length", fc), 3);
assert.equal(vm.runInContext("$('clearHomeSearch').style.display", fc), 'none');
assert.equal(vm.runInContext("$('homeSearchResultMeta').style.display", fc), 'none');

ok('Home Dashboard Real-Time Live Search with Quick Clear and Count Meta (TASK-105, ST1-02)');

// Quantitative Performance Benchmark Suite (QA-LEGACY-04, PERF-LOCK-01)
assert.ok(fs.existsSync(new URL('../benchmark.mjs', import.meta.url)));
assert.ok(fs.existsSync(new URL('../benchmark-results.json', import.meta.url)));
const benchData = JSON.parse(fs.readFileSync(new URL('../benchmark-results.json', import.meta.url), 'utf8'));
assert.ok(benchData.runs['100']);
assert.ok(benchData.runs['1000']);
assert.ok(benchData.runs['5000']);
assert.equal(benchData.zeroLockTest.lockAcquired, false);
assert.equal(benchData.zeroLockTest.status.includes('PASS'), true);
assert.equal(pkg.scripts.benchmark, 'node benchmark.mjs');
ok('Quantitative Performance Benchmark Suite & Zero-Lock Verification (QA-LEGACY-04, PERF-LOCK-01)');

// Activity Heatmap Visual Work Intensity Grid & Date Filter (ST2-04, ST1-09)
assert.ok(raw.includes('id="heatmapGrid"'));
assert.ok(raw.includes('id="heatmapSelectedDay"'));
assert.ok(raw.includes('function renderHeatmap'));
assert.ok(raw.includes('function selectHeatmapDay'));

vm.runInContext(`
records = [
  // 5 records on 2026-09-10 (Level 3)
  { id: 'hm1', date: '2026-09-10', activity: 'Tugas 1', status: 'Selesai', version: 1 },
  { id: 'hm2', date: '2026-09-10', activity: 'Tugas 2', status: 'Selesai', version: 1 },
  { id: 'hm3', date: '2026-09-10', activity: 'Tugas 3', status: 'Selesai', version: 1 },
  { id: 'hm4', date: '2026-09-10', activity: 'Tugas 4', status: 'Berjalan', version: 1 },
  { id: 'hm5', date: '2026-09-10', activity: 'Tugas 5', status: 'Menunggu', version: 1 },
  // 3 records on 2026-09-11 (Level 2)
  { id: 'hm6', date: '2026-09-11', activity: 'Tugas 6', status: 'Selesai', version: 1 },
  { id: 'hm7', date: '2026-09-11', activity: 'Tugas 7', status: 'Berjalan', version: 1 },
  { id: 'hm8', date: '2026-09-11', activity: 'Tugas 8', status: 'Menunggu', version: 1 },
  // 1 record on 2026-09-12 (Level 1)
  { id: 'hm9', date: '2026-09-12', activity: 'Tugas 9', status: 'Berjalan', version: 1 }
];
$('homeMonth').value = '2026-09';
today = '2026-09-10';
activeHeatmapDate = null;
renderHeatmap();
`, fc);

const gridTiles = vm.runInContext("$('heatmapGrid').children", fc);
assert.equal(gridTiles.length, 30);
assert.ok(gridTiles[0].className.includes('level-0'));
assert.ok(gridTiles[9].className.includes('level-3'));
assert.ok(gridTiles[9].className.includes('is-today'));
assert.ok(gridTiles[10].className.includes('level-2'));
assert.ok(gridTiles[11].className.includes('level-1'));

// Click Day 10 tile to filter
vm.runInContext("$('heatmapGrid').children[9].onclick();", fc);
assert.equal(vm.runInContext("activeHeatmapDate", fc), '2026-09-10');
assert.equal(vm.runInContext("$('heatmapSelectedDay').style.display", fc), 'flex');
assert.equal(vm.runInContext("$('recentNotes').children.length", fc), 5);

// Click again to toggle off
vm.runInContext("$('heatmapGrid').children[9].onclick();", fc);
assert.equal(vm.runInContext("activeHeatmapDate", fc), null);
assert.equal(vm.runInContext("$('heatmapSelectedDay').style.display", fc), 'none');

ok('Activity Heatmap Visual Work Intensity Grid & Date Filter (ST2-04, ST1-09)');

// --- Smart Natural Language Date & Priority Parser on Quick Add (ST1-01, Todoist Parity) ---
// 1. Natural date parser unit checks
const parsedBesok = vm.runInContext("parseNaturalDate('Rapat audit besok p1', '2026-09-13')", fc);
assert.equal(parsedBesok.ymd, '2026-09-14');
assert.equal(parsedBesok.label, 'Besok');
assert.equal(parsedBesok.token, 'besok');

const parsedLusa = vm.runInContext("parseNaturalDate('Review laporan lusa', '2026-09-13')", fc);
assert.equal(parsedLusa.ymd, '2026-09-15');
assert.equal(parsedLusa.label, 'Lusa');

const parsedHariIni = vm.runInContext("parseNaturalDate('Evaluasi kinerja hari ini', '2026-09-13')", fc);
assert.equal(parsedHariIni.ymd, '2026-09-13');
assert.equal(parsedHariIni.label, 'Hari ini');

const parsedTgl = vm.runInContext("parseNaturalDate('Revisi tgl 25', '2026-09-13')", fc);
assert.equal(parsedTgl.ymd, '2026-09-25');
assert.equal(parsedTgl.label, 'Tgl 25');

const parsedNone = vm.runInContext("parseNaturalDate('Teks biasa tanpa tanggal', '2026-09-13')", fc);
assert.equal(parsedNone, null);

// 2. Priority token parser unit checks
const prioP1 = vm.runInContext("parsePriorityToken('Rapat audit besok p1')", fc);
assert.equal(prioP1.priority, 'P1');
assert.equal(prioP1.token, 'p1');

const prioP2 = vm.runInContext("parsePriorityToken('Fix bug !p2')", fc);
assert.equal(prioP2.priority, 'P2');
assert.equal(prioP2.token, '!p2');

const prioP3 = vm.runInContext("parsePriorityToken('Update doc [p3]')", fc);
assert.equal(prioP3.priority, 'P3');
assert.equal(prioP3.token, '[p3]');

const prioNone = vm.runInContext("parsePriorityToken('Teks biasa tanpa prioritas')", fc);
assert.equal(prioNone, null);

// 3. Markup and styling checks
assert.ok(raw.includes('id="quickAddSuggestionBar"'));
assert.ok(raw.includes('id="quickAddDateChip"'));
assert.ok(raw.includes('id="quickAddPrioChip"'));
assert.ok(raw.includes('.quick-suggestion-bar'));
assert.ok(raw.includes('.date-chip-btn'));
assert.ok(raw.includes('.prio-chip-btn'));

// 4. Interactive Quick Add DOM integration & chip click
vm.runInContext(`
today = '2026-09-13';
$('quickAddInput').value = 'Rapat koordinasi audit besok p1';
handleQuickAddInput();
`, fc);
assert.equal(vm.runInContext("$('quickAddSuggestionBar').style.display", fc), 'flex');
assert.equal(vm.runInContext("$('quickAddDateChip').style.display", fc), 'inline-flex');
assert.equal(vm.runInContext("$('quickAddPrioChip').style.display", fc), 'inline-flex');
assert.equal(vm.runInContext("$('quickAddDate').value", fc), '2026-09-14');
assert.equal(vm.runInContext("$('quickAddPriority').value", fc), 'P1');

// Click Date Chip: sets date, cleans 'besok' from input
vm.runInContext("$('quickAddDateChip').onclick();", fc);
assert.equal(vm.runInContext("$('quickAddInput').value", fc), 'Rapat koordinasi audit p1');
assert.equal(vm.runInContext("$('quickAddDateChip').style.display", fc), 'none');
assert.equal(vm.runInContext("$('quickAddDate').value", fc), '2026-09-14');

// Click Prio Chip: sets priority, cleans 'p1' from input, hides bar
vm.runInContext("$('quickAddPrioChip').onclick();", fc);
assert.equal(vm.runInContext("$('quickAddInput').value", fc), 'Rapat koordinasi audit');
assert.equal(vm.runInContext("$('quickAddPrioChip').style.display", fc), 'none');
assert.equal(vm.runInContext("$('quickAddSuggestionBar').style.display", fc), 'none');
assert.equal(vm.runInContext("$('quickAddPriority').value", fc), 'P1');

// 5. Submit Quick Add with natural tokens: cleans tokens from title, honors real date/priority, no fabricated results
vm.runInContext(`
persistRecord = async (payload) => {
  globalThis.capturedQuickPayload = JSON.parse(JSON.stringify(payload));
  return { ...payload, version: 1 };
};
today = '2026-09-13';
$('quickAddInput').value = 'Penyusunan KKP besok p1';
$('quickAddResult').value = 'Draft awal selesai 5 lembar';
handleQuickAddInput();
`, fc);
await vm.runInContext("$('quickAddForm').onsubmit({ preventDefault() {} })", fc);
const savedPayload = fc.capturedQuickPayload;
assert.ok(savedPayload);
assert.equal(savedPayload.date, '2026-09-14');
assert.equal(savedPayload.activity, '[P1] Penyusunan KKP');
assert.equal(savedPayload.result, 'Draft awal selesai 5 lembar');
assert.equal(savedPayload.status, 'Berjalan');

ok('Smart Natural Language Date & Priority Parser on Quick Add (ST1-01, Todoist Parity)');

// --- PWA Service Worker Offline Application Shell Cache (BUG-PWA-01, ST1-14) ---
const swSource = read('sw.js');
new vm.Script(swSource);
assert.ok(swSource.includes('CACHE_NAME'));
assert.ok(swSource.includes('STATIC_ASSETS'));
assert.ok(swSource.includes('./Index.html'));
assert.ok(swSource.includes('./assets/icons/icon-192.png'));
assert.ok(swSource.includes('./assets/icons/icon-512.png'));
assert.ok(swSource.includes('./assets/icons/icon-maskable-192.png'));
assert.ok(swSource.includes("self.addEventListener('install'"));
assert.ok(swSource.includes("self.addEventListener('activate'"));
assert.ok(swSource.includes("self.addEventListener('fetch'"));

const manifestPwa = JSON.parse(read('assets/manifest.json'));
assert.equal(manifestPwa.display, 'standalone');
assert.equal(manifestPwa.short_name, 'E-Kinerja');
assert.ok(manifestPwa.icons.some(ic => ic.purpose === 'maskable'));

assert.ok(raw.includes("navigator.serviceWorker.register('./sw.js')"));
const serveSource = read('serve.mjs');
assert.ok(serveSource.includes("req.url === '/sw.js'"));
assert.ok(serveSource.includes("'Service-Worker-Allowed': '/'"));

// Offline cache purge and request router simulation
const swListeners = {};
const swCaches = new Map();
const mockSelf = {
  addEventListener(evt, fn) { swListeners[evt] = fn; },
  skipWaiting: async () => {},
  clients: { claim: async () => {} }
};
const swCtx = vm.createContext({
  self: mockSelf,
  URL,
  Response: class { constructor(body, init) { this.body = body; this.headers = init?.headers || {}; } },
  console,
  caches: {
    open: async (name) => ({
      addAll: async (assets) => { swCaches.set(name, assets); },
      put: async () => {}
    }),
    keys: async () => ['ekinerja-old-cache-v0.8.0', `ekinerja-shell-v${pkg.version}`],
    delete: async (name) => swCaches.delete(name),
    match: async (req) => swCaches.has(`ekinerja-shell-v${pkg.version}`) ? { ok: true } : null
  }
});
vm.runInContext(swSource, swCtx);
assert.equal(typeof swListeners.install, 'function');
assert.equal(typeof swListeners.activate, 'function');
assert.equal(typeof swListeners.fetch, 'function');

// Simulate install
let waitPromise = null;
swListeners.install({ waitUntil(p) { waitPromise = p; } });
await waitPromise;
assert.ok(swCaches.has(`ekinerja-shell-v${pkg.version}`));

ok('PWA Service Worker Offline Application Shell Cache (BUG-PWA-01, ST1-14)');

// --- End-to-End 5-Second Undo Action Verification (QA-LEGACY-01, TASK-102) ---
assert.ok(raw.includes('id="undoToast"'));
assert.ok(raw.includes('id="undoToastText"'));
assert.ok(raw.includes('id="undoBtn"'));
assert.ok(raw.includes('id="undoCountdown"'));
assert.ok(raw.includes('id="undoProgressBar"'));
assert.ok(raw.includes('.undo-toast {'));
assert.ok(raw.includes('.undo-toast.visible {'));
assert.ok(raw.includes('.undo-progress-bar {'));
assert.ok(raw.includes('@keyframes undoBarAnim {'));

// Verify DOM & JS Undo state machine
const sToast = new Set();
const undoDom = {
  undoToast: {
    hidden: true,
    classList: {
      add: (c) => sToast.add(c),
      remove: (c) => sToast.delete(c),
      contains: (c) => sToast.has(c)
    }
  },
  undoToastText: { textContent: '' },
  undoBtn: { onclick: null },
  undoCountdown: { textContent: '' },
  undoProgressBar: { classList: { add: () => {}, remove: () => {} }, offsetWidth: 100 }
};
let undoPersistPayload = null;
let undoMessageText = '';

const undoCtx = vm.createContext({
  $: (id) => undoDom[id],
  mutationBusy: false,
  dataReady: true,
  unresolvedId: null,
  message: (m) => { undoMessageText = m; },
  persistRecord: async (rec) => { undoPersistPayload = rec; return rec; },
  load: async () => {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  console
});

const undoSnippet = `
let lastToggled=null,toastTimer=null,countdownTimer=null;
function hideUndo(){
  if(toastTimer){clearTimeout(toastTimer);toastTimer=null;}
  if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
  lastToggled=null;
  const toast=$('undoToast');
  if(toast){
    toast.hidden=true;
    toast.classList.remove('visible');
  }
}
function showUndoToast(record,oldStatus){
  hideUndo();
  lastToggled={record:{...record},oldStatus};
  const toastText=$('undoToastText');
  if(toastText)toastText.textContent='Status tersimpan: '+record.status;
  const toast=$('undoToast');
  if(toast){
    toast.hidden=false;
    toast.classList.add('visible');
    const pBar=$('undoProgressBar');
    if(pBar){
      pBar.classList.remove('running');
      void pBar.offsetWidth;
      pBar.classList.add('running');
    }
    let remainingSec=5;
    const cdEl=$('undoCountdown');
    if(cdEl)cdEl.textContent='(5s)';
    countdownTimer=setInterval(()=>{
      remainingSec--;
      if(cdEl)cdEl.textContent='('+Math.max(remainingSec,0)+'s)';
      if(remainingSec<=0){
        clearInterval(countdownTimer);
        countdownTimer=null;
      }
    },1000);
    toastTimer=setTimeout(hideUndo,5000);
  }
}
$('undoBtn').onclick=async()=>{
  if(!lastToggled||mutationBusy)return;
  const {record,oldStatus}=lastToggled;
  hideUndo();
  try{
    await persistRecord({...record,status:oldStatus});
    await load(true);
    message('Perubahan status dibatalkan dan tersimpan.');
  }catch(e){
    await load(true);
    message(e.message,true);
  }
};
`;
vm.runInContext(undoSnippet, undoCtx);

// 1. Initial state: toast hidden
assert.equal(undoDom.undoToast.hidden, true);

// 2. Trigger showUndoToast on task marked "Selesai"
const testRecord = { id: 'ACT-001', activity: 'Audit Keuangan', status: 'Selesai', version: 3 };
undoCtx.testRecord = testRecord;
vm.runInContext("showUndoToast(testRecord, 'Berjalan')", undoCtx);

assert.equal(undoDom.undoToast.hidden, false);
assert.ok(undoDom.undoToast.classList.contains('visible'));
assert.equal(undoDom.undoToastText.textContent, 'Status tersimpan: Selesai');
assert.equal(undoDom.undoCountdown.textContent, '(5s)');

// 3. User clicks "Batalkan" within 5-second window
await undoDom.undoBtn.onclick();

// 4. Status reverted back to "Berjalan" and toast hidden
assert.equal(undoPersistPayload.id, 'ACT-001');
assert.equal(undoPersistPayload.status, 'Berjalan');
assert.equal(undoDom.undoToast.hidden, true);
assert.ok(!undoDom.undoToast.classList.contains('visible'));
assert.equal(undoMessageText, 'Perubahan status dibatalkan dan tersimpan.');

ok('End-to-End 5-Second Undo Action Verification with Animated Progress Countdown (QA-LEGACY-01, TASK-102)');
const bundleSource=read('Kode.gs'),serverSource=read('Server.gs'),bundleCtx=vm.createContext({});vm.runInContext(bundleSource,bundleCtx);assert.equal(vm.runInContext('APP_HTML',bundleCtx),html);assert.ok(bundleSource.includes(serverSource));ok('Generated bundle exactly contains current server and client sources');
assert.equal(vm.runInContext('APP_VERSION',ctx),pkg.version);assert.ok(raw.includes(`<span class="semver-tag">v${pkg.version}</span>`));assert.ok(raw.includes(`<span id="buildVersion">v${pkg.version}</span>`));ok('Package, server, visible badge, and generated bundle versions stay synchronized');
const result={version:pkg.version,scope:'Deterministic source/backend/DOM/RPC mocks; cloud latency and physical mobile validation separate',passed,sourceHashes:Object.fromEntries(['Server.gs','Index.html','client-domain.js','client-sync.js','Kode.gs'].map(f=>[f,crypto.createHash('sha256').update(read(f)).digest('hex')]))};fs.writeFileSync(new URL('results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

