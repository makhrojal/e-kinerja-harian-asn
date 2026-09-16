/** @version 0.8.17 · Private installation. No author database fallback. */
const APP_VERSION = '0.8.17';
const HEADERS = ['ID','Tanggal','Kegiatan','Hasil','Bukti','Status','Tindak lanjut','Dibuat','Diperbarui','Revisi'];
const TAB_NAME = 'Catatan Harian';
const PUBLIC_TEMPLATE_PROPERTY = 'PUBLIC_TEMPLATE_SPREADSHEET_ID';
const REPORT_FOLDER_PROPERTY = 'WFH_REPORT_FOLDER_ID';
const ATTACHMENT_FOLDER_PROPERTY = 'ATTACHMENT_FOLDER_ID';
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_MAX_PER_ACTIVITY = 5;
// Apps Script executions stop after six minutes. Keep a claim longer than that
// so a second request cannot create the same Drive file while the first runs.
const ATTACHMENT_CLAIM_MS = 7 * 60 * 1000;
const ATTACHMENT_TYPES = Object.freeze({
  pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'
});
const DATA_SCHEMA_VERSION = 1;
const AUX_SCHEMAS = Object.freeze({
  Projects:['ProjectID','Name','Color','Archived','Created','Updated','Revision'],
  Tasks:['TaskID','ProjectID','Title','Description','DueDate','Status','Priority','Recurrence','ParentTaskID','Created','Updated','Revision'],
  TaskLabels:['TaskLabelID','TaskID','Label','Created','Revision'],
  Blocks:['BlockID','TaskID','Type','Content','Position','Created','Updated','Revision'],
  Comments:['CommentID','TaskID','ActivityID','Content','AuthorKey','Created','Updated','Revision'],
  Attachments:['AttachmentID','ActivityID','TaskID','FileID','URL','Name','MimeType','SizeBytes','UploadSessionID','State','Created','Updated','Revision'],
  ActivityMeta:['ActivityID','TaskID','WorkMode','ReportNote','Created','Updated','Revision'],
  Reminders:['ReminderID','TaskID','ActivityID','Channel','ScheduledAt','State','ExternalEventID','Created','Updated','Revision'],
  ChangeLog:['ChangeID','EntityType','EntityID','OperationID','Action','BeforeJSON','AfterJSON','Created'],
  ReportExports:['ReportID','PeriodStart','PeriodEnd','ProfileRevision','SourceRevisionJSON','TemplateVersion','State','DriveFileID','Created','Updated','Revision'],
  Profile:['Key','Value','Updated','Revision'],
  AppConfig:['Key','Value','Updated','Revision'],
  SchemaMigrations:['MigrationID','Version','AppliedAt','SourceVersion','State']
});
const PROFILE_FIELDS = Object.freeze({
  fullName:160,employeeId:80,employmentStatus:100,rankGrade:100,position:200,unit:240,division:240,
  reviewerName:160,reviewerPosition:200,timeZone:32,reportMode:8,pageSize:8
});
function onOpen() {
  SpreadsheetApp.getUi().createMenu('E-Kinerja ASN').addItem('Siapkan salinan ini','setupInstallation').addItem('Periksa/migrasikan skema','migrateInstallationSchema').addItem('Buka E-Kinerja Harian','bukaAplikasi').addToUi();
}
function doGet() {
  return HtmlService.createHtmlOutput(APP_HTML).setTitle('E-Kinerja Harian ASN').addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}
function setupInstallation(){
  const active=SpreadsheetApp.getActiveSpreadsheet();
  if(!active) throw new Error('SETUP: Jalankan setup dari menu spreadsheet salinan atau editor script terikatnya.');
  const zone=active.getSpreadsheetTimeZone();
  if(!['Asia/Jakarta','Asia/Makassar','Asia/Jayapura'].includes(zone)) throw new Error('SETUP: Pilih zona waktu Jakarta, Makassar, atau Jayapura di setelan spreadsheet terlebih dahulu.');
  return withLock_(function(){
    coreSheetForBook_(active);
    const migration=migrateSchemaForBook_(active,false);
    PropertiesService.getScriptProperties().setProperty('INSTALLATION',JSON.stringify({scriptId:ScriptApp.getScriptId(),spreadsheetId:active.getId()}));
    return {version:APP_VERSION,configured:true,schema:migration};
  });
}
function book_() {
  let config;try{config=JSON.parse(PropertiesService.getScriptProperties().getProperty('INSTALLATION')||'null');}catch(e){}
  if(!config||config.scriptId!==ScriptApp.getScriptId()||!config.spreadsheetId) throw new Error('SETUP: Salinan ini belum dikonfigurasi. Jalankan Siapkan salinan ini dari spreadsheet Anda.');
  return SpreadsheetApp.openById(config.spreadsheetId);
}
function bukaAplikasi() {
  withLock_(function(){ sheet_(); });
  SpreadsheetApp.getUi().showModelessDialog(HtmlService.createHtmlOutput(APP_HTML).setWidth(1180).setHeight(780),'E-Kinerja Harian ASN');
}
function getDriveAuthorizationStatus(){
  const info=ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL),required=info.getAuthorizationStatus()===ScriptApp.AuthorizationStatus.REQUIRED;
  return {authorized:!required,authorizationUrl:required?String(info.getAuthorizationUrl()||''):''};
}
function withLock_(fn) {
  const lock=LockService.getScriptLock();
  if(!lock || !lock.tryLock(15000)) throw new Error('BUSY: Sedang ada penyimpanan lain. Coba lagi sebentar.');
  try{return fn();} finally{lock.releaseLock();}
}
function sameHeaders_(actual,expected){return JSON.stringify(actual)===JSON.stringify(expected);}
function schemaPlan_(book){
  const missing=[],issues=[];
  Object.keys(AUX_SCHEMAS).forEach(function(name){
    const sh=book.getSheetByName(name),expected=AUX_SCHEMAS[name];
    if(!sh){missing.push(name);return;}
    const actual=sh.getRange(1,1,1,expected.length).getValues()[0];
    if(!sameHeaders_(actual,expected)) issues.push(name+': header tidak sesuai');
  });
  return {schemaVersion:DATA_SCHEMA_VERSION,missing:missing,issues:issues,ready:!missing.length&&!issues.length};
}
function migrateSchemaForBook_(book,dryRun){
  const plan=schemaPlan_(book);
  if(plan.issues.length) throw new Error('SCHEMA: '+plan.issues.join('; ')+'. Migrasi dibatalkan sebelum menulis.');
  if(dryRun) return plan;
  const created=[];
  try{
    plan.missing.forEach(function(name){
      const headers=AUX_SCHEMAS[name],sh=book.insertSheet(name);created.push(sh);
      sh.getRange(1,1,1,headers.length).setNumberFormat('@').setValues([headers]).setBackground('#174e44').setFontColor('#ffffff').setFontWeight('bold');
      sh.setFrozenRows(1);sh.setColumnWidths(1,headers.length,140);
    });
    const journal=book.getSheetByName('SchemaMigrations'),last=journal.getLastRow();
    const versions=last<2?[]:journal.getRange(2,2,last-1,1).getValues().flat().map(Number);
    if(!versions.includes(DATA_SCHEMA_VERSION)){
      journal.getRange(last+1,1,1,5).setNumberFormat('@').setValues([['schema-'+DATA_SCHEMA_VERSION,String(DATA_SCHEMA_VERSION),new Date().toISOString(),APP_VERSION,'applied']]);
    }
    SpreadsheetApp.flush();
    return {schemaVersion:DATA_SCHEMA_VERSION,created:created.map(function(sh){return sh.getName();}),ready:true};
  }catch(error){
    const rollbackErrors=[];
    created.reverse().forEach(function(sh){try{book.deleteSheet(sh);}catch(rollbackError){rollbackErrors.push(sh.getName());}});
    if(rollbackErrors.length) throw new Error('SCHEMA: Migrasi gagal dan rollback tab '+rollbackErrors.join(', ')+' juga gagal. '+error.message);
    throw new Error('SCHEMA: Migrasi gagal; tab baru telah dibatalkan. '+error.message);
  }
}
function getSchemaStatus(){return schemaPlan_(book_());}
function migrateInstallationSchema(){return withLock_(function(){return migrateSchemaForBook_(book_(),false);});}
function profileSheet_(book){
  const sh=book.getSheetByName('Profile');
  if(!sh) throw new Error('SCHEMA: Tab Profile belum tersedia. Jalankan Periksa/migrasikan skema.');
  if(!sameHeaders_(sh.getRange(1,1,1,AUX_SCHEMAS.Profile.length).getValues()[0],AUX_SCHEMAS.Profile)) throw new Error('SCHEMA: Header Profile tidak sesuai.');
  return sh;
}
function readProfile_(sh){
  const result={version:0,values:{}},last=sh.getLastRow(),seen={};
  if(last<2) return result;
  sh.getRange(2,1,last-1,AUX_SCHEMAS.Profile.length).getValues().forEach(function(row,index){
    const key=String(row[0]||'');if(!key||!Object.prototype.hasOwnProperty.call(PROFILE_FIELDS,key))return;
    if(seen[key]) throw new Error('DATA: Kunci profil '+key+' duplikat pada baris '+(index+2)+'.');
    seen[key]=true;result.values[key]=String(row[1]||'');
    const revision=Number(row[3]);if(!Number.isInteger(revision)||revision<1)throw new Error('DATA: Revisi profil tidak valid.');
    result.version=Math.max(result.version,revision);
  });
  return result;
}
function normalizeProfile_(input){
  if(!input||typeof input!=='object')throw new Error('Profil tidak valid.');
  const values={};Object.keys(PROFILE_FIELDS).forEach(function(key){values[key]=text_(String(input[key]||''),PROFILE_FIELDS[key],'Profil '+key);});
  if(values.timeZone&&!['Asia/Jakarta','Asia/Makassar','Asia/Jayapura'].includes(values.timeZone))throw new Error('Zona waktu profil tidak valid.');
  if(values.reportMode&&values.reportMode!=='WFH')throw new Error('Mode laporan harus WFH.');
  if(values.pageSize&&!['A4','Letter'].includes(values.pageSize))throw new Error('Ukuran halaman tidak valid.');
  return values;
}
function getProfile(){
  const book=book_();
  if(!book.getSheetByName('Profile'))return withLock_(function(){const current=book_();if(!current.getSheetByName('Profile'))migrateSchemaForBook_(current,false);return readProfile_(profileSheet_(current));});
  return readProfile_(profileSheet_(book));
}
function saveProfile(input){
  const expected=Number(input&&input.version);if(!Number.isInteger(expected)||expected<0)throw new Error('Revisi profil tidak valid.');
  const values=normalizeProfile_(input);
  return withLock_(function(){
    const sh=profileSheet_(book_()),current=readProfile_(sh);
    if(current.version!==expected)throw new Error('Profil sudah berubah di sesi lain. Muat ulang sebelum menyimpan.');
    const revision=current.version+1,now=new Date().toISOString(),rows=Object.keys(PROFILE_FIELDS).map(function(key){return [key,"'"+values[key],now,String(revision)];});
    sh.getRange(2,1,rows.length,AUX_SCHEMAS.Profile.length).setNumberFormat('@').setValues(rows);SpreadsheetApp.flush();
    const saved=readProfile_(sh);if(saved.version!==revision)throw new Error('Baca balik profil belum sesuai.');return saved;
  });
}
function deleteProfile(expectedVersion){
  const expected=Number(expectedVersion);if(!Number.isInteger(expected)||expected<0)throw new Error('Revisi profil tidak valid.');
  const blank={version:expected};Object.keys(PROFILE_FIELDS).forEach(function(key){blank[key]='';});return saveProfile(blank);
}
function reportSheet_(book){
  const sh=book.getSheetByName('ReportExports');if(!sh)throw new Error('SCHEMA: Tab ReportExports belum tersedia.');
  if(!sameHeaders_(sh.getRange(1,1,1,AUX_SCHEMAS.ReportExports.length).getValues()[0],AUX_SCHEMAS.ReportExports))throw new Error('SCHEMA: Header ReportExports tidak sesuai.');return sh;
}
function requireReportProfile_(profile){
  ['fullName','position','unit','timeZone'].forEach(function(key){if(!profile.values[key])throw new Error('PROFIL: Lengkapi '+key+' sebelum membuat laporan WFH.');});
  if(profile.values.reportMode!=='WFH')throw new Error('PROFIL: Mode laporan harus WFH.');
}
function createReportSnapshot(input){
  if(!input||!Array.isArray(input.recordIds)||!input.recordIds.length||input.recordIds.length>200)throw new Error('LAPORAN: Pilih 1–200 kegiatan WFH.');
  const start=date_(input.start),end=date_(input.end);if(start>end)throw new Error('LAPORAN: Rentang tanggal terbalik.');
  const ids=input.recordIds.map(function(id){return text_(String(id),80,'ID kegiatan');});if(new Set(ids).size!==ids.length)throw new Error('LAPORAN: Pilihan kegiatan duplikat.');
  const expectedProfile=Number(input.profileVersion);if(!Number.isInteger(expectedProfile)||expectedProfile<1)throw new Error('LAPORAN: Profil belum dimuat atau disimpan.');
  return withLock_(function(){
    const book=book_(),profile=readProfile_(profileSheet_(book));requireReportProfile_(profile);if(profile.version!==expectedProfile)throw new Error('LAPORAN: Profil berubah. Muat ulang pratinjau.');
    const byId=new Map(all_(coreSheetForBook_(book)).map(function(row){return [row.id,row];})),rows=ids.map(function(id){const row=byId.get(id);if(!row)throw new Error('LAPORAN: Kegiatan '+id+' tidak ditemukan.');if(row.date<start||row.date>end)throw new Error('LAPORAN: Kegiatan berada di luar periode.');return {id:row.id,date:row.date,activity:row.activity.replace(/^\[P[1-4]\]\s*/,''),result:row.result,evidence:row.evidence,followup:row.followup,version:row.version};}).sort(function(a,b){return a.date.localeCompare(b.date)||a.id.localeCompare(b.id);});
    const now=new Date().toISOString(),reportId='report-'+Utilities.getUuid(),snapshot={reportId:reportId,kind:'WFH',period:{start:start,end:end},profileVersion:profile.version,profile:profile.values,rows:rows,created:now};
    const json=JSON.stringify(snapshot);if(json.length>45000)throw new Error('LAPORAN: Snapshot terlalu besar. Kurangi jumlah kegiatan.');
    const sh=reportSheet_(book),row=sh.getLastRow()+1,sourceJSON="'"+json;
    sh.getRange(row,1,1,11).setNumberFormat('@').setValues([[reportId,start,end,String(profile.version),sourceJSON,'html-wfh-v1','snapshot','',now,now,'1']]);SpreadsheetApp.flush();return snapshot;
  });
}
function confirmReportPreview(reportId,expectedRevision){
  reportId=text_(String(reportId),120,'Report ID');const expected=Number(expectedRevision||1);
  return withLock_(function(){const book=book_(),sh=reportSheet_(book),last=sh.getLastRow();if(last<2)throw new Error('LAPORAN: Snapshot tidak ditemukan.');const values=sh.getRange(2,1,last-1,11).getValues();const index=values.findIndex(function(row){return String(row[0])===reportId;});if(index<0)throw new Error('LAPORAN: Snapshot tidak ditemukan.');const row=values[index],revision=Number(row[10]);if(revision!==expected)throw new Error('LAPORAN: Snapshot sudah berubah.');const snapshot=JSON.parse(String(row[4]));const profile=readProfile_(profileSheet_(book));if(profile.version!==snapshot.profileVersion)throw new Error('LAPORAN: Profil berubah setelah snapshot. Buat ulang pratinjau.');const current=new Map(all_(coreSheetForBook_(book)).map(function(item){return [item.id,item.version];}));if(snapshot.rows.some(function(item){return current.get(item.id)!==item.version;}))throw new Error('LAPORAN: Kegiatan berubah setelah snapshot. Buat ulang pratinjau.');row[6]='previewed';row[9]=new Date().toISOString();row[10]=String(revision+1);sh.getRange(index+2,1,1,11).setNumberFormat('@').setValues([row]);SpreadsheetApp.flush();return {reportId:reportId,state:'previewed',revision:revision+1,snapshot:snapshot};});
}
function reportEntry_(sh,reportId){
  const last=sh.getLastRow();if(last<2)throw new Error('LAPORAN: Snapshot tidak ditemukan.');
  const values=sh.getRange(2,1,last-1,AUX_SCHEMAS.ReportExports.length).getValues(),index=values.findIndex(function(row){return String(row[0])===reportId;});
  if(index<0)throw new Error('LAPORAN: Snapshot tidak ditemukan.');
  return {index:index+2,row:values[index]};
}
function verifyReportSnapshot_(book,snapshot){
  const profile=readProfile_(profileSheet_(book));
  if(profile.version!==snapshot.profileVersion)throw new Error('LAPORAN: Profil berubah setelah pratinjau. Buat ulang pratinjau.');
  const current=new Map(all_(coreSheetForBook_(book)).map(function(item){return [item.id,item.version];}));
  if(snapshot.rows.some(function(item){return current.get(item.id)!==item.version;}))throw new Error('LAPORAN: Kegiatan berubah setelah pratinjau. Buat ulang pratinjau.');
}
function reportExportResult_(reportId,revision,stored){
  let ids;try{ids=typeof stored==='string'?JSON.parse(stored):stored;}catch(error){throw new Error('LAPORAN: Metadata file ekspor rusak.');}
  if(!ids||!/^[a-zA-Z0-9_-]+$/.test(String(ids.documentId||''))||!/^[a-zA-Z0-9_-]+$/.test(String(ids.pdfId||'')))throw new Error('LAPORAN: Metadata file ekspor tidak lengkap.');
  return {reportId:reportId,state:'exported',revision:revision,documentId:String(ids.documentId),pdfId:String(ids.pdfId),pdfValidation:ids.pdfValidation||null,documentUrl:'https://docs.google.com/document/d/'+encodeURIComponent(ids.documentId)+'/edit',docxUrl:'https://docs.google.com/document/d/'+encodeURIComponent(ids.documentId)+'/export?format=docx',pdfUrl:'https://drive.google.com/uc?export=download&id='+encodeURIComponent(ids.pdfId)};
}
function reportDateId_(date){
  const days=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'],months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],d=new Date(date+'T12:00:00Z');
  return days[d.getUTCDay()]+', '+d.getUTCDate()+' '+months[d.getUTCMonth()]+' '+d.getUTCFullYear();
}
function reportFolder_(){
  const properties=PropertiesService.getScriptProperties(),id=String(properties.getProperty(REPORT_FOLDER_PROPERTY)||'').trim();
  if(id){try{return DriveApp.getFolderById(id);}catch(error){}}
  const folder=DriveApp.createFolder('Laporan WFH E-Kinerja');properties.setProperty(REPORT_FOLDER_PROPERTY,folder.getId());return folder;
}
function singleFileByName_(folder,name){
  const files=folder.getFilesByName(name);if(!files.hasNext())return null;const file=files.next();if(files.hasNext())throw new Error('LAPORAN: Ditemukan file ekspor duplikat bernama '+name+'.');return file;
}
function validatePdfFile_(file){
  const blob=file.getBlob(),mime=String(blob.getContentType()||''),bytes=blob.getBytes(),size=Number(file.getSize());
  if(mime!=='application/pdf')throw new Error('PDF hasil ekspor memiliki MIME yang tidak valid.');
  if(!Number.isFinite(size)||size<100||bytes.length<5)throw new Error('PDF hasil ekspor kosong atau terlalu kecil.');
  const header=bytes.slice(0,5).map(function(value){return (Number(value)+256)%256;});
  if(header.join(',')!=='37,80,68,70,45')throw new Error('PDF hasil ekspor tidak memiliki signature %PDF-.');
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes),sha256=digest.map(function(value){return ((Number(value)+256)%256).toString(16).padStart(2,'0');}).join('');
  return {verified:true,mimeType:mime,sizeBytes:size,signature:'%PDF-',sha256:sha256};
}
function styleText_(element,size,bold){const text=element.editAsText().setFontFamily('Arial').setFontSize(size).setForegroundColor('#000000');if(bold)text.setBold(true);return element;}
function createReportFiles_(snapshot){
  const suffix=String(snapshot.reportId).replace(/[^a-zA-Z0-9]/g,'').slice(-8),safeName=String(snapshot.profile.fullName||'ASN').replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim(),baseName='Laporan WFH '+snapshot.period.start+' s.d. '+snapshot.period.end+' - '+safeName+' ['+suffix+']',pdfName=baseName+'.pdf',folder=reportFolder_();
  let docFile=singleFileByName_(folder,baseName),pdfFile=singleFileByName_(folder,pdfName),createdDoc=false,createdPdf=false;
  try{
    if(!docFile){
      const doc=DocumentApp.create(baseName),body=doc.getBody(),letter=snapshot.profile.pageSize!=='A4';createdDoc=true;
      body.setPageWidth(letter?612:595).setPageHeight(letter?792:842).setMarginTop(72).setMarginBottom(72).setMarginLeft(72).setMarginRight(72);
      styleText_(body.appendParagraph('LAPORAN HARIAN PELAKSANAAN WORK FROM HOME (WFH)').setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingAfter(12),12,true);
      const identity=[['Nama',':',snapshot.profile.fullName||'—'],['NIP',':',snapshot.profile.employeeId||'—']];
      if(snapshot.profile.employmentStatus)identity.push(['Status Kepegawaian',':',snapshot.profile.employmentStatus]);
      identity.push(['Pangkat/Golongan',':',snapshot.profile.rankGrade||'—'],['Jabatan',':',snapshot.profile.position||'—'],['Unit Kerja',':',snapshot.profile.unit||'—'],['Bagian/Korwas',':',snapshot.profile.division||'—'],['Periode',':',snapshot.period.start+' s.d. '+snapshot.period.end]);
      const identityTable=body.appendTable(identity).setBorderWidth(0);for(let i=0;i<identityTable.getNumRows();i++){styleText_(identityTable.getRow(i).getCell(0),9,true);styleText_(identityTable.getRow(i).getCell(1),9,false);styleText_(identityTable.getRow(i).getCell(2),9,false);}
      body.appendParagraph('').setSpacingAfter(4);
      const rows=[['No','Hari/Tanggal','Uraian Kegiatan','Hasil Pekerjaan','Keterangan']];snapshot.rows.forEach(function(row,index){rows.push([String(index+1),reportDateId_(row.date),row.activity,row.result,[row.followup,row.evidence].filter(Boolean).join('\n')||'—']);});
      const activityTable=body.appendTable(rows).setBorderColor('#444444').setBorderWidth(1);for(let i=0;i<activityTable.getNumRows();i++){const tr=activityTable.getRow(i);for(let j=0;j<tr.getNumCells();j++){const cell=tr.getCell(j);styleText_(cell,i===0?8:9,i===0);if(i===0)cell.setBackgroundColor('#E8EEF7');}}
      activityTable.getRow(0).getCell(0).setWidth(28);activityTable.getRow(0).getCell(1).setWidth(95);activityTable.getRow(0).getCell(2).setWidth(155);activityTable.getRow(0).getCell(3).setWidth(135);activityTable.getRow(0).getCell(4).setWidth(85);
      body.appendParagraph('').setSpacingAfter(8);
      const endDate=reportDateId_(snapshot.period.end).replace(/^[^,]+,\s*/,''),signatures=body.appendTable([['Mengetahui / Menyetujui,','Jakarta, '+endDate],[snapshot.profile.reviewerPosition||'Atasan Langsung',snapshot.profile.position||'Pegawai yang Melaksanakan WFH'],['\n\n\n','\n\n\n'],['('+(snapshot.profile.reviewerName||'..................................................')+')','('+(snapshot.profile.fullName||'..................................................')+')'],['',snapshot.profile.employeeId?'NIP. '+snapshot.profile.employeeId:'']]).setBorderWidth(0);
      for(let i=0;i<signatures.getNumRows();i++)for(let j=0;j<2;j++)styleText_(signatures.getRow(i).getCell(j),9,i===3);
      doc.saveAndClose();docFile=DriveApp.getFileById(doc.getId());docFile.moveTo(folder).setDescription('Dibuat dari snapshot '+snapshot.reportId+' oleh E-Kinerja Harian ASN.');
    }
    if(!pdfFile){const blob=docFile.getAs(MimeType.PDF).setName(pdfName);pdfFile=folder.createFile(blob).setDescription('PDF dari snapshot '+snapshot.reportId+' oleh E-Kinerja Harian ASN.');createdPdf=true;}
    const pdfValidation=validatePdfFile_(pdfFile);
    return {documentId:docFile.getId(),pdfId:pdfFile.getId(),pdfValidation:pdfValidation};
  }catch(error){
    if(createdPdf&&pdfFile)try{pdfFile.setTrashed(true);}catch(pdfCleanupError){}
    if(createdDoc&&docFile)try{docFile.setTrashed(true);}catch(docCleanupError){}
    throw error;
  }
}
function exportWfhReport(reportId,expectedRevision){
  reportId=text_(String(reportId),120,'Report ID');const expected=Number(expectedRevision);if(!Number.isInteger(expected)||expected<2)throw new Error('LAPORAN: Revisi pratinjau tidak valid.');
  const reservation=withLock_(function(){
    const book=book_(),sh=reportSheet_(book),entry=reportEntry_(sh,reportId),row=entry.row,revision=Number(row[10]),state=String(row[6]||''),snapshot=JSON.parse(String(row[4]));
    if(state==='exported'&&row[7])return {existing:true,result:reportExportResult_(reportId,revision,String(row[7]))};
    if(state==='exporting'){
      const age=Date.now()-new Date(String(row[9])).getTime();if(Number.isFinite(age)&&age<120000)throw new Error('BUSY: Ekspor laporan sedang berjalan. Coba lagi sebentar.');
    }else if(state!=='previewed')throw new Error('LAPORAN: Pratinjau belum dikonfirmasi.');
    if(state!=='exporting'&&revision!==expected)throw new Error('LAPORAN: Revisi pratinjau sudah berubah.');verifyReportSnapshot_(book,snapshot);
    const reservedRevision=state==='exporting'?revision:revision+1;if(state!=='exporting'){row[6]='exporting';row[9]=new Date().toISOString();row[10]=String(reservedRevision);sh.getRange(entry.index,1,1,11).setNumberFormat('@').setValues([row]);SpreadsheetApp.flush();}
    return {existing:false,snapshot:snapshot,reservedRevision:reservedRevision};
  });
  if(reservation.existing)return reservation.result;
  let files;try{files=createReportFiles_(reservation.snapshot);}catch(error){
    withLock_(function(){const sh=reportSheet_(book_()),entry=reportEntry_(sh,reportId),row=entry.row;if(String(row[6])==='exporting'&&Number(row[10])===reservation.reservedRevision){row[6]='previewed';row[9]=new Date().toISOString();row[10]=String(expected);sh.getRange(entry.index,1,1,11).setNumberFormat('@').setValues([row]);SpreadsheetApp.flush();}});
    throw new Error('LAPORAN: Google Docs/PDF gagal dibuat. '+error.message);
  }
  return withLock_(function(){
    const book=book_(),sh=reportSheet_(book),entry=reportEntry_(sh,reportId),row=entry.row;if(String(row[6])==='exported'&&row[7])return reportExportResult_(reportId,Number(row[10]),String(row[7]));if(String(row[6])!=='exporting'||Number(row[10])!==reservation.reservedRevision)throw new Error('LAPORAN: Reservasi ekspor berubah. Periksa Drive sebelum mencoba lagi.');verifyReportSnapshot_(book,reservation.snapshot);
    row[6]='exported';row[7]="'"+JSON.stringify(files);row[9]=new Date().toISOString();row[10]=String(reservation.reservedRevision+1);sh.getRange(entry.index,1,1,11).setNumberFormat('@').setValues([row]);SpreadsheetApp.flush();return reportExportResult_(reportId,reservation.reservedRevision+1,files);
  });
}
function coreSheetForBook_(book){
  let sh=book.getSheetByName(TAB_NAME);
  if(!sh){
    sh=book.insertSheet(TAB_NAME);
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]).setBackground('#174e44').setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1); sh.setColumnWidths(1,HEADERS.length,135);
    sh.setColumnWidth(3,330);sh.setColumnWidth(4,300);sh.setColumnWidth(5,240);sh.setColumnWidth(7,260);
  }
  if(!sameHeaders_(sh.getRange(1,1,1,HEADERS.length).getValues()[0],HEADERS))
    throw new Error('Kolom Catatan Harian berubah. Pulihkan judul kolom sebelum menyimpan.');
  return sh;
}
function sheet_(){return coreSheetForBook_(book_());}
function text_(v,max,label){
  if(typeof v!=='string') throw new Error(label+' harus berupa teks.');
  const s=v.trim();if(s.length>max) throw new Error(label+' terlalu panjang.');return s;
}
function date_(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Tanggal tidak valid.');
  const d=new Date(v+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v||v<'2000-01-01'||v>'2100-12-31') throw new Error('Tanggal tidak valid.');
  return v;
}
function record_(r,zone){return {id:String(r[0]),date:r[1] instanceof Date?Utilities.formatDate(r[1],zone,'yyyy-MM-dd'):String(r[1]),activity:String(r[2]),result:String(r[3]),evidence:String(r[4]),status:String(r[5]),followup:String(r[6]),created:r[7] instanceof Date?r[7].toISOString():String(r[7]),updated:r[8] instanceof Date?r[8].toISOString():String(r[8]),version:Number(r[9])};}
function all_(sh){
  const last=sh.getLastRow();if(last<2)return [];
  const zone=sh.getParent().getSpreadsheetTimeZone(),seen=new Set();
  return sh.getRange(2,1,last-1,HEADERS.length).getValues().map((v,i)=>{
    if(!v[0]){if(v.some(x=>x!==''))throw new Error('DATA: Baris '+(i+2)+' berisi data tanpa ID.');return null;}
    const r=record_(v,zone);if(seen.has(r.id))throw new Error('DATA: ID catatan duplikat. Perbaiki data sumber terlebih dahulu.');seen.add(r.id);
    date_(r.date);if(!Number.isInteger(r.version)||r.version<1||!['Selesai','Berjalan','Menunggu'].includes(r.status))throw new Error('DATA: Revisi/status baris '+(i+2)+' tidak valid.');
    Object.defineProperty(r,'_row',{value:i+2});return r;
  }).filter(Boolean);
}
function getRecord(id){return all_(sheet_()).find(function(r){return r.id===id;})||null;}
function getSnapshot(start,end){
  start=date_(start);end=date_(end);if(start>end)throw new Error('Rentang tanggal terbalik.');
  const sh=sheet_(),book=sh.getParent(),zone=book.getSpreadsheetTimeZone();
  if(!['Asia/Jakarta','Asia/Makassar','Asia/Jayapura'].includes(zone))throw new Error('SETUP: Zona waktu spreadsheet harus Jakarta, Makassar, atau Jayapura.');
  const today=Utilities.formatDate(new Date(),zone,'yyyy-MM-dd'),all=all_(sh);
  return {version:APP_VERSION,timeZone:zone,today,spreadsheetUrl:book.getUrl(),records:all.filter(function(r){return r.date>=start&&r.date<=end;}),todayRecords:all.filter(function(r){return r.date===today;}),activeDates:[...new Set(all.filter(function(r){return r.date<=today;}).map(function(r){return r.date;}))]};
}
function getRecords(start,end){
  start=date_(start);end=date_(end);if(start>end) throw new Error('Rentang tanggal terbalik.');
  return all_(sheet_()).filter(function(r){return r.date>=start&&r.date<=end;}).sort(function(a,b){return a.date.localeCompare(b.date)||a.created.localeCompare(b.created);});
}
function distributionInfo_(operational,id){
    const unavailable=function(reason){return {ready:false,copyUrl:'',reason:reason};};
    if(!id) return unavailable('Master template publik belum dikonfigurasi. Spreadsheet operasional tidak akan ditawarkan sebagai template.');
    if(id===operational.getId()) return unavailable('Master template harus terpisah dari spreadsheet operasional.');
    let template;
    try{template=SpreadsheetApp.openById(id);}catch(error){return unavailable('Master template tidak dapat diakses atau belum tersedia.');}
    const sheets=template.getSheets();
    if(sheets.length!==1) return unavailable('Master template harus hanya memiliki satu tab Catatan Harian.');
    const sh=sheets[0];
    if(sh.getName()!==TAB_NAME||sh.isSheetHidden()) return unavailable('Tab master template tidak sesuai atau disembunyikan.');
    if(sh.getLastRow()>1) return unavailable('Master template masih berisi baris data. Bersihkan sebelum dibagikan.');
    if(JSON.stringify(sh.getRange(1,1,1,HEADERS.length).getValues()[0])!==JSON.stringify(HEADERS)) return unavailable('Header master template tidak sesuai.');
    if(template.getNamedRanges().length) return unavailable('Master template masih memiliki named range.');
    // Reject abnormally large templates before inspecting notes so a hostile or
    // accidentally expanded grid cannot consume the Apps Script execution window.
    if(sh.getMaxRows()>2000||sh.getMaxColumns()>100) return unavailable('Ukuran master template tidak wajar. Pangkas baris dan kolom kosong sebelum dibagikan.');
    const notes=sh.getRange(1,1,Math.max(1,sh.getMaxRows()),Math.max(HEADERS.length,sh.getMaxColumns())).getNotes();
    if(notes.some(row=>row.some(Boolean))) return unavailable('Master template masih memiliki catatan sel.');
    return {ready:true,copyUrl:'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(id)+'/copy',reason:''};
}
function getDistributionInfo(){
  return withLock_(function(){
    const operational=book_(),id=String(PropertiesService.getScriptProperties().getProperty(PUBLIC_TEMPLATE_PROPERTY)||'').trim();
    return distributionInfo_(operational,id);
  });
}
function ensureDistributionTemplate(){
  return withLock_(function(){
    const operational=book_(),properties=PropertiesService.getScriptProperties(),existing=String(properties.getProperty(PUBLIC_TEMPLATE_PROPERTY)||'').trim();
    if(existing)return distributionInfo_(operational,existing);
    let template=null;
    try{
      template=SpreadsheetApp.create('Master Template E-Kinerja Harian ASN');
      template.setSpreadsheetTimeZone(operational.getSpreadsheetTimeZone());
      const sh=template.getSheets()[0];sh.setName(TAB_NAME);
      sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]).setBackground('#174e44').setFontColor('#ffffff').setFontWeight('bold');
      sh.setFrozenRows(1);sh.setColumnWidths(1,HEADERS.length,135);sh.setColumnWidth(3,330);sh.setColumnWidth(4,300);sh.setColumnWidth(5,240);sh.setColumnWidth(7,260);
      SpreadsheetApp.flush();
      DriveApp.getFileById(template.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
      properties.setProperty(PUBLIC_TEMPLATE_PROPERTY,template.getId());
      const verified=distributionInfo_(operational,template.getId());if(!verified.ready)throw new Error(verified.reason);return verified;
    }catch(error){
      if(template){try{DriveApp.getFileById(template.getId()).setTrashed(true);}catch(cleanupError){}}
      throw new Error('TEMPLATE: Master bersih belum dapat dibuat otomatis. Periksa izin Google Drive atau kebijakan berbagi akun. '+error.message);
    }
  });
}
function attachmentSheet_(book){
  const sh=book.getSheetByName('Attachments');
  if(!sh||!sameHeaders_(sh.getRange(1,1,1,AUX_SCHEMAS.Attachments.length).getValues()[0],AUX_SCHEMAS.Attachments)) throw new Error('SCHEMA: Tab Attachments belum siap. Jalankan Periksa/migrasikan skema.');
  return sh;
}
function attachment_(row,index){
  const item={attachmentId:String(row[0]),activityId:String(row[1]),taskId:String(row[2]),fileId:String(row[3]),url:String(row[4]),name:String(row[5]),mimeType:String(row[6]),sizeBytes:Number(row[7]),uploadSessionId:String(row[8]),state:String(row[9]),created:String(row[10]),updated:String(row[11]),revision:Number(row[12])};
  if(index)Object.defineProperty(item,'_row',{value:index});return item;
}
function attachments_(sh){
  const last=sh.getLastRow(),ids=new Set(),sessions=new Set();if(last<2)return [];
  return sh.getRange(2,1,last-1,AUX_SCHEMAS.Attachments.length).getValues().map(function(row,i){
    if(!row[0]){if(row.some(function(v){return v!=='';}))throw new Error('ATTACHMENT: Baris '+(i+2)+' tidak memiliki ID.');return null;}
    const item=attachment_(row,i+2);if(ids.has(item.attachmentId)||sessions.has(item.uploadSessionId))throw new Error('ATTACHMENT: ID atau sesi upload duplikat.');ids.add(item.attachmentId);sessions.add(item.uploadSessionId);return item;
  }).filter(Boolean);
}
function writeAttachment_(sh,item){
  const values=[item.attachmentId,item.activityId,item.taskId||'',item.fileId||'',item.url||'',item.name,item.mimeType,String(item.sizeBytes),item.uploadSessionId,item.state,item.created,item.updated,String(item.revision)];
  sh.getRange(item._row,1,1,values.length).setNumberFormat('@').setValues([values.map(function(v){return "'"+v;})]);
}
function attachmentPublic_(item){return {attachmentId:item.attachmentId,activityId:item.activityId,fileId:item.fileId,url:item.url,name:item.name,mimeType:item.mimeType,sizeBytes:item.sizeBytes,uploadSessionId:item.uploadSessionId,state:item.state,created:item.created,updated:item.updated,revision:item.revision};}
function attachmentName_(value){
  const name=text_(value,120,'Nama file').replace(/[\x00-\x1f\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();if(!name)throw new Error('Nama file tidak valid.');return name;
}
function attachmentType_(name,mime){
  const match=name.toLowerCase().match(/\.([a-z0-9]+)$/),ext=match?match[1]:'',canonical=ATTACHMENT_TYPES[ext];if(!canonical)throw new Error('ATTACHMENT: Format harus PDF, DOCX, XLSX, JPG, JPEG, atau PNG.');
  mime=String(mime||'').toLowerCase();if(mime&&mime!=='application/octet-stream'&&mime!==canonical)throw new Error('ATTACHMENT: Tipe file tidak sesuai dengan ekstensi.');return canonical;
}
function attachmentMagic_(bytes,mime){
  const head=bytes.slice(0,5).map(function(v){return (v+256)%256;});
  const ok=mime==='application/pdf'?head[0]===37&&head[1]===80&&head[2]===68&&head[3]===70&&head[4]===45:mime==='image/jpeg'?head[0]===255&&head[1]===216&&head[2]===255:mime==='image/png'?head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71:mime.indexOf('openxmlformats')>-1?head[0]===80&&head[1]===75&&head[2]===3&&head[3]===4:false;
  if(!ok)throw new Error('ATTACHMENT: Isi file tidak cocok dengan format yang dipilih.');
}
function attachmentFolder_(create){
  const props=PropertiesService.getScriptProperties(),id=String(props.getProperty(ATTACHMENT_FOLDER_PROPERTY)||'').trim();
  if(id){try{const folder=DriveApp.getFolderById(id);if(!folder.isTrashed())return folder;}catch(error){}}
  if(!create)return null;
  const name='Bukti E-Kinerja '+ScriptApp.getScriptId().slice(-10),matches=DriveApp.getFoldersByName(name),folder=matches.hasNext()?matches.next():DriveApp.createFolder(name);props.setProperty(ATTACHMENT_FOLDER_PROPERTY,folder.getId());return folder;
}
function attachmentFile_(folder,item){
  if(item.fileId){try{return DriveApp.getFileById(item.fileId);}catch(error){}}
  const files=folder.getFilesByName(item._storedName||('EKIN-'+item.uploadSessionId+'--'+item.name));return files.hasNext()?files.next():null;
}
function attachmentEntryBySession_(sh,sessionId){const item=attachments_(sh).find(function(x){return x.uploadSessionId===sessionId;});if(!item)throw new Error('ATTACHMENT: Sesi upload tidak ditemukan.');item._storedName='EKIN-'+item.uploadSessionId+'--'+item.name;return item;}
function updateActivityEvidence_(book,item,expectedVersion){
  const core=coreSheetForBook_(book),record=all_(core).find(function(r){return r.id===item.activityId;});if(!record)throw new Error('ATTACHMENT: Kegiatan tujuan tidak ditemukan.');
  if(record.version!==expectedVersion)throw new Error('CONFLICT_UPLOAD: File sudah ada di Drive, tetapi kegiatan berubah di sesi lain. Muat ulang lalu pulihkan unggahan.');
  const lines=record.evidence.split(/\r?\n/).map(function(v){return v.trim();}).filter(Boolean);if(!lines.includes(item.url))lines.push(item.url);const evidence=lines.join('\n');if(evidence.length>1500)throw new Error('ATTACHMENT: Kolom Bukti tidak cukup untuk tautan baru.');
  if(evidence!==record.evidence){record.evidence=evidence;record.updated=new Date().toISOString();record.version++;const values=[record.id,record.date,record.activity,record.result,record.evidence,record.status,record.followup,record.created,record.updated,String(record.version)];core.getRange(record._row,1,1,HEADERS.length).setNumberFormat('@').setValues([values.map(function(v){return "'"+v;})]).setWrap(true).setVerticalAlignment('top');}
  return record;
}
function finalizeAttachment_(sessionId,expectedActivityVersion,file){
  return withLock_(function(){
    const book=book_(),sh=attachmentSheet_(book),item=attachmentEntryBySession_(sh,sessionId);if(item.state==='linked')return {attachment:attachmentPublic_(item),record:getRecord(item.activityId)};if(item.state==='detached')throw new Error('ATTACHMENT: Lampiran sudah dilepas.');
    item.fileId=file.getId();item.url=file.getUrl();item.state='uploaded';item.updated=new Date().toISOString();item.revision++;writeAttachment_(sh,item);SpreadsheetApp.flush();
    const record=updateActivityEvidence_(book,item,expectedActivityVersion);item.state='linked';item.updated=new Date().toISOString();item.revision++;writeAttachment_(sh,item);SpreadsheetApp.flush();return {attachment:attachmentPublic_(item),record:record};
  });
}
function getAttachments(activityId){
  activityId=text_(activityId,80,'ID kegiatan');if(!getRecord(activityId))throw new Error('ATTACHMENT: Kegiatan tidak ditemukan.');return attachments_(attachmentSheet_(book_())).filter(function(x){return x.activityId===activityId&&x.state!=='detached';}).map(attachmentPublic_);
}
function uploadAttachment(input){
  if(!input||typeof input!=='object')throw new Error('ATTACHMENT: Isian upload tidak valid.');
  const activityId=text_(input.activityId,80,'ID kegiatan'),sessionId=text_(input.uploadSessionId,80,'ID sesi upload'),name=attachmentName_(String(input.name||'')),mime=attachmentType_(name,input.mimeType),size=Number(input.sizeBytes),expected=Number(input.activityRevision);
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(activityId)||!/^[a-zA-Z0-9-]{8,80}$/.test(sessionId))throw new Error('ATTACHMENT: ID tidak valid.');if(!Number.isInteger(size)||size<1||size>ATTACHMENT_MAX_BYTES)throw new Error('ATTACHMENT: Ukuran file harus 1 byte sampai 10 MB.');if(!Number.isInteger(expected)||expected<1)throw new Error('ATTACHMENT: Revisi kegiatan tidak valid.');
  const reserved=withLock_(function(){
    const book=book_(),core=coreSheetForBook_(book),record=all_(core).find(function(r){return r.id===activityId;});if(!record)throw new Error('ATTACHMENT: Simpan kegiatan sebelum mengunggah file.');
    attachmentFolder_(true);
    const sh=attachmentSheet_(book),all=attachments_(sh),existing=all.find(function(x){return x.uploadSessionId===sessionId;});
    if(existing){
      if(existing.activityId!==activityId||existing.name!==name||existing.mimeType!==mime||existing.sizeBytes!==size)throw new Error('ATTACHMENT: ID sesi pernah dipakai untuk file lain.');
      if(existing.state==='linked'||existing.state==='detached')return existing;
      if(existing.state==='uploading'&&Date.now()-Date.parse(existing.updated)<ATTACHMENT_CLAIM_MS)throw new Error('BUSY_UPLOAD: Unggahan file ini masih diproses. Tunggu sebentar lalu pulihkan.');
      existing.state='uploading';existing.updated=new Date().toISOString();existing.revision++;writeAttachment_(sh,existing);SpreadsheetApp.flush();return existing;
    }
    if(record.version!==expected)throw new Error('ATTACHMENT: Kegiatan berubah di sesi lain. Muat ulang sebelum mengunggah.');
    if(all.filter(function(x){return x.activityId===activityId&&['pending','uploading','uploaded','linked'].includes(x.state);}).length>=ATTACHMENT_MAX_PER_ACTIVITY)throw new Error('ATTACHMENT: Maksimal 5 file per kegiatan.');
    const now=new Date().toISOString(),item={attachmentId:'att-'+Utilities.getUuid(),activityId:activityId,taskId:'',fileId:'',url:'',name:name,mimeType:mime,sizeBytes:size,uploadSessionId:sessionId,state:'uploading',created:now,updated:now,revision:1};Object.defineProperty(item,'_row',{value:sh.getLastRow()+1});writeAttachment_(sh,item);SpreadsheetApp.flush();return item;
  });
  if(reserved.state==='linked')return {attachment:attachmentPublic_(reserved),record:getRecord(activityId)};
  if(reserved.state==='detached')throw new Error('ATTACHMENT: Lampiran sudah dilepas.');
  const folder=attachmentFolder_(true);reserved._storedName='EKIN-'+sessionId+'--'+name;let file=attachmentFile_(folder,reserved);
  if(!file){
    try{const encoded=String(input.dataBase64||'');if(!encoded)throw new Error('Data file tidak tersedia untuk melanjutkan upload.');const bytes=Utilities.base64Decode(encoded);if(bytes.length!==size)throw new Error('Ukuran file berubah selama upload.');attachmentMagic_(bytes,mime);file=folder.createFile(Utilities.newBlob(bytes,mime,reserved._storedName));}
    catch(error){withLock_(function(){const sh=attachmentSheet_(book_()),item=attachmentEntryBySession_(sh,sessionId);if(!item.fileId&&item.state!=='linked'){item.state='failed';item.updated=new Date().toISOString();item.revision++;writeAttachment_(sh,item);SpreadsheetApp.flush();}});throw new Error('ATTACHMENT: Upload gagal. '+error.message);}
  }
  return finalizeAttachment_(sessionId,expected,file);
}
function recoverAttachment(uploadSessionId,activityRevision){
  uploadSessionId=text_(uploadSessionId,80,'ID sesi upload');const expected=Number(activityRevision);if(!Number.isInteger(expected)||expected<1)throw new Error('ATTACHMENT: Revisi kegiatan tidak valid.');
  const sh=attachmentSheet_(book_()),item=attachmentEntryBySession_(sh,uploadSessionId);if(item.state==='linked')return {attachment:attachmentPublic_(item),record:getRecord(item.activityId)};if(item.state==='detached')throw new Error('ATTACHMENT: Lampiran sudah dilepas.');const folder=attachmentFolder_(false),file=folder?attachmentFile_(folder,item):null;if(!file){if(item.state==='uploading'&&Date.now()-Date.parse(item.updated)<ATTACHMENT_CLAIM_MS)return {attachment:attachmentPublic_(item),record:getRecord(item.activityId),recovered:false};withLock_(function(){const current=attachmentEntryBySession_(attachmentSheet_(book_()),uploadSessionId);if(current.state==='linked')return;if(current.state==='uploading'&&Date.now()-Date.parse(current.updated)<ATTACHMENT_CLAIM_MS)return;current.state='failed';current.updated=new Date().toISOString();current.revision++;writeAttachment_(attachmentSheet_(book_()),current);SpreadsheetApp.flush();});return {attachment:attachmentPublic_(attachmentEntryBySession_(attachmentSheet_(book_()),uploadSessionId)),record:getRecord(item.activityId),recovered:false};}const result=finalizeAttachment_(uploadSessionId,expected,file);result.recovered=true;return result;
}
function detachAttachment(attachmentId,expectedAttachmentRevision,expectedActivityRevision){
  attachmentId=text_(attachmentId,100,'ID lampiran');const attachmentRevision=Number(expectedAttachmentRevision),activityRevision=Number(expectedActivityRevision);if(!Number.isInteger(attachmentRevision)||!Number.isInteger(activityRevision))throw new Error('ATTACHMENT: Revisi tidak valid.');
  return withLock_(function(){
    const book=book_(),sh=attachmentSheet_(book),item=attachments_(sh).find(function(x){return x.attachmentId===attachmentId;});if(!item)throw new Error('ATTACHMENT: Lampiran tidak ditemukan.');if(item.state==='detached')return {attachment:attachmentPublic_(item),record:getRecord(item.activityId)};if(item.revision!==attachmentRevision)throw new Error('ATTACHMENT: Lampiran berubah di sesi lain. Muat ulang.');
    const core=coreSheetForBook_(book),record=all_(core).find(function(r){return r.id===item.activityId;});if(!record||record.version!==activityRevision)throw new Error('ATTACHMENT: Kegiatan berubah di sesi lain. Muat ulang.');const evidence=record.evidence.split(/\r?\n/).map(function(v){return v.trim();}).filter(function(v){return v&&v!==item.url;}).join('\n');
    if(evidence!==record.evidence){record.evidence=evidence;record.updated=new Date().toISOString();record.version++;const values=[record.id,record.date,record.activity,record.result,record.evidence,record.status,record.followup,record.created,record.updated,String(record.version)];core.getRange(record._row,1,1,HEADERS.length).setNumberFormat('@').setValues([values.map(function(v){return "'"+v;})]).setWrap(true).setVerticalAlignment('top');}
    item.state='detached';item.updated=new Date().toISOString();item.revision++;writeAttachment_(sh,item);SpreadsheetApp.flush();return {attachment:attachmentPublic_(item),record:record};
  });
}
function saveRecord(input){
  if(!input||typeof input!=='object') throw new Error('Isian tidak valid.');
  const r={id:text_(input.id,80,'ID'),date:date_(input.date),activity:text_(input.activity,3000,'Kegiatan'),result:text_(input.result,3000,'Hasil'),evidence:text_(input.evidence||'',1500,'Bukti'),status:text_(input.status,40,'Status'),followup:text_(input.followup||'',3000,'Tindak lanjut')};
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(r.id)) throw new Error('ID tidak valid.');
  if(!r.activity||!r.result) throw new Error('Kegiatan dan hasil wajib diisi.');
  if(!['Selesai','Berjalan','Menunggu'].includes(r.status)) throw new Error('Status tidak valid.');
  const expected=Number(input.version);if(!Number.isInteger(expected)||expected<0) throw new Error('Revisi tidak valid.');
  return withLock_(function(){
    const sh=sheet_(),rows=all_(sh),found=rows.find(x=>x.id===r.id);
    const same=found&&['date','activity','result','evidence','status','followup'].every(k=>found[k]===r[k]);
    if(found&&same) return found; // Safe retry after an uncertain network response.
    if(found&&found.version!==expected) throw new Error('Catatan sudah berubah di sesi lain. Muat ulang sebelum mengedit.');
    if(!found&&expected!==0) throw new Error('Catatan asal tidak ditemukan. Muat ulang.');
    const now=new Date().toISOString();r.created=found?found.created:now;r.updated=now;r.version=found?found.version+1:1;
    // Resolve by ID in the physical rows; blank rows must not shift edits.
    const row=found?found._row:sh.getLastRow()+1;
    if(row>sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(),100);
    const values=[r.id,r.date,r.activity,r.result,r.evidence,r.status,r.followup,r.created,r.updated,String(r.version)];
    // Leading apostrophe makes user input literal, including =,+,-,@ and quotes.
    sh.getRange(row,1,1,HEADERS.length).setNumberFormat('@').setValues([values.map(v=>"'"+v)]).setWrap(true).setVerticalAlignment('top');
    SpreadsheetApp.flush();
    const saved=record_(sh.getRange(row,1,1,HEADERS.length).getValues()[0],sh.getParent().getSpreadsheetTimeZone());
    if(saved.version!==r.version||!['id','date','activity','result','evidence','status','followup'].every(k=>saved[k]===r[k]))
      throw new Error('Baca balik belum sesuai. Muat ulang untuk memeriksa hasil simpan.');
    return saved;
  });
}
function deleteRecord(id,expectedVersion){
  id=text_(String(id||''),80,'ID');const expected=Number(expectedVersion);
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw new Error('ID tidak valid.');
  if(!Number.isInteger(expected)||expected<1)throw new Error('Revisi tidak valid.');
  return withLock_(function(){
    const book=book_(),sh=coreSheetForBook_(book),found=all_(sh).find(function(row){return row.id===id;});
    if(!found)return {deleted:true,id:id,alreadyDeleted:true,attachmentsRetained:0};
    if(found.version!==expected)throw new Error('Catatan sudah berubah di sesi lain. Muat ulang sebelum menghapus.');
    const attachmentSheet=book.getSheetByName('Attachments'),related=attachmentSheet?attachments_(attachmentSheet).filter(function(item){return item.activityId===id&&item.state!=='detached';}):[];
    if(related.some(function(item){return item.state==='uploading'||item.state==='uploaded';}))throw new Error('ATTACHMENT: Selesaikan atau pulihkan unggahan sebelum menghapus kegiatan.');
    sh.deleteRow(found._row);SpreadsheetApp.flush();
    return {deleted:true,id:id,date:found.date,activity:found.activity,version:found.version,alreadyDeleted:false,attachmentsRetained:related.filter(function(item){return !!item.fileId;}).length};
  });
}
