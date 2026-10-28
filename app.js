const SUPABASE_URL = "https://oexvlxphtdijwqyutvck.supabase.com";
const SUPABASE_ANON_KEY = "sb_publishable_kOpUaUqDup4-Rei3yXzmlQ_yev-ZKna";

const $ = (id) => document.getElementById(id);
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGAR_") && !SUPABASE_ANON_KEY.includes("PEGAR_");
let db = null;
let items = [];
let currentUser = null;

function message(id, text, success=false) {
  const el = $(id); el.textContent = text; el.classList.toggle("success", success);
}
function showAuth() { $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); $("logoutBtn").classList.add("hidden"); }
function showApp() { $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden"); }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

async function init() {
  if (!configured || !window.supabase) {
    $("setupNotice").classList.remove("hidden");
    message("authMessage", "Configurá primero las credenciales de Supabase.");
    return;
  }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {data:{session}} = await db.auth.getSession();
  if (session) { currentUser = session.user; showApp(); await loadItems(); } else showAuth();
  db.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) { showApp(); await loadItems(); } else { items=[]; showAuth(); }
  });
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return message("authMessage","Primero configurá Supabase.");
  message("authMessage","Ingresando…");
  const {error} = await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
  message("authMessage", error ? error.message : "Sesión iniciada.", !error);
});
$("signupBtn").addEventListener("click", async () => {
  if (!db) return message("authMessage","Primero configurá Supabase.");
  const email=$("email").value.trim(), password=$("password").value;
  if (!email || password.length < 6) return message("authMessage","Ingresá un correo y una contraseña de al menos 6 caracteres.");
  message("authMessage","Creando cuenta…");
  const {data,error} = await db.auth.signUp({email,password});
  if (error) return message("authMessage",error.message);
  message("authMessage", data.session ? "Cuenta creada. Ya podés usar el inventario." : "Cuenta creada. Revisá tu correo si te pide confirmar el registro.", true);
});
$("logoutBtn").addEventListener("click", async () => { if(db) await db.auth.signOut(); });
$("refreshBtn").addEventListener("click", loadItems);
$("searchInput").addEventListener("input", renderItems);
$("addBtn").addEventListener("click", () => openDialog());
$("emptyAddBtn").addEventListener("click", () => openDialog());
$("closeDialog").addEventListener("click", closeDialog);
$("cancelBtn").addEventListener("click", closeDialog);

function openDialog(item=null) {
  $("itemForm").reset();
  $("itemId").value = item?.id || "";
  $("garment").value = item?.garment || "";
  $("size").value = item?.size || "";
  $("quantity").value = item?.quantity ?? 0;
  $("dialogTitle").textContent = item ? "Editar prenda" : "Agregar prenda";
  $("formMessage").textContent = "";
  $("itemDialog").showModal();
}
function closeDialog() { $("itemDialog").close(); }

$("itemForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db || !currentUser) return;
  const garment=$("garment").value.trim(), size=$("size").value.trim(), quantity=Number($("quantity").value);
  if (!garment || !size || !Number.isInteger(quantity) || quantity < 0) return message("formMessage","Completá prenda, talle y una cantidad entera igual o mayor que cero.");
  $("saveBtn").disabled=true; $("saveBtn").textContent="Guardando…";
  const id=$("itemId").value;
  const record={garment,size,quantity,user_id:currentUser.id};
  const result = id
    ? await db.from("garments").update({garment,size,quantity}).eq("id",id).eq("user_id",currentUser.id)
    : await db.from("garments").insert(record);
  $("saveBtn").disabled=false; $("saveBtn").textContent="Guardar";
  if(result.error) return message("formMessage","No se pudo guardar: "+result.error.message);
  closeDialog(); message("appMessage","Cambios guardados.",true); await loadItems();
});

async function loadItems() {
  if(!db || !currentUser) return;
  $("loading").classList.remove("hidden");
  $("emptyState").classList.add("hidden");
  const {data,error}=await db.from("garments").select("id,garment,size,quantity,created_at").eq("user_id",currentUser.id).order("garment").order("size");
  $("loading").classList.add("hidden");
  if(error) { message("appMessage","Error cargando stock: "+error.message); return; }
  items=data || []; renderItems();
}
function renderItems() {
  const query=$("searchInput").value.trim().toLocaleLowerCase("es");
  const filtered=items.filter(i => (i.garment+" "+i.size).toLocaleLowerCase("es").includes(query));
  $("recordCount").textContent=items.length;
  $("unitCount").textContent=items.reduce((sum,i)=>sum+Number(i.quantity),0);
  $("inventory").innerHTML=filtered.map(i=>`
    <article class="item-card">
      <div class="item-top"><div><h3>${esc(i.garment)}</h3><span class="tag">Talle ${esc(i.size)}</span></div></div>
      <div class="qty">${Number(i.quantity)} <small>unidades</small></div>
      <div class="item-actions">
        <button class="secondary" data-action="minus" data-id="${i.id}" aria-label="Restar una unidad">− 1</button>
        <button class="secondary" data-action="plus" data-id="${i.id}">＋ 1</button>
        <button class="secondary" data-action="edit" data-id="${i.id}">Editar</button>
        <button class="danger" data-action="delete" data-id="${i.id}">Eliminar</button>
      </div>
    </article>`).join("");
  $("emptyState").classList.toggle("hidden", items.length!==0 || query.length>0);
  if(items.length && filtered.length===0) $("inventory").innerHTML='<div class="empty"><h3>No se encontraron prendas</h3><p>Probá con otro nombre o talle.</p></div>';
}
$("inventory").addEventListener("click", async (e) => {
  const btn=e.target.closest("button[data-action]"); if(!btn) return;
  const item=items.find(i=>String(i.id)===btn.dataset.id); if(!item) return;
  const action=btn.dataset.action;
  if(action==="edit") return openDialog(item);
  if(action==="delete") {
    if(!confirm(`¿Eliminar ${item.garment}, talle ${item.size}? Esta acción no se puede deshacer.`)) return;
    const {error}=await db.from("garments").delete().eq("id",item.id).eq("user_id",currentUser.id);
    if(error) message("appMessage","No se pudo eliminar: "+error.message); else {message("appMessage","Prenda eliminada.",true); await loadItems();}
  }
  if(action==="plus" || action==="minus") {
    const next=Number(item.quantity)+(action==="plus"?1:-1);
    if(next<0) return message("appMessage","El stock no puede quedar por debajo de cero.");
    const {error}=await db.from("garments").update({quantity:next}).eq("id",item.id).eq("user_id",currentUser.id);
    if(error) message("appMessage","No se pudo actualizar: "+error.message); else {message("appMessage","Stock actualizado.",true); await loadItems();}
  }
});
init();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
