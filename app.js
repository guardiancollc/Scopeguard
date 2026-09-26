const $ = (id) => document.getElementById(id);
const storeKey = 'scopeguard-alpha-v3';
let state = JSON.parse(localStorage.getItem(storeKey) || 'null') || { company:null, projects:[], activeProjectId:null };
let pendingPhotos = [];
let db = null;
let session = null;
let cloudEnabled = false;
let demoMode = false;
let activeExtraId = null;
let activeClientId = null;
let editingClientId = null;

function cache(){
  const clean = JSON.parse(JSON.stringify(state, (k,v)=>k==='file'?undefined:v));
  localStorage.setItem(storeKey, JSON.stringify(clean));
}
function money(n){ return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0)); }
function nowDate(){ return new Date().toLocaleDateString('en-US'); }
function isoDate(){ return new Date().toISOString().slice(0,10); }
function uid(){ return crypto?.randomUUID?.() || Math.random().toString(36).slice(2)+Date.now().toString(36); }
function project(){ return state.projects.find(p=>p.id===state.activeProjectId); }
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function setSync(text, cls='') { $('syncBadge').textContent=text; $('syncBadge').className=`sync-badge ${cls}`.trim(); }
function safeName(name='photo.jpg'){ return name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(-80) || 'photo.jpg'; }

function show(id){
  document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));
  $(id).classList.remove('hidden');
  // Hide legacy bottom navigation on the new landing screen; show it only inside work areas.
  $('bottomNav').classList.toggle('hidden', !state.company || ['home','invoiceCenter','projectCenter','clients','clientDetail','clientForm','companyProfile'].includes(id));
  if(id==='home') renderHome();
  if(id==='invoiceCenter') renderInvoiceCenter();
  if(id==='clients') renderClients();
  if(id==='clientDetail') renderClientDetail();
  if(id==='projectCenter') renderProjectCenter();
  if(id==='dashboard') renderDashboard();
  if(id==='projectDetail') renderProject();
  if(id==='billing') renderBilling();
  window.scrollTo({top:0,behavior:'smooth'});
}

function calcProject(p){
  const labor=(p.logs||[]).reduce((s,l)=>s+Number(l.laborCost||0),0);
  const direct=(p.logs||[]).reduce((s,l)=>s+Number(l.directCost||0),0);
  const laborBudget=Number(p.laborBudget||0);
  const materialBudget=Number(p.materialBudget||0);
  const actualMaterial=direct+Number(p.materialSpent||0);
  const baseBudgetCosts=laborBudget+materialBudget;
  const actualFieldCosts=labor+actualMaterial;
  const potentialCOs=(p.extras||[]).filter(e=>e.status!=='approved'&&e.status!=='rejected');
  const approvedCOs=(p.extras||[]).filter(e=>e.status==='approved');
  const potentialChangeOrders=potentialCOs.reduce((s,e)=>s+Number(e.estimatedValue||0),0);
  const approvedChangeOrders=approvedCOs.reduce((s,e)=>s+Number(e.estimatedValue||0),0);
  const approvedChangeOrderCosts=approvedCOs.reduce((s,e)=>s+Number(e.estimatedCost||0),0);
  // Potential/submitted change orders never affect project financial calculations.
  // Approved CO cost expands the project cost plan; approved CO value expands revenue.
  // Using max(plan, actual) prevents approved CO field costs from being counted twice.
  const plannedCostsWithApprovedCOs=baseBudgetCosts+approvedChangeOrderCosts;
  const costs=Math.max(plannedCostsWithApprovedCOs,actualFieldCosts);
  const contractValue=Number(p.contractValue||0);
  const baseProjectCost=Math.max(baseBudgetCosts,actualFieldCosts-approvedChangeOrderCosts,0);
  const originalContractProfit=contractValue-baseProjectCost;
  const approvedChangeOrderProfit=approvedChangeOrders-approvedChangeOrderCosts;
  const projectedRevenue=contractValue+approvedChangeOrders;
  const profit=projectedRevenue-costs;
  return {labor,direct,laborBudget,materialBudget,potentialChangeOrders,approvedChangeOrders,approvedChangeOrderCosts,costs,projectedRevenue,profit,originalContractProfit,approvedChangeOrderProfit,margin:projectedRevenue?(profit/projectedRevenue)*100:0};
}
function renderHome(){
  $('homeCompanyTitle').textContent=state.company?.name||'Your company';
}
function invoiceState(i){
  if(i.status==='paid') return 'paid';
  const due=i.dueDate||i.due_date;
  if(due){const end=new Date(`${due}T23:59:59`);if(end < new Date()) return 'overdue';}
  return 'open';
}
function allInvoices(){
  return state.projects.flatMap(p=>(p.invoices||[]).map(i=>({p,i,state:invoiceState(i)})));
}
function renderInvoiceCenter(){
  const rows = allInvoices();
  const currentYear = new Date().getFullYear();

  const yearRows = rows.filter(({i}) => {
    const invoiceDate = i.date || i.invoice_date || '';
    if(!invoiceDate) return false;

    const d = new Date(invoiceDate + 'T12:00:00');
    return !Number.isNaN(d.getTime()) && d.getFullYear() === currentYear;
  });

  const totalInvoiced = yearRows.reduce((sum,{i}) => {
    return sum + Number(i.amount || 0);
  },0);

  const totalPaid = yearRows.reduce((sum,{i}) => {
    const amount = Number(i.amount || 0);
    const paidAmount = Number(i.paidAmount || i.paid_amount || 0);

    if(i.status === 'paid'){
      return sum + (paidAmount > 0 ? paidAmount : amount);
    }

    return sum + paidAmount;
  },0);

  const groups = [
    ['open','Open Invoices'],
    ['overdue','Past Due Invoices'],
    ['paid','Paid Invoices']
  ];

  const container = $('invoiceCenterGroups');
  if(!container) return;

  let html = `
    <section class="invoice-group">
      <div class="invoice-group-head">
        <h3>${currentYear} Invoice Summary</h3>
        <span class="count">${yearRows.length} invoices</span>
      </div>

      <div class="invoice-center-card">
        <div>
          <strong>Total Invoiced This Year</strong>
          <div class="row-sub">All invoices dated ${currentYear}</div>
        </div>
        <div class="right">
          <strong>${money(totalInvoiced)}</strong>
        </div>
      </div>

      <div class="invoice-center-card">
        <div>
          <strong>Total Paid This Year</strong>
          <div class="row-sub">Paid amount on ${currentYear} invoices</div>
        </div>
        <div class="right">
          <strong>${money(totalPaid)}</strong>
        </div>
      </div>
    </section>
  `;

  groups.forEach(([key,title]) => {
    const list = rows.filter(row => row.state === key);

    html += `
      <section class="invoice-group">
        <div class="invoice-group-head">
          <h3>${title}</h3>
          <span class="count">${list.length}</span>
        </div>
    `;

    if(list.length === 0){
      html += `
        <div class="card">
          <p class="muted">No ${title.toLowerCase()}.</p>
        </div>
      `;
    } else {
      list.forEach(({p,i}) => {
        const invoiceNumber = escapeHtml(i.number || 'Invoice');
        const customer = escapeHtml(p.customer || 'Customer');
        const projectName = escapeHtml(p.name || 'Project');
        const dueDate = i.dueDate
          ? `Due ${escapeHtml(i.dueDate)}`
          : 'No due date';

        html += `
          <div class="invoice-center-card">
            <div>
              <strong>${invoiceNumber}</strong>
              <div class="row-sub">${customer}</div>
              <div class="row-sub">Project: ${projectName}</div>
              <div class="row-sub">${dueDate}</div>
            </div>

            <div class="right">
              <strong>${money(i.amount)}</strong>

              <div class="status-label status-${key}">
                ${key === 'overdue' ? 'PAST DUE' : key.toUpperCase()}
              </div>

              <button
                class="secondary small"
                onclick="previewInvoiceGlobal('${p.id}','${i.id}')">
                Open
              </button>

              ${i.status !== 'paid' ? `
                <button
                  class="ghost small"
                  onclick="markInvoicePaidGlobal('${p.id}','${i.id}')">
                  ✓ Mark Paid
                </button>
              ` : ''}
            </div>
          </div>
        `;
      });
    }

    html += `</section>`;
  });

  container.innerHTML = html;
}

let projectCenterMode='active';
function isFinishedProject(p){return ['finished','complete','completed','closed'].includes(String(p.status||'active').toLowerCase());}
function renderProjectCenter(){
  const active=state.projects.filter(p=>!isFinishedProject(p)), finished=state.projects.filter(isFinishedProject);
  $('activeProjectCount').textContent=active.length;$('finishedProjectCount').textContent=finished.length;
  $('activeProjectsBtn').classList.toggle('active',projectCenterMode==='active');$('finishedProjectsBtn').classList.toggle('active',projectCenterMode==='finished');
  const q=($('centerProjectSearch')?.value||'').trim().toLowerCase();const base=projectCenterMode==='active'?active:finished;const list=base.filter(p=>!q||[p.name,p.customer,p.scope].join(' ').toLowerCase().includes(q));
  $('centerProjectList').innerHTML=list.length?list.map(p=>{const c=calcProject(p);return `<div class="project-row project-workspace-card"><div class="project-card-main"><div class="project-title">${escapeHtml(p.name)}</div><div class="row-sub">${escapeHtml(p.customer||'No customer')}</div><div class="project-card-financials"><span><small>Contract</small><b>${money(p.contractValue)}</b></span><span><small>Cost</small><b>${money(c.costs)}</b></span><span><small>Profit</small><b class="positive">${money(c.profit)}</b></span></div></div><button onclick="openProject('${p.id}')">Open →</button></div>`}).join(''):`<div class="card"><p class="muted">No ${projectCenterMode} projects.</p></div>`;
}
function clientProjects(c){return state.projects.filter(p=>p.clientId===c.id||(!p.clientId&&String(p.customer||'').trim().toLowerCase()===String(c.name||'').trim().toLowerCase()));}
function clientInvoices(c){return clientProjects(c).flatMap(p=>(p.invoices||[]).map(i=>({p,i,state:invoiceState(i)})));}
function renderClients(){
  const q=($('clientSearch')?.value||'').trim().toLowerCase(); const clients=(state.clients||[]).filter(c=>!q||[c.name,c.contactName,c.email,c.phone].join(' ').toLowerCase().includes(q));
  $('clientList').innerHTML=clients.length?clients.map(c=>{const ps=clientProjects(c), inv=clientInvoices(c), open=inv.filter(x=>x.state==='open'||x.state==='overdue').reduce((a,x)=>a+Number(x.i.amount||0)-Number(x.i.paidAmount||0),0);return `<div class="client-card"><div><h3>${escapeHtml(c.name)}</h3><div class="row-sub">${escapeHtml(c.contactName||c.email||'No contact added')}</div><div class="row-sub">${ps.length} project${ps.length===1?'':'s'} · ${money(open)} outstanding</div></div><button class="secondary" onclick="openClient('${c.id}')">Open →</button></div>`}).join(''):'<div class="card"><p class="muted">No clients yet. Add your first client.</p></div>';
}
window.openClient=(id)=>{activeClientId=id;show('clientDetail');};
function renderClientDetail(){const c=(state.clients||[]).find(x=>x.id===activeClientId);if(!c)return show('clients');const ps=clientProjects(c), rows=clientInvoices(c);const invoiced=rows.reduce((a,x)=>a+Number(x.i.amount||0),0),paid=rows.reduce((a,x)=>a+Number(x.i.paidAmount||0),0),open=rows.filter(x=>x.state==='open').reduce((a,x)=>a+Number(x.i.amount||0)-Number(x.i.paidAmount||0),0),overdue=rows.filter(x=>x.state==='overdue').reduce((a,x)=>a+Number(x.i.amount||0)-Number(x.i.paidAmount||0),0);
 $('clientDetailContent').innerHTML=`<div class="section-head"><div><span class="eyebrow">CLIENT</span><h2>${escapeHtml(c.name)}</h2><p class="muted">${escapeHtml(c.contactName||'')}${c.email?` · ${escapeHtml(c.email)}`:''}${c.phone?` · ${escapeHtml(c.phone)}`:''}</p></div><div class="head-actions"><button class="secondary compact" onclick="editClient('${c.id}')">Edit</button><button class="primary compact" onclick="createInvoiceForClient('${c.id}')">+ Invoice</button></div></div><div class="client-kpis"><div class="metric"><div class="label">Total invoiced</div><div class="value">${money(invoiced)}</div></div><div class="metric"><div class="label">Open invoices</div><div class="value">${money(open)}</div></div><div class="metric"><div class="label">Past due</div><div class="value">${money(overdue)}</div></div></div><div class="card"><h3>Projects with this client</h3>${ps.length?ps.map(p=>`<div class="client-project-row"><strong>${escapeHtml(p.name)}</strong><div class="row-sub">Contract ${money(p.contractValue)}</div><button class="ghost small" onclick="openProject('${p.id}')">Open project →</button></div>`).join(''):'<p class="muted">No projects linked yet.</p>'}</div><div class="card"><h3>Invoices</h3>${rows.length?rows.map(({p,i,state})=>`<div class="client-invoice-row"><div><strong>${escapeHtml(i.number)}</strong><div class="row-sub">${escapeHtml(p.name)} · ${state==='overdue'?'Past due':state}</div></div><div><strong>${money(i.amount)}</strong><button class="ghost small" onclick="previewInvoiceGlobal('${p.id}','${i.id}')">Preview</button>${i.status!=='paid'?`<button class="ghost small" onclick="markInvoicePaidGlobal('${p.id}','${i.id}')">✓ Mark Paid</button>`:''}</div></div>`).join(''):'<p class="muted">No invoices yet.</p>'}</div>`;
}
window.editClient=(id)=>{const c=(state.clients||[]).find(x=>x.id===id);if(!c)return;editingClientId=id;$('clientFormTitle').textContent='Edit client';$('clientName').value=c.name;$('clientContactName').value=c.contactName||'';$('clientEmail').value=c.email||'';$('clientPhone').value=c.phone||'';$('clientAddress').value=c.address||'';$('clientNotes').value=c.notes||'';show('clientForm');};
window.createInvoiceForClient=(id)=>{const c=(state.clients||[]).find(x=>x.id===id),ps=clientProjects(c);if(!ps.length)return alert('Create a project for this client first.');let p=ps[0];if(ps.length>1){const names=ps.map((x,n)=>`${n+1}. ${x.name}`).join('\n');const pick=Number(prompt(`Choose a project for this invoice:\n${names}`)||0);if(!pick||!ps[pick-1])return;p=ps[pick-1];}state.activeProjectId=p.id;cache();show('billing');$('newInvoiceBtn').click();$('invoiceClientEmail').value=c.email||p.clientEmail||'';};
function renderDashboard(){
  $('companyTitle').textContent=state.company?.name||'Your company';
  $('projectCount').textContent=`${state.projects.length} project${state.projects.length===1?'':'s'}`;
  const totals=state.projects.reduce((a,p)=>{const c=calcProject(p);a.contract+=Number(p.contractValue||0);a.costs+=c.costs;a.potential+=c.potentialChangeOrders;a.approved+=c.approvedChangeOrders;a.originalProfit+=c.originalContractProfit;a.coProfit+=c.approvedChangeOrderProfit;a.profit+=c.profit;return a;},{contract:0,costs:0,potential:0,approved:0,originalProfit:0,coProfit:0,profit:0});
  $('metrics').innerHTML=`<div class="metric"><div class="label">All projects · contract value</div><div class="value">${money(totals.contract)}</div><div class="sub">Company portfolio total</div></div><div class="metric light"><div class="label">All projects · project cost</div><div class="value">${money(totals.costs)}</div><div class="sub">Company portfolio total</div></div>`;
  const approvedProfitPositive=totals.coProfit>=0;
  $('financialSummary').innerHTML=`<div class="summary-head"><div><span class="eyebrow">COMPANY PORTFOLIO</span><h3>All active projects</h3><p class="muted">Combined company totals only. Open a project below to see that job by itself.</p></div><span class="pill">${state.projects.length} active project${state.projects.length===1?'':'s'}</span></div><div class="summary-flow"><div><span>Combined original profit</span><strong>${money(totals.originalProfit)}</strong></div><div class="summary-op">+</div><div><span>Combined approved CO profit</span><strong class="${approvedProfitPositive?'positive':'negative'}">${money(totals.coProfit)}</strong></div><div class="summary-op">=</div><div class="summary-total"><span>Combined projected profit</span><strong>${money(totals.profit)}</strong></div></div><div class="summary-note"><strong>${money(totals.potential)} potential change orders</strong> across all projects are tracked separately and excluded until approved.</div>`;
  const riskCount=state.projects.reduce((s,p)=>s+(p.extras||[]).filter(e=>e.status==='potential').length,0);
  $('radarText').textContent=riskCount?`${riskCount} undocumented extra-work item${riskCount===1?'':'s'} need attention. Capture approval before the work gets forgotten.`:'No undocumented extras are waiting for action.';
  const q=($('projectSearch')?.value||'').trim().toLowerCase();
  const filtered=state.projects.filter(p=>!q||[p.name,p.customer,p.status||'active',p.scope].join(' ').toLowerCase().includes(q));
  $('projectList').innerHTML=filtered.length?filtered.map(p=>{const c=calcProject(p);return `<div class="project-row project-workspace-card"><div class="project-card-main"><div class="project-title">${escapeHtml(p.name)}</div><div class="row-sub">${escapeHtml(p.customer||'No customer')}</div><div class="project-card-financials"><span><small>Contract</small><b>${money(p.contractValue)}</b></span><span><small>Project cost</small><b>${money(c.costs)}</b></span><span><small>Projected profit</small><b class="positive">${money(c.profit)}</b></span></div><div class="row-sub">${money(c.potentialChangeOrders)} potential COs · ${money(c.approvedChangeOrders)} approved COs · ${c.margin.toFixed(1)}% margin</div></div><button onclick="openProject('${p.id}')">Open project →</button></div>`}).join(''):(state.projects.length?`<p class="muted">No projects match “${escapeHtml(q)}”.</p>`:`<p class="muted">No projects yet. Create your first job to start protecting the margin.</p>`);
}

function cleanScopeText(value){
  return String(value||'').replace(/\*{2,}/g,'').replace(/^\s*[-•]\s*/gm,'• ').trim();
}
function renderProject(){
  const p=project(); if(!p){show('dashboard');return;} const c=calcProject(p);
  $('detailName').textContent=p.name; $('detailCustomer').textContent=p.customer||''; $('detailScope').textContent=cleanScopeText(p.scope)||'No scope entered.';
  $('projectMetrics').innerHTML=`<div class="metric"><div class="label">Contract</div><div class="value">${money(p.contractValue)}</div><div class="sub">Original contract</div></div><div class="metric light"><div class="label">Project cost</div><div class="value">${money(c.costs)}</div><div class="sub">Base cost + approved CO cost</div></div><div class="project-financial-summary"><div class="project-profit-pair"><div><span>Original contract profit</span><strong>${money(c.originalContractProfit)}</strong></div><div><span>Approved CO profit</span><strong class="positive">${money(c.approvedChangeOrderProfit)}</strong></div></div><div class="project-profit-total"><span>Total projected profit</span><strong>${money(c.profit)}</strong></div><div class="project-profit-note"><strong>${money(c.potentialChangeOrders)} potential change orders</strong> tracked separately · ${c.margin.toFixed(1)}% projected margin</div></div>`;
  const potential=(p.extras||[]).filter(e=>e.status!=='approved'&&e.status!=='rejected');
  const approved=(p.extras||[]).filter(e=>e.status==='approved');
  $('extraCount').textContent=potential.length;
  $('approvedExtraCount').textContent=approved.length;
  $('extraList').innerHTML=potential.length?potential.map(e=>`<div class="extra-row"><div><strong>⚠ ${escapeHtml(e.title)}</strong><div class="row-sub">${escapeHtml(e.date)} · ${money(e.estimatedValue)} potential value · ${e.laborHours||0} labor hrs · ${escapeHtml(e.status)}</div><div class="row-sub">${escapeHtml(e.reason||'Possible out-of-scope work')}</div></div><button onclick="openExtra('${e.id}')">Record →</button></div>`).join(''):`<p class="muted">No potential change orders.</p>`;
  $('approvedExtraList').innerHTML=approved.length?approved.map(e=>`<div class="extra-row"><div><strong>✓ ${escapeHtml(e.title)}</strong><div class="row-sub">${escapeHtml(e.date)} · ${money(e.estimatedValue)} approved · ${money(e.estimatedCost)} cost · ${money(Number(e.estimatedValue||0)-Number(e.estimatedCost||0))} CO profit</div></div><button onclick="openExtra('${e.id}')">Record →</button></div>`).join(''):`<p class="muted">No approved change orders yet.</p>`;
  $('logList').innerHTML=(p.logs||[]).length?[...p.logs].reverse().map(l=>`<div class="log-row"><strong>${escapeHtml(l.date)}</strong><div class="row-sub">${l.crewCount||0} workers × ${l.hoursEach||0} hrs · ${money(l.laborCost)} labor · ${l.photos?.length||0} photos</div><div>${escapeHtml(l.note)}</div></div>`).join(''):`<p class="muted">No field logs yet.</p>`;
  const b=calcBilling(p);
  $('billingSnapshot').innerHTML=`<div class="billing-mini"><div><span>Invoiced</span><b>${money(b.invoiced)}</b></div><div><span>Paid</span><b class="positive">${money(b.paid)}</b></div><div><span>Remaining to invoice</span><b>${money(b.remaining)}</b></div></div><button class="secondary compact">Open billing →</button>`;
  $('billingSnapshot').onclick=()=>show('billing');
}

function calcBilling(p){
  const c=calcProject(p);
  const billable=Number(p.contractValue||0)+c.approvedChangeOrders;
  const invoices=p.invoices||[];
  const invoiced=invoices.reduce((sum,i)=>sum+Number(i.amount||0),0);
  const paid=invoices.reduce((sum,i)=>sum+(i.status==='paid'?Number(i.paidAmount||i.amount||0):Number(i.paidAmount||0)),0);
  const outstanding=Math.max(0,invoiced-paid);
  const remaining=Math.max(0,billable-invoiced);
  const percent=billable?Math.min(100,(invoiced/billable)*100):0;
  return {billable,invoiced,paid,outstanding,remaining,percent};
}
function renderBilling(){
  const p=project(); if(!p){show('dashboard');return;} const b=calcBilling(p);
  $('billingProjectName').textContent=`${p.name} billing`;
  $('billingMetrics').innerHTML=`<div class="metric"><div class="label">Billable contract</div><div class="value">${money(b.billable)}</div><div class="sub">Contract + approved COs</div></div><div class="metric"><div class="label">Invoiced</div><div class="value">${money(b.invoiced)}</div><div class="sub">${b.percent.toFixed(1)}% billed</div><div class="billing-progress"><i style="width:${b.percent}%"></i></div></div><div class="metric"><div class="label">Paid</div><div class="value positive">${money(b.paid)}</div><div class="sub">Collected to date</div></div><div class="metric"><div class="label">Outstanding</div><div class="value">${money(b.outstanding)}</div><div class="sub">Invoiced, not yet paid</div></div><div class="metric"><div class="label">Remaining to invoice</div><div class="value">${money(b.remaining)}</div><div class="sub">Available to bill</div></div>`;
  $('invoiceCount').textContent=`${(p.invoices||[]).length}`;
  $('invoiceList').innerHTML=(p.invoices||[]).length?[...p.invoices].reverse().map(i=>`<div class="invoice-row"><div><strong>${escapeHtml(i.number)}</strong><div class="row-sub">${escapeHtml(i.date)}${i.dueDate?` · due ${escapeHtml(i.dueDate)}`:''}</div><div>${escapeHtml(i.description||'Project invoice')}</div>${i.sentAt?`<div class="sent-stamp">✓ Sent ${escapeHtml(new Date(i.sentAt).toLocaleString())}${i.sentTo?` to ${escapeHtml(i.sentTo)}`:''}</div>`:''}</div><div class="amount"><strong>${money(i.amount)}</strong><br><span class="invoice-status ${i.status==='paid'?'paid':''}">${escapeHtml(i.status)}</span><div class="invoice-row-actions"><button class="secondary small" onclick="previewInvoice('${i.id}')">Preview invoice</button><button class="primary small" onclick="sendInvoice('${i.id}')">Send invoice</button><button class="ghost small" onclick="printInvoice('${i.id}')">Print / PDF</button>${i.status!=='paid'?`<button class="ghost small" onclick="markInvoicePaid('${i.id}')">Mark paid</button>`:''}</div></div></div>`).join(''):`<p class="muted">No invoices yet. Create the first invoice for this project.</p>`;
}
let activeInvoiceId=null;
function invoiceHtml(p,i){
  const c=state.company||{};
  const paid=Number(i.paidAmount||0);
  const retainage=Number(i.retainage||0);
  const contact=[c.phone,c.email,c.address].filter(Boolean).map(escapeHtml);
  const initials=String(c.name||'Company')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0,2)
    .map(x=>x[0])
    .join('')
    .toUpperCase();

  const due=i.dueDate?escapeHtml(i.dueDate):'Upon receipt';

  const lineItems=Array.isArray(i.lineItems)&&i.lineItems.length
    ? i.lineItems
    : [{
        type:'',
        description:i.description||'Project progress billing',
        amount:Number(i.amount||0)
      }];

  const typeNames={
    general:'General Scope',
    hourly:'Hourly',
    material:'Material',
    change_order:'Change Order'
  };

  const itemRows=lineItems.map(item=>{
    const typeName=typeNames[item.type]||item.type||'';

    return `<tr>
      <td>
        ${typeName?`<strong>${escapeHtml(typeName)}</strong><br>`:''}
        ${escapeHtml(item.description||'')}
      </td>
      <td>
        <strong>${money(Number(item.amount||0))}</strong>
      </td>
    </tr>`;
  }).join('');

  const subtotal=lineItems.reduce(
    (sum,item)=>sum+Number(item.amount||0),
    0
  );

  const balance=Math.max(0,subtotal-retainage-paid);

  return `<div class="opt1-topline"></div>
  <div class="opt1-body">

    <div class="opt1-head">
      <div class="opt1-brand">
        ${
          c.logoData
            ? `<img class="opt1-logo" src="${c.logoData}" alt="Company logo">`
            : `<div class="opt1-company-mark">${escapeHtml(initials)}</div>`
        }

        <div>
          <div class="opt1-company">
            ${escapeHtml(c.name||'Company')}
          </div>

          <div class="opt1-tagline">
            CONCRETE &nbsp;|&nbsp; STRUCTURAL &nbsp;|&nbsp; SITE SOLUTIONS
          </div>
        </div>
      </div>

      <div class="opt1-contact opt1-contact-top">
        ${c.owner?`<b>${escapeHtml(c.owner)}</b><br>`:''}
        ${contact.join('<br>')}
      </div>
    </div>

    <div class="opt1-rule"></div>

    <div class="opt1-title-row">
      <div>
        <h1>INVOICE</h1>

        <div class="opt1-billto">
          <div class="opt1-label">Bill To</div>

          <strong>
            ${escapeHtml(p.customer||'Customer')}
          </strong>

          <div>
            ${escapeHtml(i.clientEmail||p.clientEmail||'')}
          </div>

          <div class="opt1-project">
            <b>Project:</b> ${escapeHtml(p.name)}
          </div>
        </div>
      </div>

      <div class="opt1-meta-box">
        <div>
          <span>Invoice #</span>
          <b>${escapeHtml(i.number||'')}</b>
        </div>

        <div>
          <span>Invoice Date</span>
          <b>${escapeHtml(i.date||'')}</b>
        </div>

        <div>
          <span>Due Date</span>
          <b>${due}</b>
        </div>
      </div>
    </div>

    <table class="opt1-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>

      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="opt1-summary">

      <div class="opt1-notes">
        <div class="opt1-label">Notes</div>

        Thank you for your business.<br>
        If you have any questions, please contact us.<br><br>

        <strong>Payment terms:</strong> Due ${due}.
      </div>

      <div>

        <div class="opt1-total-row">
          <span>Subtotal</span>
          <b>${money(subtotal)}</b>
        </div>

        ${
          retainage
            ? `<div class="opt1-total-row">
                <span>Retainage</span>
                <b>− ${money(retainage)}</b>
              </div>`
            : ''
        }

        ${
          paid
            ? `<div class="opt1-total-row">
                <span>Paid</span>
                <b>− ${money(paid)}</b>
              </div>`
            : ''
        }

        <div class="opt1-total-row due">
          <span>AMOUNT DUE</span>
          <span>${money(balance)}</span>
        </div>

      </div>
    </div>

  </div>

  <div class="opt1-photo-footer">
    <div class="opt1-footer-shade">

      <strong>BUILDING A STRONGER TOMORROW</strong>

      <div class="opt1-values">
        <span>◉ SAFETY</span>
        <span>◆ QUALITY</span>
        <span>▣ INTEGRITY</span>
        <span>▥ RESULTS</span>
      </div>

    </div>
  </div>`;
}window.markInvoicePaidGlobal=async(projectId,id)=>{state.activeProjectId=projectId;cache();await markInvoicePaid(id);renderInvoiceCenter();if(activeClientId)renderClientDetail();};
window.previewInvoiceGlobal=(projectId,id)=>{state.activeProjectId=projectId;cache();previewInvoice(id);};
window.previewInvoice=(id)=>{const p=project(),i=(p?.invoices||[]).find(x=>x.id===id);if(!p||!i)return;activeInvoiceId=id;$('invoicePreviewDocument').innerHTML=invoiceHtml(p,i);$('invoiceSendStatus').textContent=i.sentAt?`Last sent to ${i.sentTo||i.clientEmail||p.clientEmail||'customer'} on ${new Date(i.sentAt).toLocaleString()}.`:'';updatePreviewPaidButton(i);$('invoicePreviewModal').classList.remove('hidden');};
function updatePreviewPaidButton(i){const b=$('previewMarkPaidBtn');if(!b)return;b.classList.toggle('hidden',i.status==='paid');}
window.printInvoice=(id)=>{previewInvoice(id);setTimeout(()=>window.print(),80);};
window.sendInvoice=async(id)=>{const p=project(),i=(p?.invoices||[]).find(x=>x.id===id);if(!p||!i)return;const to=(i.clientEmail||p.clientEmail||'').trim();if(!to)return alert('Add the client billing email first.');if(!session?.access_token)return alert('Sign in to ScopeGuard before sending an invoice.');const btn=$('previewSendInvoiceBtn');if(btn)btn.disabled=true;$('invoiceSendStatus').textContent=`Sending ${i.number} to ${to}…`;try{const r=await fetch('/api/send-invoice',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({to,invoice:i,project:{name:p.name,customer:p.customer,clientEmail:p.clientEmail},company:state.company})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Invoice could not be sent.');i.sentAt=new Date().toISOString();i.sentTo=to;i.deliveryMessageId=data.messageId||'';if(cloudEnabled&&session){const {error}=await db.from('invoices').update({sent_at:i.sentAt,sent_to:to,delivery_message_id:i.deliveryMessageId||null}).eq('id',i.id);if(error)console.warn('Invoice sent, but delivery tracking could not be saved:',error.message);}cache();$('invoiceSendStatus').textContent=`✓ Invoice sent to ${to}.`;renderBilling();}catch(e){$('invoiceSendStatus').textContent=e.message;alert(e.message);}finally{if(btn)btn.disabled=false;}};
$('closeInvoicePreview').onclick=()=>{$('invoicePreviewModal').classList.add('hidden');activeInvoiceId=null;};
$('previewPrintInvoiceBtn').onclick=()=>window.print();
$('previewSendInvoiceBtn').onclick=()=>activeInvoiceId&&sendInvoice(activeInvoiceId);
$('previewMarkPaidBtn').onclick=()=>activeInvoiceId&&markInvoicePaid(activeInvoiceId);
$('invoicePreviewModal').addEventListener('click',e=>{if(e.target===$('invoicePreviewModal'))$('closeInvoicePreview').click();});
function openCompanyProfile(){const c=state.company||{};$('profileCompanyName').value=c.name||'';$('profileOwnerName').value=c.owner||'';$('profileEmail').value=c.email||'';$('profilePhone').value=c.phone||'';$('profileAddress').value=c.address||'';$('profileWebsite').value=c.website||'';$('profileLicense').value=c.licenseNumber||'';const img=$('companyLogoPreview');if(c.logoData){img.src=c.logoData;img.classList.remove('hidden')}else{img.removeAttribute('src');img.classList.add('hidden')}show('companyProfile');}
$('companyLogoInput')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1500000)return alert('Please use a company logo under 1.5 MB.');const r=new FileReader();r.onload=()=>{state.company.logoData=String(r.result);$('companyLogoPreview').src=state.company.logoData;$('companyLogoPreview').classList.remove('hidden');};r.readAsDataURL(f);});
$('saveCompanyProfileBtn').onclick=async()=>{const c=state.company;c.name=$('profileCompanyName').value.trim()||c.name;c.owner=$('profileOwnerName').value.trim();c.email=$('profileEmail').value.trim();c.phone=$('profilePhone').value.trim();c.address=$('profileAddress').value.trim();c.website=$('profileWebsite').value.trim();c.licenseNumber=$('profileLicense').value.trim();if(cloudEnabled&&session){const {error}=await db.from('companies').update({name:c.name,owner_name:c.owner||null,email:c.email||null,phone:c.phone||null,address:c.address||null,logo_data:c.logoData||null,website:c.website||null,license_number:c.licenseNumber||null}).eq('id',c.id);if(error)return alert(error.message);}cache();show('dashboard');};
window.markInvoicePaid=async(id)=>{
  const p=project();
  const i=(p?.invoices||[]).find(x=>x.id===id);

  if(!i)return;
  if(i.status==='paid')return;

  if(!confirm(`Mark ${i.number} as paid in full (${money(i.amount)})?`))return;

  if(cloudEnabled&&session){
    const {error}=await db
      .from('invoices')
      .update({
        status:'paid',
        paid_amount:i.amount
      })
      .eq('id',id);

    if(error)return alert(error.message);
  }

  i.status='paid';
  i.paidAmount=i.amount;
  cache();

  renderBilling();
  renderProject();
  renderInvoiceCenter();

  if(activeClientId)renderClientDetail();

  if(activeInvoiceId===id){
    $('invoicePreviewDocument').innerHTML=invoiceHtml(p,i);
    updatePreviewPaidButton(i);
  }
};async function initCloud(){
  try {
    // Supabase publishable credentials are intentionally safe for browser use; RLS protects tenant data.
    const cfg = {
      supabaseUrl: 'https://yqgovlrxyizobsnqycko.supabase.co',
      supabasePublishableKey: 'sb_publishable_w3NPUZg6sWB4u64imbKxpg_f7UM_JTz'
    };
    if(!window.supabase?.createClient) throw new Error('Supabase client failed to load');
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
    cloudEnabled = true;
    const { data } = await db.auth.getSession(); session=data.session;
    db.auth.onAuthStateChange((_event,newSession)=>{session=newSession; updateUserBadge();});
    if(session){ await loadCloudState(); routeAfterAuth(); }
    else { setSync('Cloud ready','cloud'); show('auth'); }
  } catch(e) {
    cloudEnabled=false;
    setSync('Local demo','offline');
    if(state.company) show('home'); else show('onboarding');
  }
}
function routeAfterAuth(){
  updateUserBadge();
  if(state.company) show('home'); else show('onboarding');
}
function updateUserBadge(){
  $('userBadge').classList.toggle('hidden',!session);
  if(session) $('userBadge').textContent=session.user.email||'Signed in';
  $('resetBtn').textContent=session?'Sign out':'Reset';
}
async function loadCloudState(){
  setSync('Syncing…','cloud');
  const {data:members,error:mErr}=await db.from('company_members').select('company_id,role').eq('user_id',session.user.id).limit(1);
  if(mErr) throw mErr;
  if(!members?.length){ state={company:null,projects:[],activeProjectId:null}; cache(); setSync('Cloud synced','cloud'); return; }
  const companyId=members[0].company_id;
  const {data:companyRow,error:cErr}=await db.from('companies').select('id,name,email,phone,address,owner_name,logo_data,website,license_number').eq('id',companyId).single(); if(cErr) throw cErr;
  const {data:projectRows,error:pErr}=await db.from('projects').select('*').eq('company_id',companyId).order('created_at',{ascending:true}); if(pErr) throw pErr;
  const {data:clientRows,error:clErr}=await db.from('clients').select('*').eq('company_id',companyId).order('name',{ascending:true}); if(clErr) throw clErr;
  const ids=(projectRows||[]).map(p=>p.id);
  let logs=[],extras=[],evidence=[],invoices=[];
  if(ids.length){
    const [lr,er,vr,ir]=await Promise.all([
      db.from('field_logs').select('*').in('project_id',ids).order('created_at',{ascending:true}),
      db.from('extra_work').select('*').in('project_id',ids).order('created_at',{ascending:true}),
      db.from('evidence').select('*').in('project_id',ids).order('created_at',{ascending:true}),
      db.from('invoices').select('*').in('project_id',ids).order('invoice_date',{ascending:true})
    ]);
    if(lr.error) throw lr.error;if(er.error) throw er.error;if(vr.error) throw vr.error;if(ir.error) throw ir.error;
    logs=lr.data||[];extras=er.data||[];evidence=vr.data||[];invoices=ir.data||[];
  }
  const signed={};
  await Promise.all(evidence.map(async ev=>{const {data}=await db.storage.from('scopeguard-evidence').createSignedUrl(ev.storage_path,3600);if(data?.signedUrl)signed[ev.id]=data.signedUrl;}));
  state.company={id:companyRow.id,name:companyRow.name,owner:companyRow.owner_name||session.user.email,email:companyRow.email||'',phone:companyRow.phone||'',address:companyRow.address||'',logoData:companyRow.logo_data||'',website:companyRow.website||'',licenseNumber:companyRow.license_number||''};
  state.clients=(clientRows||[]).map(c=>({id:c.id,name:c.name,contactName:c.contact_name||'',email:c.email||'',phone:c.phone||'',address:c.billing_address||'',notes:c.notes||''}));
  state.projects=(projectRows||[]).map(r=>({
    id:r.id,name:r.name,customer:r.customer||'',clientId:r.client_id||'',clientEmail:r.client_email||'',contractValue:Number(r.contract_value||0),scope:r.original_scope||'',laborBudget:Number(r.labor_budget||0),materialBudget:Number(r.material_budget||0),markup:Number(r.extra_markup||20),defaultLaborRate:Number(r.default_labor_rate||42),billed:Number(r.billed||0),collected:Number(r.collected||0),
    logs:logs.filter(l=>l.project_id===r.id).map(l=>({id:l.id,date:new Date(l.work_date+'T12:00:00').toLocaleDateString('en-US'),note:l.note,crewCount:Number(l.crew_count),hoursEach:Number(l.hours_each),laborRate:Number(l.labor_rate),directCost:Number(l.direct_cost),laborHours:Number(l.labor_hours),laborCost:Number(l.labor_cost),productionQty:Number(l.production_qty),productionUnit:l.production_unit||'',analysis:l.analysis||{},photos:evidence.filter(v=>v.field_log_id===l.id).map(v=>({name:v.storage_path.split('/').pop(),data:signed[v.id]||'',storagePath:v.storage_path}))})),
    extras:extras.filter(e=>e.project_id===r.id).map(e=>({id:e.id,sourceLogId:e.source_log_id,date:new Date(e.created_at).toLocaleDateString('en-US'),title:e.title,reason:e.reason||'',status:e.status,laborHours:Number(e.labor_hours),estimatedCost:Number(e.estimated_cost),estimatedValue:Number(e.estimated_value||e.proposed_value),requestedBy:e.requested_by||'',note:e.note||'',confidence:Number(e.confidence||0),photos:evidence.filter(v=>v.extra_work_id===e.id).map(v=>({name:v.storage_path.split('/').pop(),data:signed[v.id]||'',storagePath:v.storage_path})),photoCount:evidence.filter(v=>v.extra_work_id===e.id).length})),
    invoices:invoices.filter(i=>i.project_id===r.id).map(i=>({id:i.id,number:i.invoice_number,date:i.invoice_date,dueDate:i.due_date||'',description:i.description||'',lineItems:Array.isArray(i.line_items)?i.line_items:[],amount:Number(i.amount||0),retainage:Number(i.retainage||0),status:i.status||'invoiced',paidAmount:Number(i.paid_amount||0),clientEmail:i.client_email||r.client_email||'',sentAt:i.sent_at||'',sentTo:i.sent_to||'',deliveryMessageId:i.delivery_message_id||''})),    createdAt:r.created_at
  }));
  if(state.activeProjectId && !state.projects.some(p=>p.id===state.activeProjectId)) state.activeProjectId=state.projects[0]?.id||null;
  cache(); setSync('Cloud synced','cloud');
}

$('signInBtn').onclick=async()=>{
  if(!cloudEnabled)return;
  $('authMessage').textContent='Signing in…';
  const {error}=await db.auth.signInWithPassword({email:$('authEmail').value.trim(),password:$('authPassword').value});
  if(error){$('authMessage').textContent=error.message;return;}
  const {data}=await db.auth.getSession();session=data.session;await loadCloudState();routeAfterAuth();
};
$('signUpBtn').onclick=async()=>{
  if(!cloudEnabled)return;
  $('authMessage').textContent='Creating account…';
  const {data,error}=await db.auth.signUp({email:$('authEmail').value.trim(),password:$('authPassword').value});
  if(error){$('authMessage').textContent=error.message;return;}
  if(!data.session){$('authMessage').textContent='Check your email to confirm your account, then sign in.';return;}
  session=data.session;await loadCloudState();routeAfterAuth();
};
$('demoModeBtn').onclick=()=>{demoMode=true;cloudEnabled=false;setSync('Local demo','offline');state=JSON.parse(localStorage.getItem(storeKey)||'null')||{company:null,projects:[],activeProjectId:null};if(state.company)show('home');else show('onboarding');};

window.openProject=(id)=>{state.activeProjectId=id;cache();show('projectDetail');};
$('createCompanyBtn').onclick=async()=>{
  const name=$('companyName').value.trim();if(!name)return alert('Enter your company name.');
  if(cloudEnabled && session){
    setSync('Saving…','cloud');
    const id=uid();
    const {error:cErr}=await db.from('companies').insert({id,name,owner_user_id:session.user.id});
    if(cErr){setSync('Sync error','offline');return alert(cErr.message);}
    const {error:mErr}=await db.from('company_members').insert({company_id:id,user_id:session.user.id,role:'owner'});
    if(mErr){setSync('Sync error','offline');return alert(mErr.message);}
    state.company={id,name,owner:session.user.email};state.projects=[];cache();await loadCloudState();show('home');return;
  }
  state.company={id:uid(),name,owner:$('ownerName').value.trim(),createdAt:new Date().toISOString()};cache();show('home');};
  // STEP 1.A — MOBILE QUICK ACTIONS

$('quickInvoiceBtn')?.addEventListener('click', () => {
  show('invoiceCenter');
});

$('quickAiInvoiceBtn')?.addEventListener('click', () => {
  alert('AI-assisted invoice creation is being added in Step 1.A.');
});

$('quickClientsBtn')?.addEventListener('click', () => {
  show('clients');
});

$('quickChangeOrderBtn')?.addEventListener('click', () => {
  show('projectCenter');
});

$('homeInvoicesBtn')?.addEventListener('click', () => {
  show('invoiceCenter');
});

$('homeProjectsBtn')?.addEventListener('click', () => {
  show('projectCenter');
});
$('homePhotosBtn')?.addEventListener('click', () => {
  show('projectPhotos');
  renderProjectPhotoFolders();
});

$('backFromProjectPhotos')?.addEventListener('click', () => {
  show('home');
});

$('backToProjectPhotos')?.addEventListener('click', () => {
  show('projectPhotos');
  renderProjectPhotoFolders();
});

function renderProjectPhotoFolders() {
  const container = $('photoProjectFolders');
  if (!container) return;

  const search = ($('photoProjectSearch')?.value || '')
    .trim()
    .toLowerCase();

  const projects = (state.projects || []).filter(p =>
    !search ||
    String(p.name || '').toLowerCase().includes(search) ||
    String(p.customer || '').toLowerCase().includes(search)
  );

  container.innerHTML = projects.length
    ? projects.map(p => `
        <button
          class="home-action-card photo-project-folder"
          onclick="openProjectPhotoFolder('${p.id}')"
        >
          <span class="home-icon">📁</span>

          <span>
            <strong>${escapeHtml(p.name || 'Unnamed Project')}</strong>
            <small>${escapeHtml(p.customer || 'Project photo folder')}</small>
          </span>

          <b>›</b>
        </button>
      `).join('')
    : `
        <div class="card">
          <strong>No projects found</strong>
          <p class="muted">
            Create a project first and its photo folder will appear here automatically.
          </p>
        </div>
      `;
}

$('photoProjectSearch')?.addEventListener('input', renderProjectPhotoFolders);

window.openProjectPhotoFolder = function(projectId) {
  state.activeProjectId = projectId;

  const p = state.projects.find(project => project.id === projectId);
  if (!p) return;

  $('photoFolderProjectName').textContent = p.name || 'Project';
  $('photoFolderCount').textContent = '0 photos';

  show('projectPhotoFolder');
};$('quickNewInvoiceBtn')?.addEventListener('click', () => {
  let chooser = $('quickInvoiceClientChooser');

  if (!chooser) {
    chooser = document.createElement('div');
    chooser.id = 'quickInvoiceClientChooser';
    chooser.innerHTML = `
      <div class="card form-card">
        <span class="eyebrow">NEW INVOICE</span>
        <h2>Choose a client</h2>
        <p class="muted">Select an existing client or add a new client.</p>
        <button id="invoiceExistingClientBtn" class="primary">Existing Client</button>
        <button id="invoiceNewClientBtn" class="secondary">+ New Client</button>
        <button id="invoiceChooserCancelBtn" class="ghost">Cancel</button>
      </div>
    `;

    $('invoiceCenter').appendChild(chooser);

    $('invoiceExistingClientBtn').onclick = () => {
      chooser.remove();
      show('clients');
    };

    $('invoiceNewClientBtn').onclick = () => {
      chooser.remove();
      show('clientForm');
    };

    $('invoiceChooserCancelBtn').onclick = () => {
      chooser.remove();
    };
  }
});$('newProjectBtn').onclick=()=>show('projectForm');
$('companyProfileBtn').onclick=()=>openCompanyProfile();
$('backFromCompanyProfile').onclick=()=>show('home');
$('projectSearch')?.addEventListener('input',renderDashboard);
document.querySelector('[data-project-tab="billing"]')?.addEventListener('click',()=>show('billing'));
$('backToBillingProject').onclick=()=>show('projectDetail');
$('newInvoiceBtn').onclick=()=>{$('invoiceForm').classList.remove('hidden');$('invoiceNumber').value=`INV-${String((project()?.invoices||[]).length+1).padStart(3,'0')}`;$('invoiceDate').value=isoDate();$('invoiceDueDate').value='';$('invoiceAmount').value='';$('invoiceDescription').value='';$('invoiceClientEmail').value=project()?.clientEmail||'';$('invoiceRetainage').value=0;$('invoiceStatus').value='invoiced';};
$('closeInvoiceForm').onclick=()=>$('invoiceForm').classList.add('hidden');
// MULTI-LINE INVOICE ITEMS

function updateInvoiceTotal() {
  const amounts = document.querySelectorAll('.invoice-line-amount');
  let total = 0;

  amounts.forEach((input) => {
    total += Number(input.value) || 0;
  });

  const totalInput = $('invoiceAmount');

  if (totalInput) {
    totalInput.value = total.toFixed(2);
  }
}

function createInvoiceLineItem() {
  const row = document.createElement('div');
  row.className = 'invoice-line-item';

  row.innerHTML = `
    <label>
      Type
      <select class="invoice-line-type">
        <option value="general">General Scope</option>
        <option value="hourly">Hourly</option>
        <option value="material">Material</option>
        <option value="change_order">Change Order</option>
      </select>
    </label>

    <label>
      Description
      <textarea
        class="invoice-line-description"
        rows="3"
        placeholder="Describe the work or charge..."
      ></textarea>
    </label>

    <label>
      Amount ($)
      <input
        class="invoice-line-amount"
        type="number"
        min="0"
        step="0.01"
        value="0"
      />
    </label>

    <button
      type="button"
      class="secondary compact remove-invoice-line-item"
    >
      Remove Line Item
    </button>
  `;

  return row;
}

$('addInvoiceLineItemBtn')?.addEventListener('click', () => {
  const container = $('invoiceLineItems');

  if (!container) return;

  container.appendChild(createInvoiceLineItem());
  updateInvoiceTotal();
});

$('invoiceLineItems')?.addEventListener('input', (event) => {
  if (event.target.classList.contains('invoice-line-amount')) {
    updateInvoiceTotal();
  }
});

$('invoiceLineItems')?.addEventListener('click', (event) => {
  const removeButton = event.target.closest('.remove-invoice-line-item');

  if (!removeButton) return;

  const row = removeButton.closest('.invoice-line-item');

  if (row) {
    row.remove();
    updateInvoiceTotal();
  }
});

function getInvoiceLineItems() {
  return Array.from(document.querySelectorAll('.invoice-line-item'))
    .map((row) => ({
      type: row.querySelector('.invoice-line-type')?.value || 'general',
      description:
        row.querySelector('.invoice-line-description')?.value.trim() || '',
      amount:
        Number(row.querySelector('.invoice-line-amount')?.value) || 0
    }))
    .filter((item) => item.description || item.amount > 0);
}

function syncInvoiceLineItemsForSave() {
  const items = getInvoiceLineItems();
  const descriptionInput = $('invoiceDescription');

  if (descriptionInput) {
    descriptionInput.value = items
      .map((item) => {
        const typeName = {
          general: 'General Scope',
          hourly: 'Hourly',
          material: 'Material',
          change_order: 'Change Order'
        }[item.type] || item.type;

        return `${typeName}: ${item.description} - $${item.amount.toFixed(2)}`;
      })
      .join('\n');
  }

  updateInvoiceTotal();

  return items;
}

$('invoiceLineItems')?.addEventListener('change', () => {
  syncInvoiceLineItemsForSave();
});

updateInvoiceTotal();

// END MULTI-LINE INVOICE ITEMS
$('saveInvoiceBtn').onclick=async()=>{
  const lineItems = syncInvoiceLineItemsForSave();
if (!lineItems.length) return alert('Add at least one invoice line item.');  const p=project();if(!p)return;const amount=Number($('invoiceAmount').value||0);if(amount<=0)return alert('Enter an invoice amount.');
  const email=$('invoiceClientEmail').value.trim(); const clientName=String(p.customer||'').trim()||'Customer';
  let client=(state.clients||[]).find(c=>String(c.name||'').trim().toLowerCase()===clientName.toLowerCase() || (email&&String(c.email||'').trim().toLowerCase()===email.toLowerCase()));
  if(!client){
    const vals={name:clientName,contactName:'',email,phone:'',address:'',notes:'Created automatically from invoice'};
    if(cloudEnabled&&session){const {data,error}=await db.from('clients').insert({company_id:state.company.id,name:vals.name,email:vals.email||null,notes:vals.notes}).select().single();if(error)return alert(error.message);client={id:data.id,...vals};}
    else client={id:uid(),...vals};
    state.clients=state.clients||[];state.clients.push(client);
  } else if(email&&!client.email){client.email=email;if(cloudEnabled&&session){const {error}=await db.from('clients').update({email}).eq('id',client.id);if(error)return alert(error.message);}}
  p.clientId=client.id;p.clientEmail=email||client.email||p.clientEmail||'';
  if(cloudEnabled&&session){const {error}=await db.from('projects').update({client_id:client.id,client_email:p.clientEmail||null}).eq('id',p.id);if(error)return alert(error.message);}
 const inv={
  id:uid(),
  number:$('invoiceNumber').value.trim()||`INV-${Date.now()}`,
  date:$('invoiceDate').value||isoDate(),
  dueDate:$('invoiceDueDate').value||'',
  description:$('invoiceDescription').value.trim(),
  lineItems:lineItems,
  clientEmail:p.clientEmail,
  amount,
  retainage:Number($('invoiceRetainage').value||0),
  status:$('invoiceStatus').value,
  paidAmount:$('invoiceStatus').value==='paid'?amount:0
};  if(cloudEnabled&&session){const row={project_id:p.id,created_by:session.user.id,invoice_number:inv.number,invoice_date:inv.date,due_date:inv.dueDate||null,description:inv.description,line_items:inv.lineItems,client_email:inv.clientEmail||null,amount:inv.amount,retainage:inv.retainage,status:inv.status,paid_amount:inv.paidAmount};const {data,error}=await db.from('invoices').insert(row).select().single();if(error)return alert(error.message);inv.id=data.id;}
  p.invoices=p.invoices||[];p.invoices.push(inv);cache();$('invoiceForm').classList.add('hidden');renderBilling();renderProject();
};
document.querySelectorAll('.back').forEach(b=>b.onclick=()=>show('projectCenter'));
$('saveProjectBtn').onclick=async()=>{
  if(!$('pName').value.trim())return alert('Enter a project name.');
  const local={id:uid(),name:$('pName').value.trim(),customer:$('pCustomer').value.trim(),clientEmail:$('pClientEmail').value.trim(),contractValue:Number($('pContract').value||0),scope:$('pScope').value.trim(),laborBudget:Number($('pLaborBudget').value||0),materialBudget:Number($('pMaterialBudget').value||0),markup:Number($('pMarkup').value||20),defaultLaborRate:Number($('pLaborRate').value||42),logs:[],extras:[],invoices:[],createdAt:new Date().toISOString()};
  if(cloudEnabled && session){
    setSync('Saving…','cloud');
    const matchedClient=(state.clients||[]).find(c=>c.name.trim().toLowerCase()===local.customer.trim().toLowerCase()); if(matchedClient)local.clientId=matchedClient.id;
    const row={company_id:state.company.id,name:local.name,customer:local.customer,client_id:local.clientId||null,client_email:local.clientEmail||null,contract_value:local.contractValue,original_scope:local.scope,labor_budget:local.laborBudget,material_budget:local.materialBudget,extra_markup:local.markup,default_labor_rate:local.defaultLaborRate};
    const {data,error}=await db.from('projects').insert(row).select().single();
  if(error){setSync('Sync error','offline');return alert(error.message);} local.id=data.id; setSync('Cloud synced','cloud');
  }
  state.projects.push(local);state.activeProjectId=local.id;cache();show('projectDetail');
};
$('newLogBtn').onclick=()=>prepareLog(); $('backToProject').onclick=()=>show('projectDetail');
$('quickLogNav').onclick=()=>{if(!state.projects.length)return alert('Create a project first.');if(!state.activeProjectId)state.activeProjectId=state.projects[0].id;prepareLog();};
document.querySelector('[data-nav="dashboard"]').onclick=()=>show('home');
function prepareLog(){const p=project();if(!p)return show('dashboard');$('logNote').value='';$('workPerformed').value='';$('directedBy').value='';$('crewCount').value='';$('hoursEach').value='';$('laborRate').value=p.defaultLaborRate||42;$('directCost').value=0;$('productionQty').value='';$('productionUnit').value='';pendingPhotos=[];document.querySelectorAll('.quick-chips button').forEach(b=>b.classList.remove('active'));renderPhotoPreview();updateQuickLogSummary();$('analysisResult').classList.add('hidden');show('fieldLog');}

$('photoInput').onchange=async(e)=>{const files=[...e.target.files].slice(0,6);pendingPhotos=[];for(const file of files){if(file.size>8_000_000){alert(`${file.name} is over 8 MB and was skipped.`);continue;}pendingPhotos.push({name:file.name,type:file.type,data:URL.createObjectURL(file),file});}renderPhotoPreview();};
function renderPhotoPreview(){$('photoPreview').innerHTML=pendingPhotos.map((p,i)=>`<div class="photo-tile"><img src="${p.data}" alt="Evidence ${i+1}"/><button onclick="removePhoto(${i})">×</button><div class="photo-status">${cloudEnabled?'Uploads securely when saved':'Stored on this device'}</div></div>`).join('');updateQuickLogSummary();}
window.removePhoto=(i)=>{pendingPhotos.splice(i,1);renderPhotoPreview();};
function updateQuickLogSummary(){const crew=Number($('crewCount')?.value||0),hrs=Number($('hoursEach')?.value||0),rate=Number($('laborRate')?.value||0),total=crew*hrs,cost=total*rate;if($('laborQuickSummary'))$('laborQuickSummary').textContent=total?`${crew} workers × ${hrs} hrs = ${total} labor hrs · ${money(cost)} labor`:'Enter workers + hours to see labor total.';if($('saveLogHours'))$('saveLogHours').textContent=`${total} labor hrs`;if($('saveLogPhotos'))$('saveLogPhotos').textContent=`${pendingPhotos.length} photo${pendingPhotos.length===1?'':'s'}`;}
['crewCount','hoursEach','laborRate'].forEach(id=>$(id)?.addEventListener('input',updateQuickLogSummary));
document.querySelectorAll('.quick-chips button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.quick-chips button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');$('directedBy').value=btn.dataset.requester||'';}));
function buildFieldNote(){const work=$('workPerformed').value.trim(),directed=$('directedBy').value.trim(),details=$('logNote').value.trim();return [work&&`Work performed: ${work}`,directed&&`Directed/requested by: ${directed}`,details].filter(Boolean).join('. ');}

async function analyzeLog(payload){
  try{const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(r.ok)return await r.json();}catch(_){ }
  return localAnalyze(payload);
}
function localAnalyze({note,scope,crewCount,hoursEach,laborRate,directCost,markup}){
  const n=note.toLowerCase(),s=(scope||'').toLowerCase();const triggers=['extra','additional','not in scope','not shown','not on','asked us','requested','changed','change','rework','redo','outside scope','added','directed us','gc asked','owner asked'];const matched=triggers.filter(t=>n.includes(t));const scopeWords=s.split(/\W+/).filter(w=>w.length>5);const noteWords=n.split(/\W+/);const overlap=scopeWords.filter(w=>noteWords.includes(w)).length;const likely=matched.length>0||(n.length>80&&overlap<2&&/(install|remove|repair|demo|cut|drill|pour|form|place|excavat|backfill)/.test(n));const laborHours=Number(crewCount||0)*Number(hoursEach||0);const cost=laborHours*Number(laborRate||0)+Number(directCost||0);const value=Math.round(cost*(1+Number(markup||20)/100));return {is_extra:likely,confidence:likely?(matched.length>1?0.88:0.72):0.35,title:likely?'Potential out-of-scope field work':'Field work appears consistent with scope',reason:likely?(matched.length?`Language indicating a change was detected: ${matched.slice(0,3).join(', ')}.`:'The note has little overlap with the stored original scope and describes new work.'):'No strong change-order language was detected.',labor_hours:laborHours,estimated_cost:cost,estimated_value:value,source:'on-device fallback'};
}
async function uploadEvidence(p, logId, extraId){
  const uploaded=[];
  for(const photo of pendingPhotos){
    const path=`${session.user.id}/${state.company.id}/${p.id}/${uid()}-${safeName(photo.name)}`;
    const {error:upErr}=await db.storage.from('scopeguard-evidence').upload(path,photo.file,{contentType:photo.type||'image/jpeg',upsert:false});
    if(upErr) throw upErr;
    const {data:ev,error:evErr}=await db.from('evidence').insert({company_id:state.company.id,project_id:p.id,field_log_id:logId,extra_work_id:extraId||null,storage_path:path,mime_type:photo.type||null,created_by:session.user.id}).select().single();
    if(evErr) throw evErr;
    const {data:signed}=await db.storage.from('scopeguard-evidence').createSignedUrl(path,3600);
    uploaded.push({name:photo.name,data:signed?.signedUrl||'',storagePath:path,evidenceId:ev.id});
  }
  return uploaded;
}
$('analyzeBtn').onclick=async()=>{
  const p=project();const note=buildFieldNote();if(!note)return alert('Enter the work performed or a field note.');
  $('analyzeBtn').disabled=true;$('analyzeBtn').textContent='Analyzing…';
  try{
    const payload={note,scope:p.scope,crewCount:Number($('crewCount').value||0),hoursEach:Number($('hoursEach').value||0),laborRate:Number($('laborRate').value||0),directCost:Number($('directCost').value||0),markup:Number(p.markup||20),productionQty:Number($('productionQty').value||0),productionUnit:$('productionUnit').value.trim()};
    const analysis=await analyzeLog(payload);
    let log={id:uid(),date:nowDate(),...payload,laborHours:payload.crewCount*payload.hoursEach,laborCost:payload.crewCount*payload.hoursEach*payload.laborRate,photos:[],analysis};
    let extra=null;
    if(cloudEnabled&&session){
      setSync('Saving field log…','cloud');
      const {data:lr,error:lErr}=await db.from('field_logs').insert({company_id:state.company.id,project_id:p.id,created_by:session.user.id,work_date:isoDate(),log_date:isoDate(),note,notes:note,crew_count:payload.crewCount,workers:payload.crewCount,hours_each:payload.hoursEach,labor_rate:payload.laborRate,direct_cost:payload.directCost,production_qty:payload.productionQty,production_unit:payload.productionUnit,analysis}).select().single();
      if(lErr)throw lErr;log.id=lr.id;log.laborHours=Number(lr.labor_hours);log.laborCost=Number(lr.labor_cost);
      if(analysis.is_extra){
        const extraRow={company_id:state.company.id,project_id:p.id,source_log_id:log.id,field_log_id:log.id,created_by:session.user.id,title:analysis.title||'Potential extra work',description:note,reason:analysis.reason||'',note,requested_by:$('directedBy').value.trim()||extractRequester(note),labor_hours:Number(analysis.labor_hours||log.laborHours),estimated_cost:Number(analysis.estimated_cost||log.laborCost+payload.directCost),estimated_value:Number(analysis.estimated_value||0),proposed_value:Number(analysis.estimated_value||0),confidence:Number(analysis.confidence||0),status:'potential'};
        const {data:er,error:eErr}=await db.from('extra_work').insert(extraRow).select().single();if(eErr)throw eErr;
        extra={id:er.id,sourceLogId:log.id,date:nowDate(),title:er.title,reason:er.reason,status:er.status,laborHours:Number(er.labor_hours),estimatedCost:Number(er.estimated_cost),estimatedValue:Number(er.estimated_value),photoCount:0,photos:[],requestedBy:er.requested_by,note:er.note,confidence:Number(er.confidence)};
      }
      const photos=await uploadEvidence(p,log.id,extra?.id);log.photos=photos;if(extra){extra.photos=photos;extra.photoCount=photos.length;}
      setSync('Cloud synced','cloud');
    } else {
      log.photos=await Promise.all(pendingPhotos.map(async x=>({name:x.name,type:x.type,data:await fileToDataURL(x.file)})));
      if(analysis.is_extra){extra={id:uid(),sourceLogId:log.id,date:nowDate(),title:analysis.title||'Potential extra work',reason:analysis.reason||'Potential out-of-scope work',status:'potential',laborHours:analysis.labor_hours||log.laborHours,estimatedCost:Number(analysis.estimated_cost||log.laborCost+payload.directCost),estimatedValue:Number(analysis.estimated_value||0),photoCount:log.photos.length,photos:log.photos,requestedBy:$('directedBy').value.trim()||extractRequester(note),note,confidence:analysis.confidence||0};}
    }
    p.logs.push(log);if(extra)p.extras.push(extra);cache();
    $('analysisResult').innerHTML=analysis.is_extra?`<div class="flag"><div class="flag-icon">⚠️</div><div><h3>Potential extra work detected</h3><p><strong>${escapeHtml(extra.title)}</strong></p><p>${escapeHtml(extra.reason)}</p><p>${extra.laborHours} labor hrs · ${money(extra.estimatedCost)} estimated cost · <strong>${money(extra.estimatedValue)} suggested value</strong></p><p class="muted">Analysis: ${escapeHtml(analysis.source||'ScopeGuard AI')} · confidence ${Math.round((analysis.confidence||0)*100)}%</p></div></div><button class="primary result-btn" onclick="openExtra('${extra.id}')">Open extra-work record</button>`:`<div class="ok-box"><strong>✓ Field log saved.</strong><p>No strong out-of-scope signal was detected. The record and photos are preserved.</p></div><button class="primary result-btn" onclick="showProjectAfterLog()">Return to project</button>`;
    $('analysisResult').classList.remove('hidden');
  }catch(e){setSync(cloudEnabled?'Sync error':'Local demo','offline');alert(`Could not save this field log: ${e.message||e}`);}finally{$('analyzeBtn').disabled=false;$('analyzeBtn').textContent='Analyze & save field log';}
};
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}
function extractRequester(note){const m=note.match(/\b(GC|general contractor|owner|superintendent|architect|engineer|customer|foreman)\b/i);return m?m[0]:'Field direction';}
function inferLaborFromNote(note=''){
  const t=String(note).toLowerCase().replace(/,/g,'');
  const crew=(t.match(/(\d+(?:\.\d+)?)\s*(?:guys|workers|men|people|laborers|crew members)/)||[])[1];
  const hours=(t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:each|per\s+(?:guy|worker|person|man))?/ )||[])[1];
  const days=(t.match(/(?:for\s+)?(\d+(?:\.\d+)?)\s*days?/ )||[])[1];
  if(crew&&hours){const total=Number(crew)*Number(hours)*Number(days||1);return {crew:Number(crew),hours:Number(hours),days:Number(days||1),total};}
  return null;
}
function consistencyWarning(note,enteredHours){const x=inferLaborFromNote(note);if(!x||!enteredHours)return null;const diff=Math.abs(x.total-enteredHours);if(diff<0.5)return null;return `Your note appears to describe ${x.crew} workers × ${x.hours} hrs × ${x.days} day${x.days===1?'':'s'} = ${x.total} labor hours, but the field inputs total ${enteredHours} hours.`;}
window.showProjectAfterLog=()=>show('projectDetail');

window.openExtra=(id)=>{const p=project();const e=(p.extras||[]).find(x=>x.id===id);if(!e)return;activeExtraId=id;const warn=consistencyWarning(e.note,e.laborHours);$('extraDocument').innerHTML=`<div id="printArea"><div class="doc-head"><div><div class="brand">ScopeGuard</div><div class="muted">Extra Work Record</div></div><div class="doc-number">EWR-${escapeHtml(e.id.slice(0,8).toUpperCase())}</div></div><h2>${escapeHtml(p.name)}</h2><div class="doc-grid"><div><span>Company</span><strong>${escapeHtml(state.company.name)}</strong></div><div><span>GC / Customer</span><strong>${escapeHtml(p.customer||'—')}</strong></div><div><span>Date</span><strong>${escapeHtml(e.date)}</strong></div><div><span>Status</span><strong>${escapeHtml(e.status)}</strong></div></div><h3>Work description</h3><p>${escapeHtml(e.note)}</p><h3>Why ScopeGuard flagged it</h3><p>${escapeHtml(e.reason)}</p>${warn?`<div class="consistency-warning"><strong>⚠ Labor-hour mismatch</strong><br>${escapeHtml(warn)}<button type="button" class="primary" style="margin-top:12px" onclick="correctExtraLaborHours()">Correct to ${inferLaborFromNote(e.note)?.total||e.laborHours} Hours</button></div>`:''}<div class="extra-editor"><label>Status<select id="extraStatusEdit"><option value="potential" ${e.status==='potential'?'selected':''}>Potential</option><option value="submitted" ${e.status==='submitted'?'selected':''}>Submitted</option><option value="approved" ${e.status==='approved'?'selected':''}>Approved</option><option value="rejected" ${e.status==='rejected'?'selected':''}>Rejected</option></select></label><label>Proposed value<input id="extraValueEdit" type="number" min="0" step="0.01" value="${Number(e.estimatedValue||0)}"></label><button type="button" class="secondary" onclick="saveExtraChanges()">Save status & value</button>${e.status!=='approved'?`<button type="button" class="primary approve-co-btn" onclick="approveChangeOrder()">✓ Approve Change Order</button>`:`<div class="approved-co-banner">✓ Approved Change Order</div>`}</div><div class="doc-grid"><div><span>Labor hours</span><strong>${e.laborHours||0}</strong></div><div><span>Estimated cost</span><strong>${money(e.estimatedCost)}</strong></div><div><span>Suggested value</span><strong>${money(e.estimatedValue)}</strong></div><div><span>Evidence</span><strong>${e.photoCount||0} photo${e.photoCount===1?'':'s'}</strong></div></div>${(e.photos||[]).length?`<h3>Photo evidence</h3><div class="doc-photos">${e.photos.filter(x=>x.data).map(x=>`<img src="${x.data}" alt="Evidence"/>`).join('')}</div>`:''}<div class="signature-grid"><div>Requested / directed by<br><span>${escapeHtml(e.requestedBy||'________________')}</span></div><div>Prepared by<br><span>${escapeHtml(state.company.owner||'________________')}</span></div></div><p class="legal-note">This record documents field conditions and potential extra work. Contract entitlement and final pricing remain subject to the governing contract and approval process.</p></div>`;$('extraModal').classList.remove('hidden');};
window.correctExtraLaborHours=async()=>{const p=project();const e=(p?.extras||[]).find(x=>x.id===activeExtraId);if(!e)return;const inferred=inferLaborFromNote(e.note);if(!inferred||!inferred.total)return;const oldCost=Number(e.estimatedCost||0),oldValue=Number(e.estimatedValue||0);const sourceLog=(p.logs||[]).find(x=>x.id===e.sourceLogId);const rate=Number(sourceLog?.laborRate||p.defaultLaborRate||42);const direct=Number(sourceLog?.directCost||0);const newHours=inferred.total;const newCost=newHours*rate+direct;const valueRatio=oldCost>0&&oldValue>0?oldValue/oldCost:1+(Number(p.markup||20)/100);const newValue=Math.round(newCost*valueRatio*100)/100;try{if(cloudEnabled){const updates=[db.from('extra_work').update({labor_hours:newHours,estimated_cost:newCost,estimated_value:newValue,proposed_value:newValue}).eq('id',e.id)];if(sourceLog?.id&&inferred.crew>0)updates.push(db.from('field_logs').update({crew_count:inferred.crew,workers:inferred.crew,hours_each:newHours/inferred.crew}).eq('id',sourceLog.id));const results=await Promise.all(updates);const err=results.find(r=>r.error)?.error;if(err)throw err;}e.laborHours=newHours;e.estimatedCost=newCost;e.estimatedValue=newValue;if(sourceLog){sourceLog.crewCount=inferred.crew;sourceLog.hoursEach=newHours/inferred.crew;sourceLog.laborHours=newHours;sourceLog.laborCost=newHours*rate;}cache();renderProject();renderDashboard();openExtra(e.id);}catch(err){alert(`Could not correct labor hours: ${err.message||err}`);}};

window.approveChangeOrder=async()=>{const p=project();const e=(p?.extras||[]).find(x=>x.id===activeExtraId);if(!e)return;const value=Number($('extraValueEdit')?.value||e.estimatedValue||0);try{if(cloudEnabled){const {error}=await db.from('extra_work').update({status:'approved',estimated_value:value,proposed_value:value}).eq('id',e.id);if(error)throw error;}e.status='approved';e.estimatedValue=value;cache();renderProject();renderDashboard();openExtra(e.id);}catch(err){alert(`Could not approve change order: ${err.message||err}`);}};
window.saveExtraChanges=async()=>{const p=project();const e=(p?.extras||[]).find(x=>x.id===activeExtraId);if(!e)return;const status=$('extraStatusEdit').value;const value=Number($('extraValueEdit').value||0);try{if(cloudEnabled){const {error}=await db.from('extra_work').update({status,estimated_value:value,proposed_value:value}).eq('id',e.id);if(error)throw error;}e.status=status;e.estimatedValue=value;cache();renderProject();renderDashboard();openExtra(e.id);}catch(err){alert(`Could not update extra work: ${err.message||err}`);}};
$('closeModal').onclick=()=>$('extraModal').classList.add('hidden');$('printExtraBtn').onclick=()=>window.print();$('extraModal').onclick=(e)=>{if(e.target===$('extraModal'))$('extraModal').classList.add('hidden');};

let recognition;$('voiceBtn').onclick=()=>{const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition)return alert('Voice dictation is not supported in this browser. Use your phone keyboard microphone or type the note.');if(!recognition){recognition=new SpeechRecognition();recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=false;recognition.onresult=e=>{$('logNote').value=($('logNote').value+' '+e.results[0][0].transcript).trim();};recognition.onend=()=>{$('voiceBtn').textContent='🎙 Dictate';};}$('voiceBtn').textContent='Listening…';recognition.start();};
$('resetBtn').onclick=async()=>{if(session&&cloudEnabled){await db.auth.signOut();session=null;state={company:null,projects:[],activeProjectId:null};cache();updateUserBadge();setSync('Cloud ready','cloud');show('auth');return;}if(confirm('Reset all ScopeGuard demo data on this device?')){localStorage.removeItem(storeKey);location.reload();}};
$('homeInvoicesBtn')?.addEventListener('click',()=>show('invoiceCenter'));
$('homeProjectsBtn')?.addEventListener('click',()=>show('projectCenter'));
$('backFromInvoiceCenter')?.addEventListener('click',()=>show('home'));
$('backFromProjectCenter')?.addEventListener('click',()=>show('home'));
$('projectCenterNewBtn')?.addEventListener('click',()=>show('projectForm'));
$('activeProjectsBtn')?.addEventListener('click',()=>{projectCenterMode='active';renderProjectCenter();});
$('finishedProjectsBtn')?.addEventListener('click',()=>{projectCenterMode='finished';renderProjectCenter();});
$('centerProjectSearch')?.addEventListener('input',renderProjectCenter);
$('bottomNav')?.querySelector('[data-nav="dashboard"]')?.addEventListener('click',()=>show('home'));
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
initCloud();

document.querySelector('[data-project-tab="overview"]')?.addEventListener('click',()=>{document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.remove('active'));document.querySelector('[data-project-tab="overview"]').classList.add('active');document.getElementById('projectMetrics')?.scrollIntoView({behavior:'smooth',block:'start'});});
document.querySelector('[data-project-tab="logs"]')?.addEventListener('click',()=>{document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.remove('active'));document.querySelector('[data-project-tab="logs"]').classList.add('active');document.getElementById('projectLogsSection')?.scrollIntoView({behavior:'smooth',block:'start'});});
document.querySelector('[data-project-tab="changes"]')?.addEventListener('click',()=>{document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.remove('active'));document.querySelector('[data-project-tab="changes"]').classList.add('active');document.getElementById('projectChangesSection')?.scrollIntoView({behavior:'smooth',block:'start'});});

// Menu + client directory
function closeMenu(){$('menuDrawer')?.classList.add('hidden');}
$('menuBtn')?.addEventListener('click',()=> $('menuDrawer').classList.remove('hidden'));
$('closeMenuBtn')?.addEventListener('click',closeMenu);$('menuBackdrop')?.addEventListener('click',closeMenu);
[['menuHomeBtn','home'],['menuClientsBtn','clients'],['menuEmailBtn','emailSettings'],['menuInvoicesBtn','invoiceCenter'],['menuProjectsBtn','projectCenter']].forEach(([b,v])=>$(b)?.addEventListener('click',()=>{closeMenu();show(v);}));
$('menuCompanyBtn')?.addEventListener('click',()=>{closeMenu();openCompanyProfile();});
$('backFromClients')?.addEventListener('click',()=>show('home'));$('backToClients')?.addEventListener('click',()=>show('clients'));$('backFromClientForm')?.addEventListener('click',()=>show('clients'));$('clientSearch')?.addEventListener('input',renderClients);
$('newClientBtn')?.addEventListener('click',()=>{editingClientId=null;$('clientFormTitle').textContent='Add client';['clientName','clientContactName','clientEmail','clientPhone','clientAddress','clientNotes'].forEach(id=>$(id).value='');show('clientForm');});
$('saveClientBtn')?.addEventListener('click',async()=>{const name=$('clientName').value.trim();if(!name)return alert('Enter the client name.');let c=editingClientId?(state.clients||[]).find(x=>x.id===editingClientId):null;const vals={name,contactName:$('clientContactName').value.trim(),email:$('clientEmail').value.trim(),phone:$('clientPhone').value.trim(),address:$('clientAddress').value.trim(),notes:$('clientNotes').value.trim()};if(cloudEnabled&&session){const row={company_id:state.company.id,name:vals.name,contact_name:vals.contactName||null,email:vals.email||null,phone:vals.phone||null,billing_address:vals.address||null,notes:vals.notes||null};if(c){const {error}=await db.from('clients').update(row).eq('id',c.id);if(error)return alert(error.message);}else{const {data,error}=await db.from('clients').insert(row).select().single();if(error)return alert(error.message);c={id:data.id,...vals};}}if(c)Object.assign(c,vals);else c={id:uid(),...vals};state.clients=state.clients||[];if(!state.clients.some(x=>x.id===c.id))state.clients.push(c);for(const p of state.projects){if(!p.clientId&&String(p.customer||'').trim().toLowerCase()===name.toLowerCase()){p.clientId=c.id;p.clientEmail=p.clientEmail||c.email;if(cloudEnabled&&session)await db.from('projects').update({client_id:c.id,client_email:p.clientEmail||null}).eq('id',p.id);}}cache();editingClientId=null;activeClientId=c.id;show('clientDetail');});


async function refreshEmailConnection(){
  const text=$('emailConnectionText'),badge=$('emailConnectionBadge'),connect=$('connectGmailBtn'),disconnect=$('disconnectGmailBtn');
  if(!text||!session?.access_token)return;
  text.textContent='Checking connection…';
  try{const r=await fetch('/api/email-status',{headers:{Authorization:`Bearer ${session.access_token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not check email connection.');
    if(d.connected){text.textContent=`Connected as ${d.email}`;badge.textContent='Connected';connect.textContent='Reconnect Gmail';disconnect.classList.remove('hidden');}
    else{text.textContent='No Gmail account connected.';badge.textContent='Not connected';connect.textContent='Connect Gmail';disconnect.classList.add('hidden');}
  }catch(e){text.textContent=e.message;badge.textContent='Unavailable';}
}
$('menuEmailBtn')?.addEventListener('click',()=>setTimeout(refreshEmailConnection,0));
$('connectGmailBtn')?.addEventListener('click',async()=>{if(!session?.access_token)return alert('Sign in first.');const st=$('emailSettingsStatus');st.textContent='Opening Google authorization…';try{const r=await fetch('/api/email-connect',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not start Gmail connection.');location.href=d.url;}catch(e){st.textContent=e.message;}});
$('disconnectGmailBtn')?.addEventListener('click',async()=>{if(!confirm('Disconnect Gmail from ScopeGuard?'))return;const r=await fetch('/api/email-disconnect',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`}});const d=await r.json();if(!r.ok)return alert(d.error||'Could not disconnect Gmail.');refreshEmailConnection();});
const emailParams=new URLSearchParams(location.search);if(emailParams.get('email')){window.addEventListener('load',()=>{if(emailParams.get('email')==='connected')alert('Gmail connected successfully. You can now send invoices from your own email.');else alert(emailParams.get('message')||'Gmail connection failed.');history.replaceState({},'',location.pathname);});}
