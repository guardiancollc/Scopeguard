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

let scopeguardAccess = null;
function scopeguardFeatureAllowed(feature){
  return !cloudEnabled || demoMode || scopeguardAccess?.[feature] === true;
}
function applyScopeguardFeatureVisibility(){
  const changeOrders = scopeguardFeatureAllowed('changeOrders');
  const ai = scopeguardFeatureAllowed('ai');
  const controls = [
    ['quickAiInvoiceBtn', ai],
    ['quickChangeOrderBtn', changeOrders],
    ['newLogBtn', changeOrders]
  ];
  for(const [id, allowed] of controls){
    const element = document.getElementById(id);
    if(element) element.hidden = !allowed;
  }
  document.querySelectorAll('[data-project-tab="changes"]').forEach(el => { el.hidden = !changeOrders; });
  const changes = document.getElementById('projectChangesSection');
  if(changes) changes.hidden = !changeOrders;
  const approved = document.getElementById('approvedExtraList')?.closest('.card');
  if(approved) approved.hidden = !changeOrders;
}
function show(id){
  if(cloudEnabled && !demoMode && scopeguardAccess){
    if(id === 'extraDocument' && !scopeguardFeatureAllowed('changeOrders')){
      alert('Change orders require the Business plan.');
      return;
    }
  }
  applyScopeguardFeatureVisibility();
  document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));
  $(id).classList.remove('hidden');
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
  if(due){
    const end=new Date(`${due}T23:59:59`);
    if(end < new Date()) return 'overdue';
  }
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

function isFinishedProject(p){
  return ['finished','complete','completed','closed'].includes(String(p.status||'active').toLowerCase());
}

function renderProjectCenter(){
  const active=state.projects.filter(p=>!isFinishedProject(p));
  const finished=state.projects.filter(isFinishedProject);

  $('activeProjectCount').textContent=active.length;
  $('finishedProjectCount').textContent=finished.length;

  $('activeProjectsBtn').classList.toggle('active',projectCenterMode==='active');
  $('finishedProjectsBtn').classList.toggle('active',projectCenterMode==='finished');

  const q=($('centerProjectSearch')?.value||'').trim().toLowerCase();
  const base=projectCenterMode==='active'?active:finished;

  const list=base.filter(p=>
    !q||[p.name,p.customer,p.scope].join(' ').toLowerCase().includes(q)
  );

  $('centerProjectList').innerHTML=list.length
    ?list.map(p=>{
      const c=calcProject(p);
      return `<div class="project-row project-workspace-card">
        <div class="project-card-main">
          <div class="project-title">${escapeHtml(p.name)}</div>
          <div class="row-sub">${escapeHtml(p.customer||'No customer')}</div>
          <div class="project-card-financials">
            <span><small>Contract</small><b>${money(p.contractValue)}</b></span>
            <span><small>Cost</small><b>${money(c.costs)}</b></span>
            <span><small>Profit</small><b class="positive">${money(c.profit)}</b></span>
          </div>
        </div>
        <button onclick="openProject('${p.id}')">Open →</button>
      </div>`;
    }).join('')
    :`<div class="card"><p class="muted">No ${projectCenterMode} projects.</p></div>`;
}

function clientProjects(c){
  return state.projects.filter(p=>
    p.clientId===c.id||
    (!p.clientId&&String(p.customer||'').trim().toLowerCase()===String(c.name||'').trim().toLowerCase())
  );
}

function clientInvoices(c){
  return clientProjects(c).flatMap(p=>
    (p.invoices||[]).map(i=>({p,i,state:invoiceState(i)}))
  );
}

function renderClients(){
  const q=($('clientSearch')?.value||'').trim().toLowerCase();

  const clients=(state.clients||[]).filter(c=>
    !q||[c.name,c.contactName,c.email,c.phone].join(' ').toLowerCase().includes(q)
  );

  $('clientList').innerHTML=clients.length
    ?clients.map(c=>{
      const ps=clientProjects(c);
      const inv=clientInvoices(c);
      const open=inv
        .filter(x=>x.state==='open'||x.state==='overdue')
        .reduce((a,x)=>a+Number(x.i.amount||0)-Number(x.i.paidAmount||0),0);

      return `<div class="client-card">
        <div>
          <h3>${escapeHtml(c.name)}</h3>
          <div class="row-sub">${escapeHtml(c.contactName||c.email||'No contact added')}</div>
          <div class="row-sub">${ps.length} project${ps.length===1?'':'s'} · ${money(open)} outstanding</div>
        </div>
        <button class="secondary" onclick="openClient('${c.id}')">Open →</button>
      </div>`;
    }).join('')
    :'<div class="card"><p class="muted">No clients yet. Add your first client.</p></div>';
}

window.openClient=(id)=>{
  activeClientId=id;
  show('clientDetail');
};

function renderClientDetail(){
  const c=(state.clients||[]).find(x=>x.id===activeClientId);
  if(!c)return show('clients');

  const ps=clientProjects(c);
  const rows=clientInvoices(c);

  const invoiced=rows.reduce((a,x)=>a+Number(x.i.amount||0),0);
  const paid=rows.reduce((a,x)=>a+Number(x.i.paidAmount||0),0);
  const open=rows
    .filter(x=>x.state==='open')
    .reduce((a,x)=>a+Number(x.i.amount||0)-Number(x.i.paidAmount||0),0);
  const overdue=rows
    .filter(x=>x.state==='overdue')
    .reduce((a,x)=>a+Number(x.i.amount||0)-Number(x.i.paidAmount||0),0);

  $('clientDetailContent').innerHTML=`
    <div class="section-head">
      <div>
        <span class="eyebrow">CLIENT</span>
        <h2>${escapeHtml(c.name)}</h2>
        <p class="muted">
          ${escapeHtml(c.contactName||'')}
          ${c.email?` · ${escapeHtml(c.email)}`:''}
          ${c.phone?` · ${escapeHtml(c.phone)}`:''}
        </p>
      </div>

      <div class="head-actions">
        <button class="secondary compact" onclick="editClient('${c.id}')">Edit</button>
        <button class="primary compact" onclick="createInvoiceForClient('${c.id}')">+ Invoice</button>
      </div>
    </div>

    <div class="client-kpis">
      <div class="metric">
        <div class="label">Total invoiced</div>
        <div class="value">${money(invoiced)}</div>
      </div>

      <div class="metric">
        <div class="label">Open invoices</div>
        <div class="value">${money(open)}</div>
      </div>

      <div class="metric">
        <div class="label">Past due</div>
        <div class="value">${money(overdue)}</div>
      </div>
    </div>

    <div class="card">
      <h3>Projects with this client</h3>
      ${
        ps.length
          ?ps.map(p=>`
            <div class="client-project-row">
              <strong>${escapeHtml(p.name)}</strong>
              <div class="row-sub">Contract ${money(p.contractValue)}</div>
              <button class="ghost small" onclick="openProject('${p.id}')">Open project →</button>
            </div>
          `).join('')
          :'<p class="muted">No projects linked yet.</p>'
      }
    </div>

    <div class="card">
      <h3>Invoices</h3>
      ${
        rows.length
          ?rows.map(({p,i,state})=>`
            <div class="client-invoice-row">
              <div>
                <strong>${escapeHtml(i.number)}</strong>
                <div class="row-sub">
                  ${escapeHtml(p.name)} · ${state==='overdue'?'Past due':state}
                </div>
              </div>

              <div>
                <strong>${money(i.amount)}</strong>
                <button class="ghost small" onclick="previewInvoiceGlobal('${p.id}','${i.id}')">Preview</button>
                ${
                  i.status!=='paid'
                    ?`<button class="ghost small" onclick="markInvoicePaidGlobal('${p.id}','${i.id}')">✓ Mark Paid</button>`
                    :''
                }
              </div>
            </div>
          `).join('')
          :'<p class="muted">No invoices yet.</p>'
      }
    </div>
  `;
}

window.editClient=(id)=>{
  const c=(state.clients||[]).find(x=>x.id===id);
  if(!c)return;

  editingClientId=id;
  $('clientFormTitle').textContent='Edit client';
  $('clientName').value=c.name;
  $('clientContactName').value=c.contactName||'';
  $('clientEmail').value=c.email||'';
  $('clientPhone').value=c.phone||'';
  $('clientAddress').value=c.address||'';
  $('clientNotes').value=c.notes||'';
  show('clientForm');
};

window.createInvoiceForClient=(id)=>{
  const c=(state.clients||[]).find(x=>x.id===id);
  const ps=clientProjects(c);

  if(!ps.length)return alert('Create a project for this client first.');

  let p=ps[0];

  if(ps.length>1){
    const names=ps.map((x,n)=>`${n+1}. ${x.name}`).join('\n');
    const pick=Number(prompt(`Choose a project for this invoice:\n${names}`)||0);
    if(!pick||!ps[pick-1])return;
    p=ps[pick-1];
  }

  state.activeProjectId=p.id;
  cache();
  show('billing');
  $('newInvoiceBtn').click();
  $('invoiceClientEmail').value=c.email||p.clientEmail||'';
};

function renderDashboard(){
  $('companyTitle').textContent=state.company?.name||'Your company';
  $('projectCount').textContent=`${state.projects.length} project${state.projects.length===1?'':'s'}`;

  const totals=state.projects.reduce((a,p)=>{
    const c=calcProject(p);
    a.contract+=Number(p.contractValue||0);
    a.costs+=c.costs;
    a.potential+=c.potentialChangeOrders;
    a.approved+=c.approvedChangeOrders;
    a.originalProfit+=c.originalContractProfit;
    a.coProfit+=c.approvedChangeOrderProfit;
    a.profit+=c.profit;
    return a;
  },{
    contract:0,
    costs:0,
    potential:0,
    approved:0,
    originalProfit:0,
    coProfit:0,
    profit:0
  });

  $('metrics').innerHTML=`
    <div class="metric">
      <div class="label">All projects · contract value</div>
      <div class="value">${money(totals.contract)}</div>
      <div class="sub">Company portfolio total</div>
    </div>

    <div class="metric light">
      <div class="label">All projects · project cost</div>
      <div class="value">${money(totals.costs)}</div>
      <div class="sub">Company portfolio total</div>
    </div>
  `;

  const approvedProfitPositive=totals.coProfit>=0;

  $('financialSummary').innerHTML=`
    <div class="summary-head">
      <div>
        <span class="eyebrow">COMPANY PORTFOLIO</span>
        <h3>All active projects</h3>
        <p class="muted">
          Combined company totals only. Open a project below to see that job by itself.
        </p>
      </div>
      <span class="pill">${state.projects.length} active project${state.projects.length===1?'':'s'}</span>
    </div>

    <div class="summary-flow">
      <div>
        <span>Combined original profit</span>
        <strong>${money(totals.originalProfit)}</strong>
      </div>

      <div class="summary-op">+</div>

      <div>
        <span>Combined approved CO profit</span>
        <strong class="${approvedProfitPositive?'positive':'negative'}">${money(totals.coProfit)}</strong>
      </div>

      <div class="summary-op">=</div>

      <div class="summary-total">
        <span>Combined projected profit</span>
        <strong>${money(totals.profit)}</strong>
      </div>
    </div>

    <div class="summary-note">
      <strong>${money(totals.potential)} potential change orders</strong>
      across all projects are tracked separately and excluded until approved.
    </div>
  `;

  const riskCount=state.projects.reduce(
    (s,p)=>s+(p.extras||[]).filter(e=>e.status==='potential').length,
    0
  );

  $('radarText').textContent=riskCount
    ?`${riskCount} undocumented extra-work item${riskCount===1?'':'s'} need attention. Capture approval before the work gets forgotten.`
    :'No undocumented extras are waiting for action.';

  const q=($('projectSearch')?.value||'').trim().toLowerCase();

  const filtered=state.projects.filter(p=>
    !q||[p.name,p.customer,p.status||'active',p.scope].join(' ').toLowerCase().includes(q)
  );

  $('projectList').innerHTML=filtered.length
    ?filtered.map(p=>{
      const c=calcProject(p);

      return `<div class="project-row project-workspace-card">
        <div class="project-card-main">
          <div class="project-title">${escapeHtml(p.name)}</div>
          <div class="row-sub">${escapeHtml(p.customer||'No customer')}</div>

          <div class="project-card-financials">
            <span>
              <small>Contract</small>
              <b>${money(p.contractValue)}</b>
            </span>

            <span>
              <small>Project cost</small>
              <b>${money(c.costs)}</b>
            </span>

            <span>
              <small>Projected profit</small>
              <b class="positive">${money(c.profit)}</b>
            </span>
          </div>

          <div class="row-sub">
            ${money(c.potentialChangeOrders)} potential COs ·
            ${money(c.approvedChangeOrders)} approved COs ·
            ${c.margin.toFixed(1)}% margin
          </div>
        </div>

        <button onclick="openProject('${p.id}')">Open project →</button>
      </div>`;
    }).join('')
    :(
      state.projects.length
        ?`<p class="muted">No projects match “${escapeHtml(q)}”.</p>`
        :`<p class="muted">No projects yet. Create your first job to start protecting the margin.</p>`
    );
}

function cleanScopeText(value){
  return String(value||'')
    .replace(/\*{2,}/g,'')
    .replace(/^\s*[-•]\s*/gm,'• ')
    .trim();
}

function renderProject(){
  const p=project();
  if(!p){
    show('dashboard');
    return;
  }

  const c=calcProject(p);

  $('detailName').textContent=p.name;
  $('detailCustomer').textContent=p.customer||'';
  $('detailScope').textContent=cleanScopeText(p.scope)||'No scope entered.';

  $('projectMetrics').innerHTML=`
    <div class="metric">
      <div class="label">Contract</div>
      <div class="value">${money(p.contractValue)}</div>
      <div class="sub">Original contract</div>
    </div>

    <div class="metric light">
      <div class="label">Project cost</div>
      <div class="value">${money(c.costs)}</div>
      <div class="sub">Base cost + approved CO cost</div>
    </div>

    <div class="project-financial-summary">
      <div class="project-profit-pair">
        <div>
          <span>Original contract profit</span>
          <strong>${money(c.originalContractProfit)}</strong>
        </div>

        <div>
          <span>Approved CO profit</span>
          <strong class="positive">${money(c.approvedChangeOrderProfit)}</strong>
        </div>
      </div>

      <div class="project-profit-total">
        <span>Total projected profit</span>
        <strong>${money(c.profit)}</strong>
      </div>

      <div class="project-profit-note">
        <strong>${money(c.potentialChangeOrders)} potential change orders</strong>
        tracked separately · ${c.margin.toFixed(1)}% projected margin
      </div>
    </div>
  `;

  const potential=(p.extras||[]).filter(e=>e.status!=='approved'&&e.status!=='rejected');
  const approved=(p.extras||[]).filter(e=>e.status==='approved');

  $('extraCount').textContent=potential.length;
  $('approvedExtraCount').textContent=approved.length;

  $('extraList').innerHTML=potential.length
    ?potential.map(e=>`
      <div class="extra-row">
        <div>
          <strong>⚠ ${escapeHtml(e.title)}</strong>
          <div class="row-sub">
            ${escapeHtml(e.date)} · ${money(e.estimatedValue)} potential value ·
            ${e.laborHours||0} labor hrs · ${escapeHtml(e.status)}
          </div>
          <div class="row-sub">${escapeHtml(e.reason||'Possible out-of-scope work')}</div>
        </div>
        <div class="row-actions">
  <button onclick="openExtra('${e.id}')">Record ↗</button>
  <button onclick="sendChangeOrder('${e.id}')">Send Change Order</button>
</div>
      </div>
    `).join('')
    :`<p class="muted">No potential change orders.</p>`;

  $('approvedExtraList').innerHTML=approved.length
    ?approved.map(e=>`
      <div class="extra-row">
        <div>
          <strong>✓ ${escapeHtml(e.title)}</strong>
          <div class="row-sub">
            ${escapeHtml(e.date)} · ${money(e.estimatedValue)} approved ·
            ${money(e.estimatedCost)} cost ·
            ${money(Number(e.estimatedValue||0)-Number(e.estimatedCost||0))} CO profit
          </div>
        </div>
        <button onclick="openExtra('${e.id}')">Record →</button>
      </div>
    `).join('')
    :`<p class="muted">No approved change orders yet.</p>`;

  $('logList').innerHTML=(p.logs||[]).length
    ?[...p.logs].reverse().map(l=>`
      <div class="log-row">
        <strong>${escapeHtml(l.date)}</strong>
        <div class="row-sub">
          ${l.crewCount||0} workers × ${l.hoursEach||0} hrs ·
          ${money(l.laborCost)} labor ·
          ${l.photos?.length||0} photos
        </div>
        <div>${escapeHtml(l.note)}</div>
      </div>
    `).join('')
    :`<p class="muted">No field logs yet.</p>`;

  const b=calcBilling(p);

  $('billingSnapshot').innerHTML=`
    <div class="billing-mini">
      <div><span>Invoiced</span><b>${money(b.invoiced)}</b></div>
      <div><span>Paid</span><b class="positive">${money(b.paid)}</b></div>
      <div><span>Remaining to invoice</span><b>${money(b.remaining)}</b></div>
    </div>
    <button class="secondary compact">Open billing →</button>
  `;

  $('billingSnapshot').onclick=()=>show('billing');
}

function calcBilling(p){
  const c=calcProject(p);
  const billable=Number(p.contractValue||0)+c.approvedChangeOrders;
  const invoices=p.invoices||[];

  const invoiced=invoices.reduce(
    (sum,i)=>sum+Number(i.amount||0),
    0
  );

  const paid=invoices.reduce(
    (sum,i)=>sum+(
      i.status==='paid'
        ?Number(i.paidAmount||i.amount||0)
        :Number(i.paidAmount||0)
    ),
    0
  );

  const outstanding=Math.max(0,invoiced-paid);
  const remaining=Math.max(0,billable-invoiced);
  const percent=billable?Math.min(100,(invoiced/billable)*100):0;

  return {
    billable,
    invoiced,
    paid,
    outstanding,
    remaining,
    percent
  };
}

function renderBilling(){
  const p=project();

  if(!p){
    show('dashboard');
    return;
  }

  const b=calcBilling(p);

  $('billingProjectName').textContent=`${p.name} billing`;

  $('billingMetrics').innerHTML=`
    <div class="metric">
      <div class="label">Billable contract</div>
      <div class="value">${money(b.billable)}</div>
      <div class="sub">Contract + approved COs</div>
    </div>

    <div class="metric">
      <div class="label">Invoiced</div>
      <div class="value">${money(b.invoiced)}</div>
      <div class="sub">${b.percent.toFixed(1)}% billed</div>
      <div class="billing-progress"><i style="width:${b.percent}%"></i></div>
    </div>

    <div class="metric">
      <div class="label">Paid</div>
      <div class="value positive">${money(b.paid)}</div>
      <div class="sub">Collected to date</div>
    </div>

    <div class="metric">
      <div class="label">Outstanding</div>
      <div class="value">${money(b.outstanding)}</div>
      <div class="sub">Invoiced, not yet paid</div>
    </div>

    <div class="metric">
      <div class="label">Remaining to invoice</div>
      <div class="value">${money(b.remaining)}</div>
      <div class="sub">Available to bill</div>
    </div>
  `;

  $('invoiceCount').textContent=`${(p.invoices||[]).length}`;

  $('invoiceList').innerHTML=(p.invoices||[]).length
    ?[...p.invoices].reverse().map(i=>`
      <div class="invoice-row">
        <div>
          <strong>${escapeHtml(i.number)}</strong>
          <div class="row-sub">
            ${escapeHtml(i.date)}
            ${i.dueDate?` · due ${escapeHtml(i.dueDate)}`:''}
          </div>
          <div>${escapeHtml(i.description||'Project invoice')}</div>

          ${
            i.sentAt
              ?`<div class="sent-stamp">
                  ✓ Sent ${escapeHtml(new Date(i.sentAt).toLocaleString())}
                  ${i.sentTo?` to ${escapeHtml(i.sentTo)}`:''}
                </div>`
              :''
          }
        </div>

        <div class="amount">
          <strong>${money(i.amount)}</strong><br>

          <span class="invoice-status ${i.status==='paid'?'paid':''}">
            ${escapeHtml(i.status)}
          </span>

          <div class="invoice-row-actions">
            <button class="secondary small" onclick="previewInvoice('${i.id}')">
              Preview invoice
            </button>

            <button class="primary small" onclick="sendInvoice('${i.id}')">
              Send invoice
            </button>

            <button class="ghost small" onclick="printInvoice('${i.id}')">
              Print / PDF
            </button>

            ${
              i.status!=='paid'
                ?`<button class="ghost small" onclick="markInvoicePaid('${i.id}')">
                    Mark paid
                  </button>`
                :''
            }
          </div>
        </div>
      </div>
    `).join('')
    :`<p class="muted">No invoices yet. Create the first invoice for this project.</p>`;
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
    ?i.lineItems
    :[{
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
}

window.markInvoicePaidGlobal=async(projectId,id)=>{
  state.activeProjectId=projectId;
  cache();
  await markInvoicePaid(id);
  renderInvoiceCenter();
  if(activeClientId)renderClientDetail();
};

window.previewInvoiceGlobal=(projectId,id)=>{
  state.activeProjectId=projectId;
  cache();
  previewInvoice(id);
};

window.previewInvoice=(id)=>{
  const p=project();
  const i=(p?.invoices||[]).find(x=>x.id===id);
  if(!p||!i)return;

  activeInvoiceId=id;
  $('invoicePreviewDocument').innerHTML=invoiceHtml(p,i);

  $('invoiceSendStatus').textContent=i.sentAt
    ?`Last sent to ${i.sentTo||i.clientEmail||p.clientEmail||'customer'} on ${new Date(i.sentAt).toLocaleString()}.`
    :'';

  updatePreviewPaidButton(i);
  $('invoicePreviewModal').classList.remove('hidden');
};

function updatePreviewPaidButton(i){
  const b=$('previewMarkPaidBtn');
  if(!b)return;
  b.classList.toggle('hidden',i.status==='paid');
}

window.printInvoice=(id)=>{
  previewInvoice(id);
  setTimeout(()=>window.print(),80);
};

window.sendInvoice=async(id)=>{
  const p=project();
  const i=(p?.invoices||[]).find(x=>x.id===id);
  if(!p||!i)return;

  const to=(i.clientEmail||p.clientEmail||'').trim();

  if(!to)return alert('Add the client billing email first.');
  if(!session?.access_token)return alert('Sign in to ScopeGuard before sending an invoice.');

  const btn=$('previewSendInvoiceBtn');
  if(btn)btn.disabled=true;

  $('invoiceSendStatus').textContent=`Sending ${i.number} to ${to}…`;

  try{
    const r=await fetch('/api/send-invoice',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${session.access_token}`
      },
      body:JSON.stringify({
        to,
        invoice:i,
        project:{
          name:p.name,
          customer:p.customer,
          clientEmail:p.clientEmail
        },
        company:state.company
      })
    });

    const data=await r.json().catch(()=>({}));

    if(!r.ok)throw new Error(data.error||'Invoice could not be sent.');

    i.sentAt=new Date().toISOString();
    i.sentTo=to;
    i.deliveryMessageId=data.messageId||'';

    if(cloudEnabled&&session){
      const {error}=await db
        .from('invoices')
        .update({
          sent_at:i.sentAt,
          sent_to:to,
          delivery_message_id:i.deliveryMessageId||null
        })
        .eq('id',i.id);

      if(error){
        console.warn(
          'Invoice sent, but delivery tracking could not be saved:',
          error.message
        );
      }
    }

    cache();
    $('invoiceSendStatus').textContent=`✓ Invoice sent to ${to}.`;
    renderBilling();

  }catch(e){
    $('invoiceSendStatus').textContent=e.message;
    alert(e.message);
  }finally{
    if(btn)btn.disabled=false;
  }
};

$('closeInvoicePreview').onclick=()=>{
  $('invoicePreviewModal').classList.add('hidden');
  activeInvoiceId=null;
};

$('previewPrintInvoiceBtn').onclick=()=>window.print();
$('previewSendInvoiceBtn').onclick=()=>activeInvoiceId&&sendInvoice(activeInvoiceId);
$('previewMarkPaidBtn').onclick=()=>activeInvoiceId&&markInvoicePaid(activeInvoiceId);

$('invoicePreviewModal').addEventListener('click',e=>{
  if(e.target===$('invoicePreviewModal')){
    $('closeInvoicePreview').click();
  }
});

function openCompanyProfile(){
  const c=state.company||{};

  $('profileCompanyName').value=c.name||'';
  $('profileOwnerName').value=c.owner||'';
  $('profileEmail').value=c.email||'';
  $('profilePhone').value=c.phone||'';
  $('profileAddress').value=c.address||'';
  $('profileWebsite').value=c.website||'';
  $('profileLicense').value=c.licenseNumber||'';

  const img=$('companyLogoPreview');

  if(c.logoData){
    img.src=c.logoData;
    img.classList.remove('hidden');
  }else{
    img.removeAttribute('src');
    img.classList.add('hidden');
  }

  show('companyProfile');
}

$('companyLogoInput')?.addEventListener('change',e=>{
  const f=e.target.files?.[0];
  if(!f)return;

  if(f.size>1500000){
    return alert('Please use a company logo under 1.5 MB.');
  }

  const r=new FileReader();

  r.onload=()=>{
    state.company.logoData=String(r.result);
    $('companyLogoPreview').src=state.company.logoData;
    $('companyLogoPreview').classList.remove('hidden');
  };

  r.readAsDataURL(f);
});

$('saveCompanyProfileBtn').onclick=async()=>{
  const c=state.company;

  c.name=$('profileCompanyName').value.trim()||c.name;
  c.owner=$('profileOwnerName').value.trim();
  c.email=$('profileEmail').value.trim();
  c.phone=$('profilePhone').value.trim();
  c.address=$('profileAddress').value.trim();
  c.website=$('profileWebsite').value.trim();
  c.licenseNumber=$('profileLicense').value.trim();

  if(cloudEnabled&&session){
    const {error}=await db
      .from('companies')
      .update({
        name:c.name,
        owner_name:c.owner||null,
        email:c.email||null,
        phone:c.phone||null,
        address:c.address||null,
        logo_data:c.logoData||null,
        website:c.website||null,
        license_number:c.licenseNumber||null
      })
      .eq('id',c.id);

    if(error)return alert(error.message);
  }

  cache();
  show('dashboard');
};

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
async function routeAfterAuth(){
  updateUserBadge();
  if(!state.company){
    show('onboarding');
    return;
  }

  // Cloud users must have an active entitlement before entering the app.
  // New companies receive a 14-day trial from subscription-status; expired/inactive
  // companies are routed to Plans & Billing.
  if(cloudEnabled && session?.access_token){
    try{
      const r=await fetch(`/api/subscription-status?companyId=${encodeURIComponent(state.company.id)}`,{
        headers:{
          Authorization:`Bearer ${session.access_token}`,
          'x-scopeguard-company-id':state.company.id
        }
      });
      const body=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(body.error||'Unable to verify ScopeGuard access.');

      // subscription-status returns an access snapshot whose canonical
      // access flag is `active`. Paid plans and an unexpired trial should
      // enter ScopeGuard immediately instead of being sent back to Plans.
      if(body.access?.active === true){
        scopeguardAccess = body.access;
        applyScopeguardFeatureVisibility();
        show('home');
        return;
      }

      window.location.href='/plans.html?access=required';
      return;
    }catch(error){
      console.error('Subscription access check failed:',error);
      window.location.href='/plans.html?access=required';
      return;
    }
  }

  show('home');
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
    state.company={id,name,owner:session.user.email};state.projects=[];cache();await loadCloudState();
    // New cloud companies must see plan/trial selection before entering the app.
    window.location.href='/plans.html?onboarding=1';
    return;
  }
  state.company={id:uid(),name,owner:$('ownerName').value.trim(),createdAt:new Date().toISOString()};cache();show('home');};

  // STEP 1.A — MOBILE QUICK ACTIONS

$('quickInvoiceBtn')?.addEventListener('click', () => {
  show('invoiceCenter');
});

$('quickAiInvoiceBtn')?.addEventListener('click', () => {
  if(!scopeguardFeatureAllowed('ai')) return alert('AI tools require the Business plan.');
  alert('AI-assisted invoice creation is being added in Step 1.A.');
});

$('quickClientsBtn')?.addEventListener('click', () => {
  show('clients');
});

$('quickChangeOrderBtn')?.addEventListener('click', () => {
  if(!scopeguardFeatureAllowed('changeOrders')) return alert('Change orders require the Business plan.');
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

window.openProjectPhotoFolder = async function(projectId) {
  state.activeProjectId = projectId;

  const p = state.projects.find(project => project.id === projectId);
  if (!p) return;

  $('photoFolderProjectName').textContent = p.name || 'Project';
  $('photoFolderCount').textContent = 'Loading photos...';

  show('projectPhotoFolder');

  await renderProjectPhotoGallery();
};

// PROJECT PHOTO UPLOAD
$('uploadProjectPhotosBtn')?.addEventListener('click', () => {
  const input = $('projectPhotoUpload');
  if (!input) return;

  input.value = '';
  input.click();
});

$('projectPhotoUpload')?.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || []);

  if (!files.length) return;

  const p = project();

  if (!p) {
    alert('Project not found.');
    return;
  }

  if (!cloudEnabled || !session || !db) {
    alert('Cloud connection is required to upload project photos.');
    return;
  }

  const button = $('uploadProjectPhotosBtn');
  const originalText = button?.textContent || '+ Upload Photos';

  if (button) {
    button.disabled = true;
    button.textContent = `Uploading ${files.length} photo${files.length === 1 ? '' : 's'}…`;
  }

  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      if (file.size > 12_000_000) {
        alert(`${file.name} is larger than 12 MB and was skipped.`);
        continue;
      }

      const photoId = uid();

      const photoDate = file.lastModified
        ? new Date(file.lastModified)
        : new Date();

      const dateKey = photoDate.toISOString().slice(0, 10);

      const path =
        `${session.user.id}/${state.company.id}/${p.id}/project-photos/${dateKey}/${photoId}-${safeName(file.name)}`;

      const { error: uploadError } = await db.storage
        .from('scopeguard-evidence')
        .upload(path, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: evidenceRow, error: evidenceError } = await db
        .from('evidence')
        .insert({
          company_id: state.company.id,
          project_id: p.id,
          storage_path: path,
          mime_type: file.type || 'image/jpeg',
          created_by: session.user.id
        })
        .select()
        .single();

      if (evidenceError) {
        await db.storage
          .from('scopeguard-evidence')
          .remove([path]);

        throw evidenceError;
      }
    }

    alert(
      `${files.length} photo${files.length === 1 ? '' : 's'} uploaded successfully.`
    );

    await renderProjectPhotoGallery();

  } catch (error) {
    console.error('Project photo upload failed:', error);
    alert(`Photo upload failed: ${error.message || 'Unknown error'}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }

    event.target.value = '';
  }
});

let projectPhotoSelectMode = false;
const selectedProjectPhotoIds = new Set();
let currentProjectPhotoRows = [];
let currentProjectPhotoUrls = new Map();

function selectedProjectPhotos() {
  return currentProjectPhotoRows.filter(photo =>
    selectedProjectPhotoIds.has(String(photo.id))
  );
}

function updateProjectPhotoSelectionUI() {
  const bar = $('projectPhotoSelectionBar');
  const count = $('projectPhotoSelectedCount');
  const selectBtn = $('selectProjectPhotosBtn');

  bar?.classList.toggle('hidden', !projectPhotoSelectMode);

  if (count) {
    count.textContent = `${selectedProjectPhotoIds.size} selected`;
  }

  if (selectBtn) {
    selectBtn.textContent = projectPhotoSelectMode ? 'Selecting…' : 'Select';
  }
}

function exitProjectPhotoSelection() {
  projectPhotoSelectMode = false;
  selectedProjectPhotoIds.clear();
  updateProjectPhotoSelectionUI();
  renderProjectPhotoGallery();
}

window.toggleProjectPhotoSelection = function(photoId) {
  if (!projectPhotoSelectMode) return;

  const key = String(photoId);

  if (selectedProjectPhotoIds.has(key)) {
    selectedProjectPhotoIds.delete(key);
  } else {
    selectedProjectPhotoIds.add(key);
  }

  updateProjectPhotoSelectionUI();
  renderProjectPhotoGallery();
};

$('selectProjectPhotosBtn')?.addEventListener('click', () => {
  projectPhotoSelectMode = true;
  selectedProjectPhotoIds.clear();
  updateProjectPhotoSelectionUI();
  renderProjectPhotoGallery();
});

$('cancelProjectPhotoSelectionBtn')?.addEventListener(
  'click',
  exitProjectPhotoSelection
);

$('selectAllProjectPhotosBtn')?.addEventListener('click', () => {
  if (!projectPhotoSelectMode) return;

  const allSelected =
    currentProjectPhotoRows.length > 0 &&
    currentProjectPhotoRows.every(photo =>
      selectedProjectPhotoIds.has(String(photo.id))
    );

  selectedProjectPhotoIds.clear();

  if (!allSelected) {
    currentProjectPhotoRows.forEach(photo =>
      selectedProjectPhotoIds.add(String(photo.id))
    );
  }

  updateProjectPhotoSelectionUI();
  renderProjectPhotoGallery();
});

$('deleteSelectedProjectPhotosBtn')?.addEventListener('click', async () => {
  const selected = selectedProjectPhotos();

  if (!selected.length) {
    alert('Select at least one photo first.');
    return;
  }

  const confirmed = window.confirm(
    `Delete ${selected.length} selected photo${selected.length === 1 ? '' : 's'} permanently? This cannot be undone.`
  );

  if (!confirmed) return;

  try {
    if (!cloudEnabled || !session || !db) {
      throw new Error(
        'Cloud connection is required to delete project photos.'
      );
    }

    const paths = selected
      .map(photo => photo.storage_path)
      .filter(Boolean);

    if (paths.length) {
      const { error: storageError } = await db.storage
        .from('scopeguard-evidence')
        .remove(paths);

      if (storageError) throw storageError;
    }

    const ids = selected
      .map(photo => photo.id)
      .filter(Boolean);

    if (ids.length) {
      const { error: databaseError } = await db
        .from('evidence')
        .delete()
        .eq('company_id', state.company.id)
        .eq('project_id', state.activeProjectId)
        .in('id', ids);

      if (databaseError) throw databaseError;
    }

    projectPhotoSelectMode = false;
    selectedProjectPhotoIds.clear();
    updateProjectPhotoSelectionUI();
    await renderProjectPhotoGallery();

  } catch (error) {
    console.error('Selected project photo delete failed:', error);
    alert(
      `Photo delete failed: ${error.message || 'Unknown error'}`
    );
  }
});

$('copySelectedProjectPhotosBtn')?.addEventListener('click', async () => {
  const selected = selectedProjectPhotos();

  if (!selected.length) {
    alert('Select at least one photo first.');
    return;
  }

  const urls = selected
    .map(photo => currentProjectPhotoUrls.get(String(photo.id)))
    .filter(Boolean);

  if (!urls.length) {
    alert('The selected photo links are not available yet.');
    return;
  }

  try {
    await navigator.clipboard.writeText(urls.join('\n'));

    alert(
      `${urls.length} photo link${urls.length === 1 ? '' : 's'} copied.`
    );

  } catch (error) {
    console.error('Copy selected photos failed:', error);
    alert(
      'Copy is not available in this browser. Try Share instead.'
    );
  }
});

$('shareSelectedProjectPhotosBtn')?.addEventListener('click', async () => {
  const selected = selectedProjectPhotos();

  if (!selected.length) {
    alert('Select at least one photo first.');
    return;
  }

  const urls = selected
    .map(photo => currentProjectPhotoUrls.get(String(photo.id)))
    .filter(Boolean);

  if (!urls.length) {
    alert('The selected photos are not available yet.');
    return;
  }

  try {
    const files = [];

    for (let index = 0; index < urls.length; index += 1) {
      const response = await fetch(urls[index]);

      if (!response.ok) {
        throw new Error('Could not prepare a selected photo.');
      }

      const blob = await response.blob();

      const extension =
        blob.type === 'image/png' ? 'png' :
        blob.type === 'image/webp' ? 'webp' :
        'jpg';

      files.push(
        new File(
          [blob],
          `scopeguard-photo-${index + 1}.${extension}`,
          { type: blob.type || 'image/jpeg' }
        )
      );
    }

    if (
      navigator.share &&
      (!navigator.canShare || navigator.canShare({ files }))
    ) {
      await navigator.share({
        title: 'ScopeGuard Project Photos',
        text: `${files.length} project photo${files.length === 1 ? '' : 's'} from ScopeGuard`,
        files
      });

      return;
    }

    if (navigator.share) {
      await navigator.share({
        title: 'ScopeGuard Project Photos',
        text: urls.join('\n')
      });

      return;
    }

    await navigator.clipboard.writeText(urls.join('\n'));

    alert(
      'Sharing is not available here, so the selected photo links were copied instead.'
    );

  } catch (error) {
    if (error?.name === 'AbortError') return;

    console.error('Share selected photos failed:', error);

    try {
      await navigator.clipboard.writeText(urls.join('\n'));

      alert(
        'Could not open the share sheet, so the selected photo links were copied instead.'
      );

    } catch {
      alert(`Share failed: ${error.message || 'Unknown error'}`);
    }
  }
});

async function renderProjectPhotoGallery() {
  const projectId = state.activeProjectId;

  if (!projectId) return;

  const p = state.projects.find(
    project => project.id === projectId
  );

  if (!p) return;

  const gallery = $('projectPhotoGallery');

  if (!gallery) return;

  gallery.innerHTML = `
    <div class="card">
      <p class="muted">Loading project photos...</p>
    </div>
  `;

  try {
    if (!cloudEnabled || !session || !db) {
      gallery.innerHTML = `
        <div class="card">
          <p class="muted">
            Cloud connection is required to view project photos.
          </p>
        </div>
      `;

      return;
    }

    const { data: photos, error } = await db
      .from('evidence')
      .select('*')
      .eq('company_id', state.company.id)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = photos || [];

    currentProjectPhotoRows = rows;
    currentProjectPhotoUrls = new Map();

    for (
      const selectedId of Array.from(selectedProjectPhotoIds)
    ) {
      if (
        !rows.some(
          photo => String(photo.id) === selectedId
        )
      ) {
        selectedProjectPhotoIds.delete(selectedId);
      }
    }

    const count = $('photoFolderCount');

    if (count) {
      count.textContent =
        `${rows.length} photo${rows.length === 1 ? '' : 's'}`;
    }
        updateProjectPhotoSelectionUI();

    if (!rows.length) {
      gallery.innerHTML = `
        <div class="card">
          <strong>No photos yet</strong>
          <p class="muted">Upload photos and they will appear here organized by date.</p>
        </div>
      `;
      return;
    }

    const grouped = {};

    rows.forEach(photo => {
      const date = new Date(photo.created_at || Date.now());
      const key = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(photo);
    });

    let html = '';

    for (const [date, items] of Object.entries(grouped)) {
      html += `
        <section class="photo-date-group">
          <div class="invoice-group-head">
            <h3>${date}</h3>
            <span class="count">
              ${items.length} photo${items.length === 1 ? '' : 's'}
            </span>
          </div>

          <div class="photo-grid">
      `;

      for (const photo of items) {
        const { data: signedData, error: signedError } = await db.storage
          .from('scopeguard-evidence')
          .createSignedUrl(photo.storage_path, 3600);

        if (signedError) {
          console.error('Could not load project photo:', signedError);
        }

        const imageUrl = signedData?.signedUrl || '';
        const photoId = String(photo.id);
        const isSelected = selectedProjectPhotoIds.has(photoId);

        if (imageUrl) {
          currentProjectPhotoUrls.set(photoId, imageUrl);
        }

        html += `
          <div
            class="card photo-card"
            ${projectPhotoSelectMode
              ? `onclick="toggleProjectPhotoSelection('${photoId}')"`
              : ''}
            style="${projectPhotoSelectMode
              ? `position:relative;cursor:pointer;outline:${isSelected ? '3px solid currentColor' : '2px solid transparent'};`
              : ''}"
          >
            ${
              imageUrl
                ? `<img
                    src="${imageUrl}"
                    alt="Project photo"
                    ${projectPhotoSelectMode
                      ? ''
                      : `onclick="window.open('${imageUrl}', '_blank')"`}
                    style="width:100%;height:220px;object-fit:cover;border-radius:12px;cursor:pointer;${isSelected ? 'opacity:.78;' : ''}"
                    title="${projectPhotoSelectMode ? 'Select photo' : 'Click to view full size'}"
                  >`
                : `<p class="muted">Photo unavailable</p>`
            }

            ${
              projectPhotoSelectMode
                ? `<span
                    aria-hidden="true"
                    style="
                      position:absolute;
                      top:12px;
                      right:12px;
                      width:30px;
                      height:30px;
                      border-radius:50%;
                      display:grid;
                      place-items:center;
                      border:2px solid currentColor;
                      background:${isSelected ? 'currentColor' : 'rgba(255,255,255,.88)'};
                      box-shadow:0 2px 8px rgba(0,0,0,.18);
                      font-weight:900;
                    "
                  ><span style="color:${isSelected ? 'white' : 'transparent'}">✓</span></span>`
                : ''
            }
          </div>
        `;
      }

      html += `
          </div>
        </section>
      `;
    }

    gallery.innerHTML = html;

  } catch (error) {
    console.error('Project photo gallery failed:', error);

    gallery.innerHTML = `
      <div class="card">
        <strong>Unable to load photos</strong>
        <p class="muted">${error.message || 'Unknown error'}</p>
      </div>
    `;
  }
}

$('quickNewInvoiceBtn')?.addEventListener('click', () => {
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

$('saveInvoiceBtn').onclick=async()=>{
  const p=project();if(!p)return;
  const number=$('invoiceNumber').value.trim();const date=$('invoiceDate').value||isoDate();const dueDate=$('invoiceDueDate').value||null;const amount=Number($('invoiceAmount').value||0);const retainage=Number($('invoiceRetainage').value||0);const status=$('invoiceStatus').value;const clientEmail=$('invoiceClientEmail').value.trim();
  const lineItems=Array.from(document.querySelectorAll('.invoice-line-item')).map(row=>({type:row.querySelector('.invoice-line-type')?.value||'general',description:row.querySelector('.invoice-line-description')?.value.trim()||'',amount:Number(row.querySelector('.invoice-line-amount')?.value||0)})).filter(item=>item.description||item.amount);
  const description=lineItems.map(item=>item.description).filter(Boolean).join(' | ')||$('invoiceDescription').value.trim()||'Project progress billing';
  if(!number)return alert('Enter an invoice number.');
  if(amount<=0)return alert('Add at least one invoice line item amount.');
  const id=uid();
  if(cloudEnabled&&session){const {error}=await db.from('invoices').insert({id,company_id:state.company.id,project_id:p.id,created_by:session.user.id,invoice_number:number,invoice_date:date,due_date:dueDate,description,line_items:lineItems,amount,retainage,status,paid_amount:status==='paid'?amount:0,client_email:clientEmail||null});if(error)return alert(error.message);}
  p.invoices=p.invoices||[];p.invoices.push({id,number,date,dueDate:dueDate||'',description,lineItems,amount,retainage,status,paidAmount:status==='paid'?amount:0,clientEmail});if(clientEmail)p.clientEmail=clientEmail;cache();$('invoiceForm').classList.add('hidden');renderBilling();renderProject();
};

$('saveProjectBtn').onclick=async()=>{
  const name=$('pName').value.trim();if(!name)return alert('Enter a project name.');
  const customer=$('pCustomer').value.trim();
  const clientEmail=$('pClientEmail').value.trim();
  let clientId='';
  if(customer){let c=(state.clients||[]).find(x=>String(x.name||'').trim().toLowerCase()===customer.toLowerCase());if(!c){if(cloudEnabled&&session){const {data,error}=await db.from('clients').insert({company_id:state.company.id,name:customer,email:clientEmail||null}).select().single();if(error)return alert(error.message);c={id:data.id,name:data.name,contactName:'',email:data.email||'',phone:'',address:'',notes:''};}else c={id:uid(),name:customer,contactName:'',email:clientEmail,phone:'',address:'',notes:''};state.clients=state.clients||[];state.clients.push(c);}else if(clientEmail&&!c.email)c.email=clientEmail;clientId=c.id;}
  const p={id:uid(),name,customer,clientId,clientEmail,contractValue:Number($('pContract').value||0),scope:$('pScope').value.trim(),laborBudget:Number($('pLaborBudget').value||0),materialBudget:Number($('pMaterialBudget').value||0),markup:Number($('pMarkup').value||20),defaultLaborRate:Number($('pLaborRate').value||42),logs:[],extras:[],invoices:[],billed:0,collected:0,createdAt:new Date().toISOString()};
  if(cloudEnabled&&session){
    const {error}=await db.from('projects').insert({id:p.id,company_id:state.company.id,name:p.name,customer:p.customer,client_id:p.clientId||null,client_email:p.clientEmail||null,contract_value:p.contractValue,original_scope:p.scope,labor_budget:p.laborBudget,material_budget:p.materialBudget,extra_markup:p.markup,default_labor_rate:p.defaultLaborRate});
    if(error)return alert(error.message);
  }
  state.projects.push(p);state.activeProjectId=p.id;cache();show('projectDetail');
};

$('newLogBtn').onclick=()=>{pendingPhotos=[];$('photoPreview').innerHTML='';$('crewCount').value='';$('hoursEach').value='';$('workPerformed').value='';$('directedBy').value='';$('logNote').value='';$('laborRate').value=project()?.defaultLaborRate||42;$('directCost').value=0;$('productionQty').value='';$('productionUnit').value='';updateLaborQuickSummary();show('fieldLog');};
$('quickLogNav').onclick=()=>{if(!state.activeProjectId){if(!state.projects.length)return alert('Create a project first.');state.activeProjectId=state.projects[0].id;}$('newLogBtn').click();};
$('backToProject').onclick=()=>show('projectDetail');
document.querySelectorAll('.back').forEach(b=>b.onclick=()=>show('dashboard'));
document.querySelectorAll('[data-requester]').forEach(b=>b.addEventListener('click',()=>{$('directedBy').value=b.dataset.requester;document.querySelectorAll('[data-requester]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');}));
function updateLaborQuickSummary(){const crew=Number($('crewCount')?.value||0),hours=Number($('hoursEach')?.value||0),total=crew*hours;if($('laborQuickSummary'))$('laborQuickSummary').textContent=total?`${crew} workers × ${hours} hrs = ${total} labor hours`:'Enter workers + hours to see labor total.';if($('saveLogHours'))$('saveLogHours').textContent=`${total} labor hrs`;}
$('crewCount')?.addEventListener('input',updateLaborQuickSummary);$('hoursEach')?.addEventListener('input',updateLaborQuickSummary);

$('photoInput').addEventListener('change',async(e)=>{
  for(const file of [...e.target.files]){
    if(file.size>8000000){alert(`${file.name} is too large. Use a photo under 8 MB.`);continue;}
    const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});
    pendingPhotos.push({name:file.name,data,file});
  }
  $('photoPreview').innerHTML=pendingPhotos.map(p=>`<img src="${p.data}" alt="jobsite evidence">`).join('');
  $('saveLogPhotos').textContent=`${pendingPhotos.length} photo${pendingPhotos.length===1?'':'s'}`;
  e.target.value='';
});

function analyzeLog(note,scope,directedBy){
  const text=(note||'').toLowerCase();const scopeText=(scope||'').toLowerCase();
  const signals=['extra','additional','changed','change','rework','redo','move','relocate','delay','wait','different','added','outside','not on plan','not in scope','rfi','revision','directed','requested','remove and replace'];
  const hits=signals.filter(k=>text.includes(k));
  let score=hits.length*0.13;
  if(directedBy&&directedBy.toLowerCase()!=='no direction / normal scope')score+=0.24;
  const words=[...new Set(text.split(/\W+/).filter(w=>w.length>5))];
  const overlap=words.filter(w=>scopeText.includes(w)).length;
  if(words.length&&overlap/words.length<0.2)score+=0.14;
  score=Math.min(.96,score);
  return {score,isPotential:score>=.28,reason:hits.length?`Signals found: ${hits.join(', ')}`:'Work description differs from the original scope or was specifically directed.',hits};
}

$('analyzeBtn').onclick=async()=>{
  const p=project();if(!p)return;
  const crew=Number($('crewCount').value||0),hoursEach=Number($('hoursEach').value||0),laborRate=Number($('laborRate').value||0),directCost=Number($('directCost').value||0),productionQty=Number($('productionQty').value||0);
  const laborHours=crew*hoursEach,laborCost=laborHours*laborRate;
  const work=$('workPerformed').value.trim(),directed=$('directedBy').value.trim(),details=$('logNote').value.trim();
  const note=[work,directed?`Directed/requested by: ${directed}`:'',details].filter(Boolean).join(' | ');
  if(!note)return alert('Describe the work performed first.');
  const analysis=analyzeLog(note,p.scope,directed);const logId=uid();
  const log={id:logId,date:nowDate(),note,workPerformed:work,directedBy:directed,crewCount:crew,hoursEach,laborRate,directCost,laborHours,laborCost,productionQty,productionUnit:$('productionUnit').value.trim(),photos:pendingPhotos.map(x=>({name:x.name,data:x.data})),analysis};
  let extra=null;
  if(analysis.isPotential){const estCost=laborCost+directCost,estValue=estCost*(1+Number(p.markup||20)/100);extra={id:uid(),sourceLogId:logId,date:nowDate(),title:work.slice(0,500)||'Potential extra work',reason:analysis.reason,status:'potential',laborHours,estimatedCost:estCost,estimatedValue:estValue,requestedBy:directed,note,confidence:analysis.score,photos:log.photos,photoCount:log.photos.length};}
  try{
    if(cloudEnabled&&session){
      const {error:lErr}=await db.from('field_logs').insert({id:logId,company_id:state.company.id,project_id:p.id,created_by:session.user.id,work_date:isoDate(),notes:note,crew_count:crew,workers:crew,hours_each:hoursEach,labor_rate:laborRate,direct_cost:directCost,production_qty:productionQty,production_unit:log.productionUnit,analysis});if(lErr)throw lErr;
      if(extra){const {error:eErr}=await db.from('extra_work').insert({id:extra.id,company_id:state.company.id,project_id:p.id,created_by:session.user.id,source_log_id:logId,title:extra.title,description:work,reason:extra.reason,status:extra.status,labor_hours:laborHours,estimated_cost:extra.estimatedCost,estimated_value:extra.estimatedValue,proposed_value:extra.estimatedValue,requested_by:directed,note,confidence:analysis.score});if(eErr)throw eErr;}
      for(const photo of pendingPhotos){const path=`${session.user.id}/${state.company.id}/${p.id}/${logId}/${uid()}-${safeName(photo.name)}`;const {error:uErr}=await db.storage.from('scopeguard-evidence').upload(path,photo.file,{contentType:photo.file.type,upsert:false});if(uErr)throw uErr;const {error:vErr}=await db.from('evidence').insert({company_id:state.company.id,project_id:p.id,field_log_id:logId,extra_work_id:extra?.id||null,storage_path:path,mime_type:photo.file.type,created_by:session.user.id});if(vErr)throw vErr;}
    }
    p.logs.push(log);if(extra)p.extras.push(extra);cache();
    $('analysisResult').classList.remove('hidden');$('analysisResult').innerHTML=analysis.isPotential?`<div class="risk-banner"><strong>⚠ Potential extra work detected</strong><p>${escapeHtml(analysis.reason)} Preserve the photos and get written approval before this disappears into the job.</p><b>Estimated value: ${money(extra.estimatedValue)}</b></div>`:`<div class="ok-banner"><strong>✓ Logged and protected</strong><p>No strong extra-work signal was detected, but the labor, production and evidence are saved.</p></div>`;
    setSync(cloudEnabled?'Cloud synced':'Saved locally',cloudEnabled?'cloud':'offline');setTimeout(()=>show('projectDetail'),900);
  }catch(e){setSync('Sync error','offline');alert(`Could not save field log: ${e.message||e}`);}
};

window.openExtra=(id)=>{
  const p=project();const e=(p?.extras||[]).find(x=>x.id===id);if(!e)return;activeExtraId=id;
  const statusOptions=['potential','approved','rejected'].map(s=>`<option value="${s}" ${e.status===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('');
  $('extraDocument').innerHTML=`<div class="extra-doc"><div class="doc-header"><div><span class="eyebrow">EXTRA WORK RECORD</span><h2>${escapeHtml(e.title)}</h2></div><span class="status-chip">${escapeHtml(e.status)}</span></div><div class="doc-grid"><div><b>Project</b><span>${escapeHtml(p.name)}</span></div><div><b>Customer / GC</b><span>${escapeHtml(p.customer||'')}</span></div><div><b>Date</b><span>${escapeHtml(e.date)}</span></div><div><b>Requested by</b><span>${escapeHtml(e.requestedBy||'Not recorded')}</span></div><div><b>Labor hours</b><span>${e.laborHours||0}</span></div><div><b>Estimated cost</b><span>${money(e.estimatedCost)}</span></div><div><b>Proposed value</b><span>${money(e.estimatedValue)}</span></div><div><b>Photos</b><span>${e.photoCount||e.photos?.length||0}</span></div></div><div class="doc-section"><b>Why ScopeGuard flagged it</b><p>${escapeHtml(e.reason)}</p></div><div class="doc-section"><b>Field record</b><p>${escapeHtml(e.note)}</p></div><div class="approval-panel"><label>Status<select id="extraStatusEdit">${statusOptions}</select></label><label>Change order value ($)<input id="extraValueEdit" type="number" min="0" step="0.01" value="${Number(e.estimatedValue||0)}"></label></div><div class="modal-actions"><button class="secondary" onclick="correctExtraLaborHours()">Correct Labor Hours</button><button class="secondary" onclick="saveExtraChanges()">Save Changes</button>${e.status!=='approved'?`<button class="primary" onclick="approveChangeOrder()">Move to Approved Change Orders</button>`:''}</div></div>`;
  $('extraModal').classList.remove('hidden');
};

window.correctExtraLaborHours=async()=>{
  const p=project();const e=(p?.extras||[]).find(x=>x.id===activeExtraId);if(!e)return;
  const sourceLog=(p.logs||[]).find(l=>l.id===e.sourceLogId);
  const raw=prompt('Enter the correct total labor hours for this change order:',String(e.laborHours||sourceLog?.laborHours||0));
  if(raw===null)return;
  const newHours=Number(raw);
  if(!Number.isFinite(newHours)||newHours<0)return alert('Enter a valid labor-hour total.');
  const rate=Number(sourceLog?.laborRate||p.defaultLaborRate||42);
  const direct=Number(sourceLog?.directCost||0);
  const inferred={crew:Number(sourceLog?.crewCount||0)};
  const newCost=newHours*rate+direct;
  const newValue=newCost*(1+Number(p.markup||20)/100);
  try{
    if(cloudEnabled&&session){
      const updates=[db.from('extra_work').update({labor_hours:newHours,estimated_cost:newCost,estimated_value:newValue,proposed_value:newValue}).eq('id',e.id)];
      if(sourceLog?.id&&inferred.crew>0)updates.push(db.from('field_logs').update({crew_count:inferred.crew,workers:inferred.crew,hours_each:newHours/inferred.crew}).eq('id',sourceLog.id));
      const results=await Promise.all(updates);
      const err=results.find(r=>r.error)?.error;
      if(err)throw err;
    }
    e.laborHours=newHours;
    e.estimatedCost=newCost;
    e.estimatedValue=newValue;
    if(sourceLog){
      sourceLog.crewCount=inferred.crew;
      sourceLog.hoursEach=newHours/inferred.crew;
      sourceLog.laborHours=newHours;
      sourceLog.laborCost=newHours*rate;
    }
    cache();
    renderProject();
    renderDashboard();
    openExtra(e.id);
  }catch(err){
    alert(`Could not correct labor hours: ${err.message||err}`);
  }
};

window.approveChangeOrder=async()=>{
  const p=project();const e=(p?.extras||[]).find(x=>x.id===activeExtraId);if(!e)return;
  const value=Number($('extraValueEdit')?.value||e.estimatedValue||0);
  try{
    if(cloudEnabled){
      const {error}=await db.from('extra_work').update({status:'approved',estimated_value:value,proposed_value:value}).eq('id',e.id);
      if(error)throw error;
    }
    e.status='approved';
    e.estimatedValue=value;
    cache();
    renderProject();
    renderDashboard();
    openExtra(e.id);
  }catch(err){
    alert(`Could not approve change order: ${err.message||err}`);
  }
};

window.saveExtraChanges=async()=>{
  const p=project();const e=(p?.extras||[]).find(x=>x.id===activeExtraId);if(!e)return;
  const status=$('extraStatusEdit').value;
  const value=Number($('extraValueEdit').value||0);
  try{
    if(cloudEnabled){
      const {error}=await db.from('extra_work').update({status,estimated_value:value,proposed_value:value}).eq('id',e.id);
      if(error)throw error;
    }
    e.status=status;
    e.estimatedValue=value;
    cache();
    renderProject();
    renderDashboard();
    openExtra(e.id);
  }catch(err){
    alert(`Could not update extra work: ${err.message||err}`);
  }
};

$('closeModal').onclick=()=>$('extraModal').classList.add('hidden');
$('printExtraBtn').onclick=()=>window.print();
$('extraModal').onclick=(e)=>{if(e.target===$('extraModal'))$('extraModal').classList.add('hidden');};

let recognition;
$('voiceBtn').onclick=()=>{
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition)return alert('Voice dictation is not supported in this browser. Use your phone keyboard microphone or type the note.');
  if(!recognition){
    recognition=new SpeechRecognition();
    recognition.lang='en-US';
    recognition.continuous=false;
    recognition.interimResults=false;
    recognition.onresult=e=>{
      $('logNote').value=($('logNote').value+' '+e.results[0][0].transcript).trim();
    };
    recognition.onend=()=>{
      $('voiceBtn').textContent='🎙 Dictate';
    };
  }
  $('voiceBtn').textContent='Listening…';
  recognition.start();
};

$('resetBtn').onclick=async()=>{
  if(session&&cloudEnabled){
    await db.auth.signOut();
    session=null;
    state={company:null,projects:[],activeProjectId:null};
    cache();
    updateUserBadge();
    setSync('Cloud ready','cloud');
    show('auth');
    return;
  }
  if(confirm('Reset all ScopeGuard demo data on this device?')){
    localStorage.removeItem(storeKey);
    location.reload();
  }
};

$('homeInvoicesBtn')?.addEventListener('click',()=>show('invoiceCenter'));
$('homeProjectsBtn')?.addEventListener('click',()=>show('projectCenter'));
$('backFromInvoiceCenter')?.addEventListener('click',()=>show('home'));
$('backFromProjectCenter')?.addEventListener('click',()=>show('home'));
$('projectCenterNewBtn')?.addEventListener('click',()=>show('projectForm'));
$('activeProjectsBtn')?.addEventListener('click',()=>{projectCenterMode='active';renderProjectCenter();});
$('finishedProjectsBtn')?.addEventListener('click',()=>{projectCenterMode='finished';renderProjectCenter();});
$('centerProjectSearch')?.addEventListener('input',renderProjectCenter);
$('bottomNav')?.querySelector('[data-nav="dashboard"]')?.addEventListener('click',()=>show('home'));

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}

initCloud();

document.querySelector('[data-project-tab="overview"]')?.addEventListener('click',()=>{
  document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-project-tab="overview"]').classList.add('active');
  document.getElementById('projectMetrics')?.scrollIntoView({behavior:'smooth',block:'start'});
});

document.querySelector('[data-project-tab="logs"]')?.addEventListener('click',()=>{
  document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-project-tab="logs"]').classList.add('active');
  document.getElementById('projectLogsSection')?.scrollIntoView({behavior:'smooth',block:'start'});
});

document.querySelector('[data-project-tab="changes"]')?.addEventListener('click',()=>{
  document.querySelectorAll('[data-project-tab]').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-project-tab="changes"]').classList.add('active');
  document.getElementById('projectChangesSection')?.scrollIntoView({behavior:'smooth',block:'start'});
});

// Menu + client directory
function closeMenu(){
  $('menuDrawer')?.classList.add('hidden');
}

$('menuBtn')?.addEventListener('click',()=> $('menuDrawer').classList.remove('hidden'));
$('closeMenuBtn')?.addEventListener('click',closeMenu);
$('menuBackdrop')?.addEventListener('click',closeMenu);

[
  ['menuHomeBtn','home'],
  ['menuClientsBtn','clients'],
  ['menuEmailBtn','emailSettings'],
  ['menuInvoicesBtn','invoiceCenter'],
  ['menuProjectsBtn','projectCenter']
].forEach(([b,v])=>$(b)?.addEventListener('click',()=>{
  closeMenu();
  show(v);
}));

$('menuCompanyBtn')?.addEventListener('click',()=>{
  closeMenu();
  openCompanyProfile();
});

$('menuPlansBtn')?.addEventListener('click',()=>{
  closeMenu();
  if(!cloudEnabled || !session?.access_token){
    return alert('Sign in to your ScopeGuard cloud account to view plans and billing.');
  }
  window.location.href='/plans.html';
});

$('backFromClients')?.addEventListener('click',()=>show('home'));
$('backToClients')?.addEventListener('click',()=>show('clients'));
$('backFromClientForm')?.addEventListener('click',()=>show('clients'));
$('clientSearch')?.addEventListener('input',renderClients);

$('newClientBtn')?.addEventListener('click',()=>{
  editingClientId=null;
  $('clientFormTitle').textContent='Add client';
  ['clientName','clientContactName','clientEmail','clientPhone','clientAddress','clientNotes'].forEach(id=>$(id).value='');
  show('clientForm');
});

$('saveClientBtn')?.addEventListener('click',async()=>{
  const name=$('clientName').value.trim();
  if(!name)return alert('Enter the client name.');

  let c=editingClientId
    ?(state.clients||[]).find(x=>x.id===editingClientId)
    :null;

  const vals={
    name,
    contactName:$('clientContactName').value.trim(),
    email:$('clientEmail').value.trim(),
    phone:$('clientPhone').value.trim(),
    address:$('clientAddress').value.trim(),
    notes:$('clientNotes').value.trim()
  };

  if(cloudEnabled&&session){
    const row={
      company_id:state.company.id,
      name:vals.name,
      contact_name:vals.contactName||null,
      email:vals.email||null,
      phone:vals.phone||null,
      billing_address:vals.address||null,
      notes:vals.notes||null
    };

    if(c){
      const {error}=await db.from('clients').update(row).eq('id',c.id);
      if(error)return alert(error.message);
    }else{
      const {data,error}=await db.from('clients').insert(row).select().single();
      if(error)return alert(error.message);
      c={
        id:data.id,
        ...vals
      };
    }
  }

  if(c)Object.assign(c,vals);
  else c={id:uid(),...vals};

  state.clients=state.clients||[];

  if(!state.clients.some(x=>x.id===c.id)){
    state.clients.push(c);
  }

  for(const p of state.projects){
    if(
      !p.clientId &&
      String(p.customer||'').trim().toLowerCase()===name.toLowerCase()
    ){
      p.clientId=c.id;
      p.clientEmail=p.clientEmail||c.email;

      if(cloudEnabled&&session){
        await db.from('projects')
          .update({
            client_id:c.id,
            client_email:p.clientEmail||null
          })
          .eq('id',p.id);
      }
    }
  }

  cache();
  editingClientId=null;
  activeClientId=c.id;
  show('clientDetail');
});

async function refreshEmailConnection(){
  const text=$('emailConnectionText');
  const badge=$('emailConnectionBadge');
  const connect=$('connectGmailBtn');
  const disconnect=$('disconnectGmailBtn');

  if(!text||!session?.access_token)return;

  text.textContent='Checking connection…';

  try{
    const r=await fetch('/api/email-status',{
      headers:{
        Authorization:`Bearer ${session.access_token}`
      }
    });

    const d=await r.json();

    if(!r.ok){
      throw new Error(
        d.error||'Could not check email connection.'
      );
    }

    if(d.connected){
      text.textContent=`Connected as ${d.email}`;
      badge.textContent='Connected';
      connect.textContent='Reconnect Gmail';
      disconnect.classList.remove('hidden');
    }else{
      text.textContent='No Gmail account connected.';
      badge.textContent='Not connected';
      connect.textContent='Connect Gmail';
      disconnect.classList.add('hidden');
    }
  }catch(e){
    text.textContent=e.message;
    badge.textContent='Unavailable';
  }
}

$('menuEmailBtn')?.addEventListener(
  'click',
  ()=>setTimeout(refreshEmailConnection,0)
);

$('connectGmailBtn')?.addEventListener('click',async()=>{
  if(!session?.access_token){
    return alert('Sign in first.');
  }

  const st=$('emailSettingsStatus');
  st.textContent='Opening Google authorization…';

  try{
    const r=await fetch('/api/email-connect',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${session.access_token}`
      }
    });

    const d=await r.json();

    if(!r.ok){
      throw new Error(
        d.error||'Could not start Gmail connection.'
      );
    }

    location.href=d.url;

  }catch(e){
    st.textContent=e.message;
  }
});

$('disconnectGmailBtn')?.addEventListener('click',async()=>{
  if(!confirm('Disconnect Gmail from ScopeGuard?'))return;

  const r=await fetch('/api/email-disconnect',{
    method:'POST',
    headers:{
      Authorization:`Bearer ${session.access_token}`
    }
  });

  const d=await r.json();

  if(!r.ok){
    return alert(
      d.error||'Could not disconnect Gmail.'
    );
  }

  refreshEmailConnection();
});

const emailParams=new URLSearchParams(location.search);

if(emailParams.get('email')){
  window.addEventListener('load',()=>{
    if(emailParams.get('email')==='connected'){
      alert(
        'Gmail connected successfully. You can now send invoices from your own email.'
      );
    }else{
      alert(
        emailParams.get('message')||
        'Gmail connection failed.'
      );
    }

    history.replaceState({},'',location.pathname);
  });
}

window.sendChangeOrder = async (id) => {
  const p = project();
  const e = (p?.extras || []).find(x => x.id === id);

  if (!p || !e) {
    return alert('Change order not found.');
  }

  if (!cloudEnabled || !session?.access_token) {
    return alert('You must be signed in and connected to the cloud to send a change order.');
  }

  const client =
    (state.clients || []).find(c => c.id === p.clientId) || null;

  const currentEmail =
    p.clientEmail ||
    client?.email ||
    '';

  const to = prompt(
    'Client email address:',
    currentEmail
  );

  if (to === null) return;

  const email = to.trim();

  if (!email) {
    return alert('Enter the client email address.');
  }

  try {
    const approvalToken =
      e.approvalToken ||
      crypto.randomUUID();

    const { error: tokenError } = await db
      .from('extra_work')
      .update({
        approval_token: approvalToken,
        proposed_value: Number(e.estimatedValue || 0)
      })
      .eq('id', e.id);

    if (tokenError) throw tokenError;

    e.approvalToken = approvalToken;
    p.clientEmail = email;
    cache();

    const approvalUrl =
      `${window.location.origin}/api/approve-change-order` +
      `?token=${encodeURIComponent(approvalToken)}`;

    const response = await fetch('/api/send-change-order', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },

      body: JSON.stringify({
        to: email,

        changeOrder: {
          id: e.id,
          title: e.title || 'Change Order',
          description:
            e.description ||
            e.note ||
            e.reason ||
            'Additional work',
          requestedBy:
            e.requestedBy ||
            'Not specified',
          amount: Number(e.estimatedValue || 0)
        },

        project: {
          id: p.id,
          name: p.name || 'Project',
          customer: p.customer || ''
        },

        company: {
          name: state.company?.name || 'ScopeGuard',
          email: state.company?.email || '',
          phone: state.company?.phone || '',
          address: state.company?.address || ''
        },

        approvalUrl
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
        result.message ||
        'Could not send change order.'
      );
    }

    alert(`Change order sent successfully to ${email}.`);

  } catch (err) {
    console.error('Send change order error:', err);

    alert(
      `Could not send change order: ${err.message || err}`
    );
  }
};
