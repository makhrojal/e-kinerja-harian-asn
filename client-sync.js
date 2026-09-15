// Confirmed writes with a shared mutation gate. Never infer rollback from transport failure.
let mutationBusy=false,mutationEpoch=0,unresolvedId=null;
let isOnline=typeof navigator!=='undefined'&&'onLine' in navigator?navigator.onLine!==false:true;
const transientError=e=>!/sesi lain|tidak valid|wajib|terlalu panjang|SETUP:|DATA:|Kolom|permission|izin|not found|asal tidak ditemukan/i.test(e.message||'');
async function persistRecord(input){
  if(typeof isOnline!=='undefined'&&!isOnline)throw new Error('OFFLINE: Perangkat sedang offline. Periksa koneksi internet Anda sebelum menyimpan.');
  if(mutationBusy)throw new Error('Penyimpanan lain masih berlangsung. Tunggu konfirmasi.');
  if(unresolvedId&&unresolvedId!==input.id)throw new Error('Ada penyimpanan belum terkonfirmasi. Klik Muat ulang sebelum melanjutkan.');
  const payload=JSON.parse(JSON.stringify(input));mutationBusy=true;mutationEpoch++;loading++;invalidateReport();hideUndo();render();
  try{
    for(let attempt=0;attempt<3;attempt++){
      try{const saved=await call('saveRecord',payload);unresolvedId=null;return saved;}
      catch(error){
        try{const current=await call('getRecord',payload.id);if(Domain.same(current,payload)){unresolvedId=null;return current;}if(current&&current.version!==payload.version)throw Object.assign(new Error('Catatan berubah di perangkat lain. Muat ulang lalu buka kembali catatan untuk memeriksa perubahan.'),{conflict:true});}
        catch(readError){if(readError.conflict)throw readError;}
        if(!transientError(error))throw error;
        if(attempt===2){unresolvedId=payload.id;throw new Error('Hasil penyimpanan belum diketahui. Isian dipertahankan. Muat ulang atau coba simpan lagi dengan isian yang sama.');}
        await new Promise(resolve=>setTimeout(resolve,400*2**attempt+Math.floor(Math.random()*150)));
      }
    }
  }finally{mutationBusy=false;mutationEpoch++;loading++;monthCache.clear();invalidateReport();$('refresh').disabled=false;render();}
}
