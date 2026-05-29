/* ============================================================
   FinanceFácil — JavaScript App
   Calculadoras, Comparador, Glossário, Quiz de Perfil
   ============================================================ */

'use strict';

// ── Utils ────────────────────────────────────────────────────

const fmt = {
  currency: (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  pct:      (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%',
  num:      (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  year:     (n) => `${n} ${n === 1 ? 'ano' : 'anos'}`,
};

function el(id) { return document.getElementById(id); }

// Referência compartilhada: permite que o slider chame o calc do juros compostos
let jurosCalcFn = null;

function showToast(msg, type = 'success') {
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ── Mobile Menu ─────────────────────────────────────────────

(function initMobileMenu() {
  const toggle = el('menu-toggle');
  const menu   = el('mobile-menu');
  if (!toggle || !menu) return;

  let open = false;

  function setOpen(val) {
    open = val;
    toggle.setAttribute('aria-expanded', String(val));
    menu.toggleAttribute('inert', !val);
    toggle.setAttribute('aria-label', val ? 'Fechar menu' : 'Abrir menu');
  }

  toggle.addEventListener('click', () => setOpen(!open));

  // Close on link click
  menu.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });
})();

// ── Tab Navigation ───────────────────────────────────────────

(function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn[role="tab"]');
  if (!tabBtns.length) return;

  function activate(btn) {
    tabBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
      b.tabIndex = -1;
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.tabIndex = 0;

    const panelId = btn.getAttribute('aria-controls');
    document.querySelectorAll('.tab-panel').forEach(p => {
      const isActive = p.id === panelId;
      p.classList.toggle('active', isActive);
      p.hidden = !isActive;
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activate(btn));
    btn.addEventListener('keydown', (e) => {
      const all = [...tabBtns];
      const idx = all.indexOf(btn);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = all[(idx + 1) % all.length];
        next.focus();
        activate(next);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = all[(idx - 1 + all.length) % all.length];
        prev.focus();
        activate(prev);
      }
      if (e.key === 'Home') { e.preventDefault(); all[0].focus(); activate(all[0]); }
      if (e.key === 'End')  { e.preventDefault(); all[all.length-1].focus(); activate(all[all.length-1]); }
    });
  });
})();

// ── Range Sliders Sync ───────────────────────────────────────

(function initRangeSliders() {
  // ── Período (Juros Compostos) ──────────────────────────────
  // 'input'  → atualiza número + valores em tempo real (sem redesenhar gráfico)
  // 'change' → ao SOLTAR: redesenha gráfico completo + mostra notificação
  const periodSlider = el('periodo-slider');
  const periodInput  = el('periodo');
  if (periodSlider && periodInput) {
    periodSlider.addEventListener('input', () => {
      periodInput.value = periodSlider.value;
      jurosCalcFn?.(false); // números em tempo real, sem gráfico (rápido)
    });
    periodSlider.addEventListener('change', () => {
      periodInput.value = periodSlider.value;
      jurosCalcFn?.(true); // gráfico completo ao soltar
      setTimeout(() => {
        const r = el('total-acumulado');
        if (r) showToast(`✅ ${fmt.year(parseInt(periodInput.value))}: ${r.textContent}`);
      }, 100);
    });
    periodInput.addEventListener('input', () => {
      periodSlider.value = periodInput.value;
    });
  }

  // ── Entrada (Financiamento) ────────────────────────────────
  const entradaSlider = el('entrada-slider');
  const entradaInput  = el('entrada-financ');
  if (entradaSlider && entradaInput) {
    entradaSlider.addEventListener('input', () => {
      entradaInput.value = entradaSlider.value;
      entradaInput.dispatchEvent(new Event('input')); // atualiza em tempo real
    });
    entradaInput.addEventListener('input', () => {
      entradaSlider.value = entradaInput.value;
    });
  }
})();

// ── Quick Rate Buttons ────────────────────────────────────────

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.quick-rate-btn');
  if (!btn) return;
  const target = btn.dataset.target || 'taxa-juros';
  const rate   = btn.dataset.rate;
  const input  = el(target);
  if (input) {
    input.value = rate;
    // Dispara 'input' — os listeners de cada calc já respondem a isso.
    // NÃO dispara 'submit' para não recarregar a página.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

// ── 1. Calculadora de Juros Compostos ────────────────────────

(function initJurosCompostos() {
  const form = el('juros-form');
  if (!form) return;

  // withChart=true  → cálculo completo com gráfico (ao soltar slider / submit)
  // withChart=false → só atualiza os números (enquanto arrasta, mais rápido)
  function calc(withChart = true) {
    const PV   = parseFloat(el('capital-inicial').value) || 0;
    const PMT  = parseFloat(el('aporte-mensal').value)   || 0;
    const rate = (parseFloat(el('taxa-juros').value)   || 0) / 100;
    const anos = parseInt(el('periodo').value)           || 1;

    const n    = anos * 12;
    const rm   = Math.pow(1 + rate, 1/12) - 1; // taxa mensal equivalente

    const fvPV  = PV * Math.pow(1 + rm, n);
    const fvPMT = rm > 0 ? PMT * ((Math.pow(1 + rm, n) - 1) / rm) : PMT * n;

    const total       = fvPV + fvPMT;
    const invested    = PV + (PMT * n);
    const juros       = total - invested;
    const rendaMensal = total * rm;

    el('total-acumulado').textContent = fmt.currency(total);
    el('total-investido').textContent = fmt.currency(invested);
    el('total-juros').textContent     = fmt.currency(juros);
    el('renda-mensal').textContent    = fmt.currency(rendaMensal);

    const multiplo = invested > 0 ? (total / invested).toFixed(1) : 0;
    el('juros-tip').textContent =
      `Em ${fmt.year(anos)}, cada R$ 1 investido virou R$ ${multiplo}. ` +
      `O juro representa ${fmt.pct(juros / (total || 1) * 100)} do total acumulado.`;

    if (withChart) renderJurosChart(PV, PMT, rm, anos);
    return { total, invested, juros };
  }

  // Expõe para que initRangeSliders possa chamar com/sem gráfico
  jurosCalcFn = calc;

  function renderJurosChart(PV, PMT, rm, anos) {
    const chart    = el('juros-chart');
    const yearsLbl = el('chart-years-label');
    if (!chart) return;

    chart.innerHTML = '';
    yearsLbl.innerHTML = '';

    const step  = Math.max(1, Math.floor(anos / 8));
    const years = [];
    for (let y = step; y <= anos; y += step) years.push(y);
    if (years[years.length - 1] !== anos) years.push(anos);

    // Find max for scaling
    let maxVal = 0;
    const values = years.map(y => {
      const n   = y * 12;
      const fv  = PV * Math.pow(1 + rm, n) + (rm > 0 ? PMT * ((Math.pow(1 + rm, n) - 1) / rm) : PMT * n);
      const inv = PV + PMT * n;
      maxVal = Math.max(maxVal, fv);
      return { fv, inv, earnedPct: ((fv - inv) / (maxVal || 1)) * 100, investedPct: (inv / (maxVal || 1)) * 100 };
    });

    years.forEach((y, i) => {
      const v       = values[i];
      const invH    = maxVal > 0 ? (v.inv / maxVal) * 100 : 0;
      const earnedH = maxVal > 0 ? ((v.fv - v.inv) / maxVal) * 100 : 0;

      const group = document.createElement('div');
      group.className = 'chart-bar-group';
      group.setAttribute('role', 'img');
      group.setAttribute('aria-label', `Ano ${y}: ${fmt.currency(v.fv)}`);

      const earned = document.createElement('div');
      earned.className = 'chart-bar earned';
      earned.style.height = `${earnedH}%`;

      const invested = document.createElement('div');
      invested.className = 'chart-bar invested';
      invested.style.height = `${invH}%`;

      group.appendChild(earned);
      group.appendChild(invested);
      chart.appendChild(group);

      const lbl = document.createElement('span');
      lbl.textContent = y;
      yearsLbl.appendChild(lbl);
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    calc(true);
  });

  // Inputs de texto/number → calc completo com gráfico
  // Range slider é tratado pelo initRangeSliders com lógica própria
  form.querySelectorAll('input:not([type="range"])').forEach(input => {
    input.addEventListener('input', () => calc(true));
  });

  // Cálculo inicial
  calc(true);
})();

// ── 2. Calculadora de Aposentadoria ──────────────────────────

(function initAposentadoria() {
  const form = el('aposen-form');
  if (!form) return;

  function calc() {
    const idadeAtual     = parseFloat(el('idade-atual').value)     || 30;
    const idadeAposen    = parseFloat(el('idade-aposen').value)    || 60;
    const rendaDesejada  = parseFloat(el('renda-desejada').value)  || 5000;
    const expectativaVida = parseFloat(el('expectativa-vida').value) || 85;
    const taxaAnual      = (parseFloat(el('taxa-aposen').value)   || 10.5) / 100;
    const patrimAtual    = parseFloat(el('patrimonio-atual').value) || 0;

    const anosAteAposen  = Math.max(1, idadeAposen - idadeAtual);
    const anosAposent    = Math.max(1, expectativaVida - idadeAposen);
    const taxaMensal     = Math.pow(1 + taxaAnual, 1/12) - 1;

    // Patrimônio necessário para sustentar renda usando regra do 4%
    const patrimonioNecessario = rendaDesejada * 300; // ~4% retirada = 300x renda mensal

    // Quanto falta
    const faltaPatrimonio = Math.max(0, patrimonioNecessario - patrimAtual * Math.pow(1 + taxaMensal, anosAteAposen * 12));

    // Aporte mensal necessário (PMT de anuidade ordinária)
    const n = anosAteAposen * 12;
    let aporteNecessario;
    if (taxaMensal > 0 && n > 0) {
      aporteNecessario = faltaPatrimonio * taxaMensal / (Math.pow(1 + taxaMensal, n) - 1);
    } else {
      aporteNecessario = faltaPatrimonio / (n || 1);
    }

    // Renda que o patrimônio pode gerar (4% ao ano = 0.333% ao mês)
    const rendaGarantida = patrimonioNecessario * (taxaMensal * 0.8); // conservador

    // Progress meter
    const progress = Math.min(100, (patrimAtual / (patrimonioNecessario || 1)) * 100);

    el('patrimonio-necessario').textContent = fmt.currency(patrimonioNecessario);
    el('aporte-necessario').textContent     = fmt.currency(Math.max(0, aporteNecessario));
    el('anos-aposen').textContent           = fmt.year(anosAteAposen);
    el('renda-garantida').textContent       = fmt.currency(rendaDesejada);

    const meterFill = el('meter-fill');
    const meter     = el('independence-meter');
    if (meterFill) {
      meterFill.style.width = `${progress}%`;
      meter.setAttribute('aria-valuenow', Math.round(progress));
    }

    el('aposen-tip').textContent =
      aporteNecessario > 0
        ? `Para se aposentar aos ${idadeAposen} anos com R$ ${fmt.num(rendaDesejada)}/mês, você precisa de um patrimônio de ${fmt.currency(patrimonioNecessario)} (regra dos 4%).`
        : '🎉 Você já tem patrimônio suficiente para a aposentadoria!';
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); calc(); });
  form.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => calc()));
  calc();
})();

// ── 3. Simulador de Financiamento ────────────────────────────

(function initFinanciamento() {
  const form = el('fin-form');
  if (!form) return;

  function calcPrice(PV, tm, n) {
    if (tm === 0) return { parcela: PV / n, total: PV };
    const parcela = PV * (tm * Math.pow(1 + tm, n)) / (Math.pow(1 + tm, n) - 1);
    return { parcela, total: parcela * n };
  }

  function calcSAC(PV, tm, n) {
    const amort    = PV / n;
    const primeiraJ = PV * tm;
    const primeira = amort + primeiraJ;
    // Total SAC = amortizações + juros decrescentes
    let totalJuros = 0;
    for (let i = 0; i < n; i++) {
      const saldo = PV - (amort * i);
      totalJuros += saldo * tm;
    }
    return { parcela: primeira, total: PV + totalJuros };
  }

  function calc() {
    const valor   = parseFloat(el('valor-financ').value)   || 300000;
    const entrada = (parseFloat(el('entrada-financ').value) || 20) / 100;
    const tm      = (parseFloat(el('taxa-financ').value)   || 0.9) / 100;
    const n       = parseInt(el('prazo-financ').value)      || 360;
    const sistema = form.querySelector('input[name="sistema"]:checked')?.value || 'price';

    const PV = valor * (1 - entrada);

    const price = calcPrice(PV, tm, n);
    const sac   = calcSAC(PV, tm, n);

    const chosen = sistema === 'price' ? price : sac;
    const totalJuros = chosen.total - PV;

    el('primeira-parcela').textContent   = fmt.currency(chosen.parcela);
    el('valor-financiado').textContent   = fmt.currency(PV);
    el('total-juros-fin').textContent    = fmt.currency(totalJuros);
    el('total-pago').textContent         = fmt.currency(chosen.total);
    el('price-total').textContent        = fmt.currency(price.total);
    el('sac-total').textContent          = fmt.currency(sac.total);

    const economia = price.total - sac.total;
    el('fin-tip').textContent =
      `No sistema SAC você economiza ${fmt.currency(Math.abs(economia))} em relação ao PRICE. ` +
      `No PRICE a parcela é fixa; no SAC as parcelas começam maiores mas caem todo mês.`;
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); calc(); });
  form.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => calc()));
  calc();
})();

// ── 4. Retorno Real (Inflação) ────────────────────────────────

(function initInflacao() {
  const form = el('inflacao-form');
  if (!form) return;

  function calc() {
    const valor       = parseFloat(el('valor-inflac').value)   || 10000;
    const taxaNominal = (parseFloat(el('taxa-nominal').value)  || 10.4)  / 100;
    const taxaInflac  = (parseFloat(el('taxa-inflacao').value) || 4.83) / 100;
    const anos        = parseInt(el('periodo-inflac').value)   || 5;

    // Retorno real pela fórmula de Fisher: (1+r_nominal)/(1+r_inflação) - 1
    const retornoReal  = ((1 + taxaNominal) / (1 + taxaInflac)) - 1;
    const nominalFinal = valor * Math.pow(1 + taxaNominal, anos);
    const realFinal    = valor * Math.pow(1 + retornoReal, anos);
    const ganhoReal    = realFinal - valor;

    el('retorno-real').textContent       = fmt.pct(retornoReal * 100);
    el('valor-nominal-final').textContent = fmt.currency(nominalFinal);
    el('valor-real-final').textContent    = fmt.currency(realFinal);
    el('ganho-real').textContent          = fmt.currency(ganhoReal);

    // Power bars
    el('power-today').textContent   = fmt.currency(valor);
    el('power-nominal').textContent = fmt.currency(nominalFinal);
    el('power-real').textContent    = fmt.currency(realFinal);

    const maxVal = nominalFinal;
    el('bar-nominal').style.width = `100%`;
    el('bar-real').style.width    = `${Math.min(100, (realFinal / maxVal) * 100)}%`;

    el('inflac-tip').textContent =
      retornoReal > 0
        ? `Ótimo! Seu investimento supera a inflação em ${fmt.pct(retornoReal * 100)} ao ano. Seu poder de compra real cresce.`
        : `⚠️ Atenção! Sua taxa não supera a inflação. Em termos reais, você está perdendo poder de compra.`;
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); calc(); });
  form.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => calc()));
  calc();
})();

// ── 5. Regra do 72 ───────────────────────────────────────────

(function initRegra72() {
  const form = el('r72-form');
  if (!form) return;

  function calc() {
    const taxa  = parseFloat(el('taxa-r72').value)  || 10.5;
    const valor = parseFloat(el('valor-r72').value) || 10000;

    // Regra do 72 (aproximação) e fórmula exata
    const anosExato = Math.log(2) / Math.log(1 + taxa / 100);
    const anosAprox = 72 / taxa;

    const total      = valor * 2;
    const quadruplo  = valor * 4;

    el('r72-anos').textContent         = `${anosExato.toFixed(1)} anos`;
    el('r72-total').textContent        = fmt.currency(total);
    el('r72-quadruplo').textContent    = fmt.currency(quadruplo);
    el('r72-valor-inicial').textContent = fmt.currency(valor);
    el('r72-valor-dobrado').textContent = fmt.currency(total);
    el('r72-tempo').textContent         = `${anosExato.toFixed(1)} anos`;

    el('r72-tip').textContent =
      `Com ${fmt.pct(taxa)} ao ano, seu dinheiro dobra em ${anosExato.toFixed(1)} anos ` +
      `(estimativa pela Regra do 72: ${anosAprox.toFixed(1)} anos). ` +
      `Dobra de novo em mais ${anosExato.toFixed(1)} anos, chegando a ${fmt.currency(quadruplo)}.`;
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); calc(); });
  form.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => calc()));
  calc();
})();

// ── 6. Orçamento 50/30/20 ────────────────────────────────────

(function initOrcamento() {
  const form = el('orcamento-form');
  if (!form) return;

  function calc() {
    const renda = parseFloat(el('renda-mensal-orc').value) || 4000;

    let necTotal = 0, desTotal = 0;
    document.querySelectorAll('.expense-input[data-category="necessidades"]')
      .forEach(inp => { necTotal += parseFloat(inp.value) || 0; });
    document.querySelectorAll('.expense-input[data-category="desejos"]')
      .forEach(inp => { desTotal += parseFloat(inp.value) || 0; });

    const poupanca = Math.max(0, renda - necTotal - desTotal);

    const necPct = (necTotal / renda) * 100;
    const desPct = (desTotal / renda) * 100;
    const pouPct = (poupanca / renda) * 100;

    el('nec-valor').textContent = fmt.currency(necTotal);
    el('des-valor').textContent = fmt.currency(desTotal);
    el('pou-valor').textContent = fmt.currency(poupanca);
    el('pct-necessidades').textContent = fmt.pct(necPct);
    el('pct-desejos').textContent      = fmt.pct(desPct);
    el('pct-poupanca').textContent     = fmt.pct(pouPct);

    // Status badges
    function statusBadge(el, ok, label) {
      el.textContent = ok ? '✅ OK' : '⚠️ Alto';
      el.className = 'budget-status-badge ' + (ok ? 'badge-ok' : 'badge-over');
    }
    statusBadge(el('nec-status'), necPct <= 50);
    statusBadge(el('des-status'), desPct <= 30);
    statusBadge(el('pou-status'), pouPct >= 20, 'Ótimo');
    el('pou-status').textContent = pouPct >= 20 ? '🎉 Ótimo' : '⬇️ Baixo';
    el('pou-status').className   = 'budget-status-badge ' + (pouPct >= 20 ? 'badge-ok' : 'badge-over');

    // Donut chart
    const circumference = 251.2; // 2*pi*40
    const necDash = (necPct / 100) * circumference;
    const desDash = (desPct / 100) * circumference;
    const pouDash = (pouPct / 100) * circumference;

    const necEl  = el('donut-necessidades');
    const desEl  = el('donut-desejos');
    const pouEl  = el('donut-poupanca');
    const saldo  = el('donut-saldo');

    if (necEl) {
      necEl.setAttribute('stroke-dasharray', `${necDash} ${circumference - necDash}`);
      necEl.setAttribute('stroke-dashoffset', '0');

      const necOffset = -necDash;
      desEl.setAttribute('stroke-dasharray', `${desDash} ${circumference - desDash}`);
      desEl.setAttribute('stroke-dashoffset', String(necOffset));

      const desOffset = -(necDash + desDash);
      pouEl.setAttribute('stroke-dasharray', `${pouDash} ${circumference - pouDash}`);
      pouEl.setAttribute('stroke-dashoffset', String(desOffset));
    }

    if (saldo) saldo.textContent = fmt.currency(poupanca).replace('R$', 'R$\n');

    // Tip
    const tips = [];
    if (necPct > 50) tips.push('Suas necessidades estão acima de 50%. Veja se há custos fixos que podem ser reduzidos.');
    if (desPct > 30) tips.push('Seus desejos estão acima de 30%. Tente cortar gastos supérfluos.');
    if (pouPct < 20) tips.push('Você está investindo menos de 20%. Tente aumentar esse valor.');
    if (pouPct >= 20 && necPct <= 50 && desPct <= 30) tips.push('🎉 Parabéns! Seu orçamento está dentro do método 50/30/20!');

    el('orcamento-tip').textContent = tips.join(' ') || 'Analyze seu orçamento preenchendo os valores acima.';
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); calc(); });
  form.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => calc()));
  calc();
})();

// ── Comparador de Investimentos ───────────────────────────────

(function initComparador() {
  const grid = el('investments-grid');
  if (!grid) return;

  const investments = [
    {
      id: 'poupanca',
      icon: '🏦',
      name: 'Poupança',
      fullName: 'Caderneta de Poupança',
      rate: '<span id="card-poup-rate">~6% a.a.</span>',
      rateDesc: 'Quando Selic > 8,5%: 0,5% a.m. + TR',
      tags: ['Liquidez diária', 'FGC', 'Isenta IR'],
      desc: 'O investimento mais popular do Brasil. Seguro e simples, mas costuma render abaixo da inflação em muitos períodos.',
      perfil: 'conservador',
      liquidity: 'Diária',
      risco: '⭐ Baixíssimo',
      ir: 'Isento PF',
    },
    {
      id: 'cdb',
      icon: '🏛️',
      name: 'CDB',
      fullName: 'Certificado de Depósito Bancário',
      rate: '100–120% CDI',
      rateDesc: '<span id="card-cdb-desc">~10,4% a 12,5% a.a. (bruto)</span>',
      tags: ['FGC', 'Renda fixa', 'Varia por banco'],
      desc: 'Você empresta dinheiro ao banco e recebe juros. Quanto menor o banco, maior a taxa. Coberto pelo FGC até R$ 250 mil.',
      perfil: 'conservador',
      liquidity: 'No vencimento',
      risco: '⭐ Baixo',
      ir: 'IR regressivo',
    },
    {
      id: 'tesouroselic',
      icon: '🏛️',
      name: 'Tesouro Selic',
      fullName: 'LFT — Letras Financeiras do Tesouro',
      rate: '<span id="card-selic-rate">~Selic 10,5%</span>',
      rateDesc: 'Acompanha a Taxa Selic diariamente',
      tags: ['Liquidez D+1', 'Risco soberano', 'Reserva emergência'],
      desc: 'O investimento mais seguro do Brasil. Ideal para reserva de emergência. Não tem risco de mercado se precisar resgatar.',
      perfil: 'conservador',
      liquidity: 'D+1 útil',
      risco: '⭐ Mínimo',
      ir: 'IR regressivo',
    },
    {
      id: 'tesouripca',
      icon: '📊',
      name: 'Tesouro IPCA+',
      fullName: 'NTN-B — Notas do Tesouro Nacional',
      rate: 'IPCA + ~6%',
      rateDesc: 'Proteção total contra a inflação + ganho real',
      tags: ['Proteção inflação', 'Longo prazo', 'Risco de mercado'],
      desc: 'Garante que seu dinheiro sempre vai crescer acima da inflação. Perfeito para aposentadoria e objetivos de longo prazo.',
      perfil: 'moderado',
      liquidity: 'D+1 (volatilidade)',
      risco: '⭐⭐ Baixo/Médio',
      ir: 'IR regressivo',
    },
    {
      id: 'lci',
      icon: '🌿',
      name: 'LCI / LCA',
      fullName: 'Letras de Crédito Imob./Agronegócio',
      rate: '~90–100% CDI',
      rateDesc: '<span id="card-lci-desc">~9,4–10,4% a.a. — mas isento de IR!</span>',
      tags: ['Isenta IR PF', 'FGC', 'Carência'],
      desc: 'Isentas de IR para pessoa física. Mesmo com taxa menor que CDB, podem ser mais rentáveis no líquido. Há prazo mínimo de carência.',
      perfil: 'conservador',
      liquidity: 'Após carência (90+ dias)',
      risco: '⭐ Baixo',
      ir: 'Isento PF',
    },
    {
      id: 'fii',
      icon: '🏢',
      name: 'FIIs',
      fullName: 'Fundos de Investimento Imobiliário',
      rate: '~8–12% a.a.',
      rateDesc: 'Dividendos mensais + valorização da cota',
      tags: ['Dividendos mensais', 'Isento IR PF', 'Renda variável'],
      desc: 'Invista em imóveis sem comprar um imóvel. Paga dividendos mensais isentos de IR. Cota pode variar na bolsa.',
      perfil: 'moderado',
      liquidity: 'Mercado B3',
      risco: '⭐⭐ Médio',
      ir: 'Dividendos isentos',
    },
    {
      id: 'etf',
      icon: '📈',
      name: 'ETFs',
      fullName: 'Fundos de Índice — Ex: BOVA11, IVVB11',
      rate: 'Varia com o índice',
      rateDesc: 'BOVA11: ~Ibovespa. IVVB11: ~S&P 500 em R$',
      tags: ['Diversificado', 'Taxa baixa', 'Longo prazo'],
      desc: 'Compre "a bolsa inteira" com uma única ação. ETFs seguem índices e são a forma mais eficiente de diversificar com baixo custo.',
      perfil: 'moderado',
      liquidity: 'Mercado B3',
      risco: '⭐⭐⭐ Médio/Alto',
      ir: '15% sobre lucro',
    },
    {
      id: 'acoes',
      icon: '🚀',
      name: 'Ações',
      fullName: 'Ações da Bolsa de Valores (B3)',
      rate: 'Ilimitado (e negativo)',
      rateDesc: 'Histórico longo prazo: ~15–18% a.a. (mas volátil)',
      tags: ['Alta liquidez', 'Maior risco', 'Maior potencial'],
      desc: 'Você se torna sócio de uma empresa. Maior potencial de retorno a longo prazo, mas exige estudo e tolerância à volatilidade.',
      perfil: 'arrojado',
      liquidity: 'D+2 (alta)',
      risco: '⭐⭐⭐⭐ Alto',
      ir: '15–20% sobre lucro',
    },
  ];

  function renderCard(inv) {
    const card = document.createElement('article');
    card.className = 'investment-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-perfil', inv.perfil);
    card.setAttribute('id', `inv-${inv.id}`);
    card.innerHTML = `
      <div class="inv-header">
        <span class="inv-icon" aria-hidden="true">${inv.icon}</span>
        <span class="inv-badge badge-${inv.perfil}">${inv.perfil.charAt(0).toUpperCase() + inv.perfil.slice(1)}</span>
      </div>
      <div>
        <div class="inv-name">${inv.name}</div>
        <div class="inv-full-name">${inv.fullName}</div>
      </div>
      <div>
        <div class="inv-rate">${inv.rate}</div>
        <div class="inv-rate-label">${inv.rateDesc}</div>
      </div>
      <div class="inv-tags">
        ${inv.tags.map(t => `<span class="inv-tag">${t}</span>`).join('')}
      </div>
      <p class="inv-description">${inv.desc}</p>
      <div class="inv-metrics">
        <div class="inv-metric">
          <span class="inv-metric-label">Liquidez</span>
          <span class="inv-metric-value">${inv.liquidity}</span>
        </div>
        <div class="inv-metric">
          <span class="inv-metric-label">Risco</span>
          <span class="inv-metric-value">${inv.risco}</span>
        </div>
        <div class="inv-metric">
          <span class="inv-metric-label">Imposto de Renda</span>
          <span class="inv-metric-value">${inv.ir}</span>
        </div>
        <div class="inv-metric">
          <span class="inv-metric-label">Perfil</span>
          <span class="inv-metric-value">${inv.perfil}</span>
        </div>
      </div>
    `;
    return card;
  }

  investments.forEach(inv => grid.appendChild(renderCard(inv)));

  // Filter
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      const filter = btn.dataset.filter;
      document.querySelectorAll('.investment-card').forEach(card => {
        card.hidden = filter !== 'all' && card.dataset.perfil !== filter;
      });
    });
  });
})();

// ── Glossário ─────────────────────────────────────────────────

(function initGlossario() {
  const grid = el('glossario-grid');
  const searchInput = el('glossario-search');
  if (!grid || !searchInput) return;

  function getTermos(r) {
    // Valores de fallback ou reais
    const selic = r ? f2(r.selic) : '10,50';
    const cdi = r ? f2(r.cdi) : '10,40';
    const ipca = r ? f2(r.ipca) : '4,83';
    const cdb110 = r ? f2(r.cdi * 1.1) : '11,44';
    const lci90 = r ? f2(r.cdi * 0.9) : '9,36';
    const lci_equiv = r ? f2((r.cdi * 0.9) / 0.825) : '105'; // approx equivalence (17.5% IR)

    return [
      { term: 'CDI', def: 'Certificado de Depósito Interbancário. É a taxa de juros que os bancos cobram entre si para empréstimos de curtíssimo prazo. A maioria dos CDBs paga um percentual do CDI.', ex: `Exemplo: CDB que paga 100% do CDI = paga ~${cdi}% ao ano (hoje).` },
      { term: 'Selic', def: 'Taxa básica de juros da economia brasileira, definida pelo Banco Central. Influencia todos os outros juros do país — do financiamento ao investimento.', ex: `Exemplo: Selic em ${selic}% a.a. significa que o Tesouro Selic rende ~${selic}% ao ano.` },
      { term: 'IPCA', def: 'Índice Nacional de Preços ao Consumidor Amplo. É o indicador oficial da inflação no Brasil, medido pelo IBGE mensalmente.', ex: `Exemplo: IPCA de ${ipca}% significa que os preços subiram ${ipca}% nos últimos 12 meses.` },
      { term: 'FGC', def: 'Fundo Garantidor de Créditos. Protege seu dinheiro em CDB, LCI, LCA e poupança em até R$ 250.000 por CPF por instituição financeira.', ex: 'Exemplo: Se um banco quebrar, você recebe até R$ 250 mil de volta.' },
      { term: 'CDB', def: 'Certificado de Depósito Bancário. Você empresta dinheiro a um banco e ele paga juros. Quanto menor o banco, maior a taxa oferecida.', ex: `Exemplo: CDB de 110% do CDI em banco médio = ~${cdb110}% a.a.` },
      { term: 'LCI / LCA', def: 'Letras de Crédito Imobiliário e do Agronegócio. Isentas de IR para pessoa física. Têm carência mínima antes do resgate.', ex: `Exemplo: LCI de 90% do CDI sem IR (~${lci90}%) = equivale a um CDB de ~${lci_equiv}% do CDI com IR.` },
      { term: 'FII', def: 'Fundo de Investimento Imobiliário. Investe em imóveis ou títulos imobiliários e distribui dividendos mensais isentos de IR para pessoas físicas.', ex: 'Exemplo: MXRF11 distribui ~R$ 0,11 por cota por mês.' },
      { term: 'ETF', def: 'Exchange Traded Fund. Fundo de índice negociado na bolsa que replica o desempenho de um índice, como o Ibovespa (BOVA11) ou o S&P 500 (IVVB11).', ex: 'Exemplo: BOVA11 = você investe nas ~80 maiores empresas do Brasil de uma vez.' },
      { term: 'Juros Compostos', def: 'Juros que incidem sobre o principal e sobre juros acumulados. O "juro sobre juro" que faz o dinheiro crescer exponencialmente.', ex: `Exemplo: R$ 1.000 a 10% a.a. por 30 anos = R$ 17.449 (não R$ 4.000)!` },
      { term: 'Tesouro Direto', def: 'Programa do governo federal para venda de títulos públicos para pessoas físicas. É o investimento mais seguro do Brasil — risco soberano.', ex: 'Tipos: Tesouro Selic (liquidez), IPCA+ (longo prazo), Prefixado (taxa garantida).' },
      { term: 'Renda Fixa', def: 'Categoria de investimentos onde a regra de rendimento é definida na contratação. Você sabe (ou consegue estimar) quanto vai receber.', ex: 'Exemplos: CDB, LCI, LCA, Tesouro Direto, Debêntures.' },
      { term: 'Renda Variável', def: 'Investimentos cujo retorno não é predefinido. Podem gerar lucros maiores que renda fixa, mas também perdas.', ex: 'Exemplos: Ações, ETFs, FIIs, BDRs, Fundos Multimercado.' },
      { term: 'B3', def: 'A bolsa de valores brasileira (Brasil, Bolsa, Balcão). Onde são negociadas ações, ETFs, FIIs, BDRs e outros ativos.', ex: 'Equivale à NYSE (Nova York) ou London Stock Exchange (Londres).' },
      { term: 'Dividendos', def: 'Parcela do lucro distribuída aos acionistas/cotistas. FIIs distribuem 95% do lucro semestral (isento de IR).', ex: 'Exemplo: Uma ação com dividend yield de 5% paga R$ 5 ao ano para cada R$ 100 investidos.' },
      { term: 'Ibovespa', def: 'Índice que mede o desempenho das principais ações da B3. É o principal termômetro do mercado de ações brasileiro.', ex: 'Ibovespa em 130.000 pontos: se subir para 143.000, valorizou 10%.' },
      { term: 'P/L (Preço/Lucro)', def: 'Indica quantos anos de lucro você paga ao comprar uma ação pelo preço atual. Quanto menor, teoricamente mais barata pode estar a ação.', ex: 'Ação com P/L 10 = você paga 10 vezes o lucro anual da empresa.' },
      { term: 'BDR', def: 'Brazilian Depositary Receipt. Certificados que representam ações de empresas estrangeiras negociados na B3 em reais.', ex: 'AAPL34 = Apple. MSFT34 = Microsoft. GOGL34 = Google.' },
      { term: 'Taxa de Administração', def: 'Porcentagem cobrada anualmente por fundos para cobrir custos de gestão. Evite fundos de renda fixa com taxa alta.', ex: 'Fundo com 2% a.a. de taxa consome quase todo seu ganho real acima da inflação.' },
    ];
  }

  function renderTermos(lista) {
    grid.innerHTML = '';
    lista.forEach(t => {
      const card = document.createElement('article');
      card.className = 'glossario-card';
      card.setAttribute('lang', 'pt-BR');
      card.innerHTML = `
        <div class="glossario-term">${t.term}</div>
        <p class="glossario-definition">${t.def}</p>
        ${t.ex ? `<div class="glossario-example">${t.ex}</div>` : ''}
      `;
      grid.appendChild(card);
    });
    if (lista.length === 0) {
      grid.innerHTML = '<p style="color:var(--color-text-muted);grid-column:1/-1;text-align:center;padding:2rem">Nenhum termo encontrado. Tente outra busca.</p>';
    }
  }

  window.updateGlossario = function(r) {
    window.lastGlossarioRates = r || window.lastGlossarioRates || null;
    const termoInput = searchInput.value.toLowerCase();
    const lista = getTermos(window.lastGlossarioRates);
    
    // Filter
    const filtered = lista.filter(t => 
      t.term.toLowerCase().includes(termoInput) || 
      t.def.toLowerCase().includes(termoInput)
    );
    
    renderTermos(filtered);
  };

  updateGlossario(null);

  searchInput.addEventListener('input', () => updateGlossario());
})();

// ── Quiz de Perfil ────────────────────────────────────────────

(function initQuiz() {
  const container = el('quiz-container');
  if (!container) return;

  const questions = [
    {
      q: 'Se seus investimentos caíssem 20% de repente, o que você faria?',
      opts: [
        { text: '😱 Venderia tudo imediatamente para não perder mais', score: 0 },
        { text: '😟 Ficaria preocupado mas esperaria recuperar', score: 1 },
        { text: '😌 Manteria a calma e esperaria a recuperação', score: 2 },
        { text: '🤑 Aproveitaria para comprar mais', score: 3 },
      ]
    },
    {
      q: 'Qual é o seu objetivo principal ao investir?',
      opts: [
        { text: '🛡️ Proteger meu dinheiro da inflação com segurança', score: 0 },
        { text: '🏦 Crescer moderadamente com pouco risco', score: 1 },
        { text: '📈 Crescer bem no longo prazo com algum risco', score: 2 },
        { text: '🚀 Maximizar os ganhos, aceito os riscos', score: 3 },
      ]
    },
    {
      q: 'Por quanto tempo você pretende deixar o dinheiro investido?',
      opts: [
        { text: '⚡ Menos de 1 ano', score: 0 },
        { text: '📅 1 a 3 anos', score: 1 },
        { text: '📆 3 a 10 anos', score: 2 },
        { text: '🏖️ Mais de 10 anos', score: 3 },
      ]
    },
    {
      q: 'Como é sua situação financeira atual?',
      opts: [
        { text: '💸 Tenho dívidas e pouca reserva', score: 0 },
        { text: '🏦 Tenho reserva de emergência', score: 1 },
        { text: '📊 Tenho reserva e alguns investimentos', score: 2 },
        { text: '💰 Tenho patrimônio sólido e diversificado', score: 3 },
      ]
    },
    {
      q: 'Você já investiu em ações ou renda variável antes?',
      opts: [
        { text: '❌ Nunca, prefiro segurança', score: 0 },
        { text: '🤔 Um pouco, mas me deixa nervoso', score: 1 },
        { text: '👍 Sim, me sinto confortável', score: 2 },
        { text: '✅ Sim, é meu foco principal', score: 3 },
      ]
    },
  ];

  const profiles = [
    {
      icon: '🛡️',
      name: 'Conservador',
      desc: 'Você prioriza segurança acima de tudo. Prefere rendimentos mais previsíveis sem grandes sustos. Carteira ideal: Tesouro Selic, CDB com FGC, LCI/LCA e fundos DI. Reserva bem formada primeiro!',
      suggestion: 'Tesouro Selic (70%) + CDB/LCI (20%) + Renda Variável (10%)',
    },
    {
      icon: '⚖️',
      name: 'Moderado',
      desc: 'Você busca equilíbrio entre segurança e rentabilidade. Aceita alguma variação para crescer mais no médio prazo. Boa hora para começar com FIIs e ETFs.',
      suggestion: 'Renda Fixa (50%) + FIIs (25%) + ETFs (15%) + Ações (10%)',
    },
    {
      icon: '🚀',
      name: 'Arrojado',
      desc: 'Você tem foco no longo prazo e não perde o sono com oscilações. Investe com visão de futuro, priorizando crescimento. Conheça bem as empresas antes de investir.',
      suggestion: 'Renda Fixa (20%) + FIIs (20%) + Ações/ETFs (60%)',
    },
  ];

  let currentQ = 0;
  let scores   = [];

  function getProfile(totalScore) {
    const max = questions.length * 3;
    const pct = totalScore / max;
    if (pct < 0.33) return profiles[0];
    if (pct < 0.66) return profiles[1];
    return profiles[2];
  }

  function renderQuestion(idx) {
    const q = questions[idx];
    const pct = ((idx) / questions.length) * 100;

    container.innerHTML = `
      <div class="quiz-progress">
        <div class="quiz-progress-track" role="progressbar" aria-valuenow="${idx}" aria-valuemin="0" aria-valuemax="${questions.length}" aria-label="Progresso do quiz">
          <div class="quiz-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="quiz-progress-label">${idx + 1} de ${questions.length}</span>
      </div>
      <div class="quiz-question" id="quiz-q">
        <div class="quiz-q-label">Pergunta ${idx + 1}</div>
        <p class="quiz-q-text">${q.q}</p>
        <div class="quiz-options" role="group" aria-label="Opções de resposta">
          ${q.opts.map((opt, i) => `
            <button class="quiz-option" data-score="${opt.score}" data-idx="${i}" aria-label="${opt.text}" type="button">
              ${opt.text}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const score = parseInt(btn.dataset.score);
        scores.push(score);

        // Highlight selected
        container.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        setTimeout(() => {
          if (currentQ < questions.length - 1) {
            currentQ++;
            renderQuestion(currentQ);
          } else {
            showResult();
          }
        }, 400);
      });
    });
  }

  function showResult() {
    const total   = scores.reduce((a, b) => a + b, 0);
    const profile = getProfile(total);

    container.innerHTML = `
      <div class="quiz-result">
        <div class="quiz-result-icon" aria-hidden="true">${profile.icon}</div>
        <h3 class="quiz-result-title">Perfil ${profile.name}</h3>
        <p class="quiz-result-desc">${profile.desc}</p>
        <div class="result-tip" style="text-align:left;width:100%">
          <span aria-hidden="true">📊</span>
          <span><strong>Carteira sugerida:</strong><br/>${profile.suggestion}</span>
        </div>
        <button class="btn btn-ghost quiz-restart-btn" id="quiz-restart" type="button">
          Refazer o quiz
        </button>
      </div>
    `;

    el('quiz-restart').addEventListener('click', () => {
      currentQ = 0;
      scores   = [];
      renderQuestion(0);
    });
  }

  renderQuestion(0);
})();

// ── Back to Top ───────────────────────────────────────────────

(function initBackToTop() {
  const btn = el('back-to-top');
  if (!btn) return;

  const observer = new IntersectionObserver(([entry]) => {
    btn.hidden = entry.isIntersecting;
  }, { threshold: 0.1 });

  const hero = document.querySelector('.hero');
  if (hero) observer.observe(hero);

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// ── Scroll Reveal (Intersection Observer) ────────────────────

(function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;

  const observed = document.querySelectorAll(
    '.stat-card, .investment-card, .learn-card, .glossario-card'
  );

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  observed.forEach(elem => {
    elem.style.opacity = '0';
    elem.style.transform = 'translateY(20px)';
    elem.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(elem);
  });
})();

// ── Taxas Reais — BCB + BrasilAPI + AwesomeAPI ───────────────
//
//  Fontes:
//    BrasilAPI → https://brasilapi.com.br/api/taxas/v1
//               CDI e Selic já anualizados (% a.a.) — sem risco de taxa mensal
//    BCB SGS   → séries 13522 (IPCA 12m) e 189 (IGP-M 12m)
//    AwesomeAPI→ USD-BRL e EUR-BRL em tempo real
//
//  Regra da Poupança (Brasil):
//    Selic > 8,5% → 0,5% ao mês + TR ≈ 6,17% a.a.
//    Selic ≤ 8,5% → 70% da Selic + TR
//
//  Após buscar, atualiza:
//    • Faixa de taxas (topo da página)
//    • Campos pré-preenchidos de TODAS as calculadoras
//    • Textos de hint nos formulários
//    • Botões de atalho (Selic / CDI / Poupança)
//    • Tabela comparativa da Regra do 72

(function initRealRates() {
  const f2 = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f1 = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const yr = (n) => n < 1 ? '< 1 ano' : '~' + f1(n) + ' anos';

  const FALLBACK = { selic: 10.50, cdi: 10.40, ipca: 4.83, igpm: 6.10, dolar: 5.14, euro: 5.58 };

  // Regra legal da poupança brasileira (considerando TR acumulada de ~1.5% a.a. para simulação, quando buscar da API)
  function calcPoupanca(selic, trAnualizada) {
    var tr = trAnualizada || 0; // se falhar, assume 0
    return selic > 8.5
      ? ((Math.pow(1.005, 12) - 1) * 100) + tr  // 0,5%/mês capitalizado = ~6,17% a.a. + TR
      : (selic * 0.70) + tr;                     // 70% da Selic + TR
  }

  function setLoading() {
    ['selic-rate','cdi-rate','ipca-rate','igpm-rate','dolar-rate','euro-rate']
      .forEach(function(id) { var e = el(id); if (e) e.style.opacity = '0.4'; });
  }

  function applyToStrip(r) {
    var set = function(id, text) { var e = el(id); if (e) { e.textContent = text; e.style.opacity = '1'; } };
    set('selic-rate',  f2(r.selic) + '% a.a.');
    set('cdi-rate',    f2(r.cdi)   + '% a.a.');
    set('ipca-rate',   f2(r.ipca)  + '%');
    set('igpm-rate',   f2(r.igpm)  + '%');
    set('dolar-rate',  'R$ ' + f2(r.dolar));
    set('euro-rate',   'R$ ' + f2(r.euro));
  }

  function applyToForms(r) {
    var setField = function(id, val) {
      var e = el(id);
      if (e) { e.value = val.toFixed(2); e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    setField('taxa-juros',   r.cdi);
    setField('taxa-aposen',  r.cdi);
    setField('taxa-nominal', r.cdi);
    setField('taxa-inflacao', r.ipca);
    setField('taxa-r72',     r.cdi);
  }

  function applyToHints(r) {
    var set = function(id, text) { var e = el(id); if (e) e.textContent = text; };
    set('hint-taxa-juros',   'CDI hoje = ' + f2(r.cdi) + '% a.a. | Selic = ' + f2(r.selic) + '% a.a.');
    set('hint-taxa-nominal', 'Ex.: CDI = ' + f2(r.cdi) + '%');
    set('hint-taxa-ipca',    'Atual = ' + f2(r.ipca) + '% nos últimos 12 meses (IPCA)');
  }

  function applyToQuickBtns(r, poupanca) {
    document.querySelectorAll('.quick-rate-btn').forEach(function(btn) {
      var label = btn.textContent.trim();
      if (label === 'Selic')    btn.dataset.rate = r.selic.toFixed(2);
      if (label === 'CDI')      btn.dataset.rate = r.cdi.toFixed(2);
      if (label === 'Poupança') btn.dataset.rate = poupanca.toFixed(2);
    });
  }

  function applyToComparativo(r, poupanca) {
    var set = function(id, text) { var e = el(id); if (e) e.textContent = text; };
    set('comp-poupanca-taxa', '~' + f2(poupanca) + '% a.a.');
    set('comp-poupanca-anos', yr(72 / poupanca));
    set('comp-cdi-taxa',  '~' + f2(r.cdi) + '% a.a.');
    set('comp-cdi-anos',  yr(72 / r.cdi));
    set('comp-selic-taxa', '~' + f2(r.selic) + '% a.a.');
    set('comp-selic-anos', yr(72 / r.selic));
  }

  function applyToComparadorCards(r, poupanca) {
    var set = function(id, text) { var e = document.getElementById(id); if (e) e.textContent = text; };
    // Poupança
    set('card-poup-rate', '~' + f2(poupanca) + '% a.a.');
    // CDB
    set('card-cdb-desc', '~' + f2(r.cdi) + '% a ' + f2(r.cdi * 1.2) + '% a.a. (bruto)');
    // Tesouro Selic
    set('card-selic-rate', '~Selic ' + f2(r.selic) + '%');
    // LCI
    set('card-lci-desc', '~' + f2(r.cdi * 0.9) + ' a ' + f2(r.cdi) + '% a.a. — isento de IR!');
  }

  function apply(r) {
    var poupanca = calcPoupanca(r.selic, r.tr || 0);
    applyToStrip(r);
    applyToHints(r);
    applyToQuickBtns(r, poupanca);
    applyToComparativo(r, poupanca);
    applyToComparadorCards(r, poupanca);
    applyToForms(r);
    
    if (window.updateGlossario) {
      window.updateGlossario(r);
    }
  }

  async function fetchRates() {
    setLoading();
    try {
      // BCB SGS: valor vem como string com vírgula decimal ("4,83")
      var BCB = function(serie) {
        return fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + serie + '/dados/ultimos/1?formato=json')
          .then(function(r) { return r.json(); })
          .then(function(d) { return parseFloat(String(d[0] && d[0].valor || '').replace(',', '.')); });
      };

      var results = await Promise.all([
        BCB(13522),  // IPCA acumulado 12 meses
        BCB(189),    // IGP-M acumulado 12 meses
        fetch('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL').then(function(r) { return r.json(); }),
        // BrasilAPI: CDI e Selic já anualizados (% a.a.) — sem confundir com taxa mensal
        fetch('https://brasilapi.com.br/api/taxas/v1').then(function(r) { return r.json(); }),
        BCB(226) // TR mensal (Taxa Referencial) para calcular Poupança mais precisa
      ]);

      var ipca = results[0], igpm = results[1], cambio = results[2], brasilApiData = results[3], trMensal = results[4];
      
      // Anualiza a TR (aproximação simples)
      var trAnualizada = isNaN(trMensal) ? 0 : ((Math.pow(1 + (trMensal / 100), 12) - 1) * 100);

      var find = function(nome) {
        var obj = Array.isArray(brasilApiData) && brasilApiData.find(function(t) {
          return t.nome && t.nome.toUpperCase() === nome.toUpperCase();
        });
        return (obj && typeof obj.valor === 'number' && !isNaN(obj.valor)) ? obj.valor : NaN;
      };

      var selic = find('SELIC') || FALLBACK.selic;
      var cdi   = find('CDI')   || FALLBACK.cdi;
      
      // Verifica se o estado já foi carregado para não sobrescrever
      var hasSavedState = localStorage.getItem('financeFacil_state') !== null;

      apply({
        selic,
        cdi,
        tr: trAnualizada,
        ipca:  isNaN(ipca)  ? FALLBACK.ipca  : ipca,
        igpm:  isNaN(igpm)  ? FALLBACK.igpm  : igpm,
        dolar: parseFloat(cambio && cambio.USDBRL && cambio.USDBRL.bid) || FALLBACK.dolar,
        euro:  parseFloat(cambio && cambio.EURBRL && cambio.EURBRL.bid) || FALLBACK.euro,
      }); // always update rate forms since they are excluded from localStorage

    } catch (err) {
      console.warn('⚠️ Falha ao buscar taxas — usando valores de referência:', err.message);
      apply(FALLBACK);
    }
  }

  fetchRates();
  setInterval(fetchRates, 10 * 60 * 1000);
})();


// ── Notificação no botão Calcular ────────────────────────────
// Toast ao clicar no botão. O slider tem seu próprio toast no 'change'.

(function announceCalcResults() {
  document.querySelectorAll('.calc-form .btn-primary[type="submit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(() => {
        const resultsArea = btn.closest('.calculator-grid')?.querySelector('.calc-results-area');
        const mainResult  = resultsArea?.querySelector('.result-value');
        if (mainResult) showToast(`✅ Calculado: ${mainResult.textContent}`);
      }, 150);
    });
  });
})();


// ── Persistência de Dados (Local Storage) ─────────────────────
(function initPersistence() {
  const forms = document.querySelectorAll('form.calc-form');
  
  // Campos ignorados pelo LocalStorage (taxas reais + periodo)
  const ignoreIds = ['taxa-juros', 'taxa-aposen', 'taxa-selic', 'taxa-cdb', 'taxa-lci', 'taxa-ipca', 'taxa-igpm', 'dolar-rate', 'euro-rate', 'periodo'];
  let isRestoring = false;

  // Escuta mudanças nos botões do comparador
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRestoring) return;
      clearTimeout(window.saveStateTimeout);
      window.saveStateTimeout = setTimeout(saveState, 500);
    });
  });

  // Salva os valores no LocalStorage
  function saveState() {
    if (isRestoring) return;
    const state = {};
    forms.forEach(form => {
      const inputs = form.querySelectorAll('input[type="number"]');
      inputs.forEach(input => {
        if (input.id && !ignoreIds.includes(input.id)) {
          state[input.id] = input.value;
        } else if (input.classList.contains('expense-input')) {
          const label = input.getAttribute('aria-label');
          if (label) state['orcamento_' + label] = input.value;
        }
      });
    });
    
    // Salva a aba ativa (aplicativo selecionado)
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.id) {
      state.activeTab = activeTab.id;
    }

    // Salva o filtro ativo do comparador
    const activeFilter = document.querySelector('.filter-btn.active');
    if (activeFilter && activeFilter.dataset.filter) {
      state.activeFilter = activeFilter.dataset.filter;
    }

    localStorage.setItem('financeFacil_state', JSON.stringify(state));
  }

  // Restaura os valores do LocalStorage
  function loadState() {
    try {
      const saved = localStorage.getItem('financeFacil_state');
      if (!saved) return;
      const state = JSON.parse(saved);
      
      isRestoring = true;

      // Restaura a aba ativa (aplicativo selecionado)
      if (state.activeTab) {
        const tabBtn = document.getElementById(state.activeTab);
        if (tabBtn && !tabBtn.classList.contains('active')) {
          tabBtn.click(); // simula o clique para mudar a aba
        }
      }

      // Restaura o filtro do comparador
      if (state.activeFilter) {
        const filterBtn = document.querySelector('.filter-btn[data-filter="' + state.activeFilter + '"]');
        if (filterBtn && !filterBtn.classList.contains('active')) {
          filterBtn.click(); // simula o clique para filtrar
        }
      }
      
      forms.forEach(form => {
        const inputs = form.querySelectorAll('input[type="number"]');
        
        inputs.forEach(input => {
          if (input.id && ignoreIds.includes(input.id)) return;

          let savedVal = null;
          if (input.id && state[input.id] !== undefined) {
            savedVal = state[input.id];
          } else if (input.classList.contains('expense-input')) {
            const label = input.getAttribute('aria-label');
            if (label && state['orcamento_' + label] !== undefined) {
              savedVal = state['orcamento_' + label];
            }
          }
          
          if (savedVal !== null && savedVal !== input.value) {
            input.value = savedVal;
            // Dispara o evento de input DIRETAMENTE no campo modificado
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });
      isRestoring = false;
    } catch (e) {
      isRestoring = false;
      console.warn('Falha ao restaurar estado do LocalStorage:', e);
    }
  }

  // Escuta mudanças em qualquer input e salva
  document.addEventListener('input', (e) => {
    if (isRestoring) return;
    if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
      // Debounce simples para não salvar a cada tecla em excesso
      clearTimeout(window.saveStateTimeout);
      window.saveStateTimeout = setTimeout(saveState, 500);
    }
  });

  // Salva sempre que trocar de aba
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRestoring) return;
      clearTimeout(window.saveStateTimeout);
      window.saveStateTimeout = setTimeout(saveState, 200);
    });
  });

  // Carrega imediatamente ao iniciar (evita 'flash' de troca de aba)
  loadState();

  // Comportamento para os links do rodapé
  const footerLinks = document.querySelectorAll('.footer-link');
  footerLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      // Ferramentas
      if (link.dataset.tab) {
        const tabBtn = document.getElementById(link.dataset.tab);
        if (tabBtn) {
          tabBtn.click();
          // Scroll suave até a seção
          const ferramentasSec = document.getElementById('ferramentas');
          if (ferramentasSec) ferramentasSec.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      // Aprender: Abre o details correspondente
      const href = link.getAttribute('href');
      if (href && href.startsWith('#aprender-')) {
        const card = document.querySelector(href);
        if (card) {
          const details = card.querySelector('.learn-details');
          if (details) details.setAttribute('open', '');
          // Pequeno delay pro scroll após o card expandir
          setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
      }
    });
  });

})();

console.log('🚀 FinanceFácil carregado com sucesso!');
