(() => {
  const cfg = window.SANTANIC_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR-PROJECT') && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  const client = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (id) => document.getElementById(id);
  const state = { scripts: [], selected: null, session: null, admin: false };
  const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (message) => { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2800); };
  const openModal = id => { $(id).classList.add('open'); $(id).setAttribute('aria-hidden','false'); };
  const closeModal = id => { $(id).classList.remove('open'); $(id).setAttribute('aria-hidden','true'); };
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>closeModal(el.dataset.close==='detail'?'detail-modal':'admin-modal')));
  $('year').textContent = new Date().getFullYear();
  const fileType = (name='') => { const ext=name.split('.').pop().toLowerCase(); return ({js:'JS',mjs:'JS',cjs:'JS',ts:'TS',py:'PY',html:'HTML',css:'CSS',json:'JSON',zip:'ZIP',sh:'SH',php:'PHP',java:'JAVA',sql:'SQL',md:'MD'})[ext] || ext.slice(0,4).toUpperCase() || 'FILE'; };
  const prettySize = bytes => { if(!bytes) return 'Ukuran —'; const units=['B','KB','MB','GB']; let i=0,n=bytes; while(n>=1024&&i<units.length-1){n/=1024;i++} return `${n.toFixed(i?1:0)} ${units[i]}`; };
  function render() {
    const q=$('search').value.trim().toLowerCase(), category=$('category-filter').value, sort=$('sort-filter').value;
    let items=state.scripts.filter(s => (category==='all'||s.category===category) && [s.name,s.description,s.language,s.category].some(v=>String(v||'').toLowerCase().includes(q)));
    if(sort==='downloads') items.sort((a,b)=>(b.downloads||0)-(a.downloads||0)); else if(sort==='name') items.sort((a,b)=>a.name.localeCompare(b.name)); else items.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
    $('stat-total').textContent=state.scripts.length; $('result-label').textContent=`${items.length} script ditemukan`;
    if(!client){$('script-grid').innerHTML='<div class="empty-state"><strong>Konfigurasi Supabase belum diisi.</strong><br>Isi URL dan public anon/publishable key di <code>config.js</code>, lalu deploy ulang.</div>';return;}
    if(!items.length){$('script-grid').innerHTML='<div class="empty-state">Belum ada script yang cocok.<br>Coba kata kunci lain atau periksa lagi nanti.</div>';return;}
    $('script-grid').innerHTML=items.map(s=>`<article class="script-card"><div class="card-top"><div class="file-icon">${esc(fileType(s.file_name))}</div><span class="tag">${esc(s.category||'Lainnya')}</span></div><h3>${esc(s.name)}</h3><p class="description">${esc(s.description)}</p><div class="card-footer"><div class="card-meta"><span>${esc(s.language||'File')}</span><span>${Number(s.downloads||0)} unduhan</span></div><button class="card-open" data-detail="${esc(s.id)}">DETAIL &nbsp;↗</button></div></article>`).join('');
    document.querySelectorAll('[data-detail]').forEach(btn=>btn.addEventListener('click',()=>showDetail(btn.dataset.detail)));
  }
  async function loadScripts(){
    if(!client){render();return;}
    $('script-grid').innerHTML='<div class="empty-state">Memuat koleksi…</div>';
    const {data,error}=await client.from('scripts').select('id,name,description,category,language,file_name,file_path,file_size,downloads,created_at').eq('published',true).order('created_at',{ascending:false});
    if(error){$('script-grid').innerHTML='<div class="empty-state">Tidak bisa memuat script. Periksa konfigurasi Supabase dan kebijakan database.</div>'; $('result-label').textContent='Koneksi perlu diperiksa'; console.error(error);return;}
    state.scripts=data||[];render();
  }
  async function showDetail(id){
    const s=state.scripts.find(item=>item.id===id);if(!s)return;state.selected=s;
    $('detail-icon').textContent=fileType(s.file_name);$('detail-category').textContent=s.category||'Lainnya';$('detail-title').textContent=s.name;$('detail-description').textContent=s.description;$('detail-language').textContent=`◈ ${s.language||'File'}`;$('detail-size').textContent=`▤ ${prettySize(s.file_size)}`;$('detail-downloads').textContent=`↓ ${Number(s.downloads||0)} unduhan`;
    const downloadLink=$('download-link');
    downloadLink.href='#';
    downloadLink.removeAttribute('download');
    downloadLink.onclick=async e=>{
      e.preventDefault();
      if(downloadLink.dataset.busy==='1')return;
      downloadLink.dataset.busy='1';
      downloadLink.setAttribute('aria-disabled','true');
      const oldText=downloadLink.textContent;
      downloadLink.textContent='Menyiapkan download…';
      try{
        const fileName=(s.file_name||'script.zip').replace(/[\\r\\n"]/g,'_');
        // The download query option asks Supabase Storage to send Content-Disposition
        // with the original filename; the HTML download attribute alone is unreliable cross-origin.
        const {data,error}=client.storage.from('scripts').getPublicUrl(s.file_path,{download:fileName});
        if(error||!data?.publicUrl)throw error||new Error('Link download tidak tersedia.');
        const a=document.createElement('a');
        a.href=data.publicUrl;
        a.rel='noopener noreferrer';
        a.style.display='none';
        document.body.appendChild(a);a.click();a.remove();

        // RPC returns the committed count, so the UI can use the database's actual value.
        const {data:count,error:countError}=await client.rpc('increment_script_downloads',{script_id:s.id});
        if(countError) {
          console.error('Gagal memperbarui penghitung unduhan:',countError);
          toast('File diminta, tetapi penghitung gagal. Periksa SQL Supabase.');
          return;
        }
        if(count===null||count===undefined) {
          const {data:row,error:readError}=await client.from('scripts').select('downloads').eq('id',s.id).maybeSingle();
          if(readError) { console.error('Gagal membaca penghitung:',readError); toast('Download dimulai, tetapi angka belum bisa diperbarui.'); return; }
          if(row) s.downloads=Number(row.downloads||0);
        } else s.downloads=Number(count);
        $('detail-downloads').textContent=`↓ ${s.downloads} unduhan`;
        render();
        toast('Download dimulai.');
      }catch(err){
        console.error('Download error:',err);
        toast(err?.message||'Download gagal. Coba lagi.');
      }finally{
        downloadLink.dataset.busy='0';
        downloadLink.removeAttribute('aria-disabled');
        downloadLink.textContent=oldText;
      }
    };
  $('copy-link').onclick=async()=>{const url=new URL(location.href);url.hash='script='+encodeURIComponent(s.id);try{await navigator.clipboard.writeText(url.href);toast('Link detail disalin.');}catch{toast('Clipboard tidak tersedia di browser ini.');}};
    openModal('detail-modal');
  }
  $('search').addEventListener('input',render);$('category-filter').addEventListener('change',render);$('sort-filter').addEventListener('change',render);
  $('admin-open').addEventListener('click',async()=>{openModal('admin-modal');$('login-message').textContent='';if(client){const {data}=await client.auth.getSession();state.session=data.session;await refreshAdmin();}else{$('login-message').textContent='Isi konfigurasi Supabase terlebih dahulu.';}});
  async function refreshAdmin(){
    if(!client||!state.session){state.admin=false;$('login-form').hidden=false;$('admin-dashboard').hidden=true;$('admin-open').textContent='Admin';return;}
    const {data:{user}}=await client.auth.getUser();const role=user?.app_metadata?.role;state.admin=role==='admin';$('login-form').hidden=true;$('admin-dashboard').hidden=false;$('admin-identity').textContent=user?.email||'Admin';$('admin-open').textContent='Panel admin';$('upload-form').hidden=!state.admin;
    $('admin-message').textContent=state.admin?'Akses admin aktif.':'Akun masuk, tetapi belum memiliki peran admin. Minta pemilik proyek mengatur app_metadata.role = admin.';
  }
  $('login-form').addEventListener('submit',async e=>{e.preventDefault();if(!client)return;$('login-message').textContent='Memeriksa akun…';const {data,error}=await client.auth.signInWithPassword({email:$('admin-email').value.trim(),password:$('admin-password').value});if(error){$('login-message').textContent='Login gagal. Periksa email/password dan konfigurasi Auth.';return;}state.session=data.session;await refreshAdmin();$('login-message').textContent=state.admin?'Login berhasil.':'Login berhasil, tetapi akun bukan admin.';});
  $('logout-button').addEventListener('click',async()=>{if(client)await client.auth.signOut();state.session=null;state.admin=false;await refreshAdmin();toast('Kamu sudah keluar.');});
  $('upload-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!client||!state.admin){toast('Akses admin diperlukan.');return;}
    const file=$('script-file').files[0];if(!file){toast('Pilih file terlebih dahulu.');return;}if(file.size>20*1024*1024){toast('Ukuran file maksimal 20 MB.');return;}
    const forbidden=['.exe','.dll','.bat','.cmd','.com','.msi','.apk','.sh'];const ext='.'+(file.name.split('.').pop()||'').toLowerCase();if(forbidden.includes(ext)){toast('Jenis file ini tidak diizinkan.');return;}
    const button=e.submitter;button.disabled=true;button.textContent='Mengunggah…';
    try{
      const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)||'script.txt';const path=`${crypto.randomUUID()}-${safeName}`;
      const upload=await client.storage.from('scripts').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(upload.error)throw upload.error;
      const {error}=await client.from('scripts').insert({name:$('script-name').value.trim(),description:$('script-description').value.trim(),category:$('script-category').value,language:$('script-language').value.trim(),file_name:file.name,file_path:path,file_size:file.size,published:true});
      if(error){await client.storage.from('scripts').remove([path]);throw error;}
      e.target.reset();toast('Script berhasil diunggah.');await loadScripts();
    }catch(err){console.error(err);toast(err?.message||'Upload gagal. Periksa policy Storage dan database.');}
    finally{button.disabled=false;button.textContent='↑ Upload script';}
  });
  if(client){client.auth.onAuthStateChange((_event,session)=>{state.session=session;});loadScripts();const hash=new URLSearchParams(location.hash.slice(1));const scriptId=hash.get('script');if(scriptId)loadScripts().then(()=>showDetail(scriptId));}else render();
})();
