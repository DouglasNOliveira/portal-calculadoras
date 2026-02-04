// ARQUIVO RESPONSÁVEL POR GERENCIAR O COMPARADOR MÚLTIPLO DE EQUIPAMENTOS
import { computeEnergyTotals } from "./energy.js";
import { createComparadorChartsLite, destroyChartGroup, BLUE_PALETTE } from "./charts.js";

const DEPRECIACAO_ANUAL = 0.1;
const CURRENCY_DECIMALS = 2;

// ESTADO DO COMPARADOR SIMULTÂNEO
const simState = {
  filters: { tipo: "all", tecnologia: "all", funcao: "all", potencia: "all", tensao: "all", classe: "all" },
  equipments: [
    {
      key: 1,
      equipmentId: "",
      custoAq: "",
      custoInst: "",
      anosVida: "",
      manut: "",
      descarte: "",
      mode: "select",
      customName: "",
      customConsumo: "",
      customTec: "",
      customBtu: "",
      customIdrs: "",
      customClasse: "",
    },
    {
      key: 2,
      equipmentId: "",
      custoAq: "",
      custoInst: "",
      anosVida: "",
      manut: "",
      descarte: "",
      mode: "select",
      customName: "",
      customConsumo: "",
      customTec: "",
      customBtu: "",
      customIdrs: "",
      customClasse: "",
    },
  ],
  usage: {
    horasUso: 5.698,
    tarifaKwh: 1.80,
    diasAno: 253,
    taxaReal: 0.01,
  },
  binaryCompare: {
    a: "",
    b: "",
  },
};

let equipmentData = [];
let simCharts = { consumo: null, custo: null, total: null };
let lastFiltered = [];
let resizeAttached = false;
let simPaybackChart = null;

// Referências de elementos DOM
const simLoaderEl = document.getElementById("sim-equipment-loader");
const simErrorEl = document.getElementById("sim-equipment-error");
const simUiEl = document.getElementById("sim-equipment-ui");
const simUsageCard = document.getElementById("sim-usage-card");
const simChartsCard = document.getElementById("sim-charts-card");
const simResultCount = document.getElementById("sim-result-count");
const simSelectionCard = document.getElementById("sim-selection-card");
const simEquipmentListEl = document.getElementById("sim-equipment-list");
const simAddEquipmentBtn = document.getElementById("sim-add-equipment");
const simAddInmetroBtn = document.getElementById("sim-add-inmetro");
const simQtyCountEl = document.getElementById("sim-qty-count");
const simCashflowCard = document.getElementById("sim-cashflow-card");
const simCompareAEl = document.getElementById("sim-compare-a");
const simCompareBEl = document.getElementById("sim-compare-b");
const simCfTitle1 = document.getElementById("sim-cf-title-1");
const simCfTitle2 = document.getElementById("sim-cf-title-2");
const simCfBody1 = document.getElementById("sim-cf-body-1");
const simCfBody2 = document.getElementById("sim-cf-body-2");
const simCfBodyDiff = document.getElementById("sim-cf-body-diff");
const simCfPaybackCanvas = document.getElementById("sim-cf-payback");

// Referências de campos de filtro e inputs
const simFilterFields = {
  tipo: document.getElementById("sim-filter-tipo"),
  tecnologia: document.getElementById("sim-filter-tecnologia"),
  funcao: document.getElementById("sim-filter-funcao"),
  potencia: document.getElementById("sim-filter-potencia"),
  tensao: document.getElementById("sim-filter-tensao"),
  classe: document.getElementById("sim-filter-classe"),
};

// Referências de inputs de uso
const simUsageInputs = {
  horas: document.getElementById("sim-horas-uso"),
  tarifa: document.getElementById("sim-tarifa"),
  dias: document.getElementById("sim-dias-ano"),
  taxa: document.getElementById("sim-taxa-real"),
  horasVal: document.getElementById("sim-horas-uso-val"),
  tarifaVal: document.getElementById("sim-tarifa-val"),
  diasVal: document.getElementById("sim-dias-ano-val"),
  taxaVal: document.getElementById("sim-taxa-real-val"),
};

// Analisa um número, retornando um valor padrão se inválido
function parseNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundCurrency(value) {
  const factor = 10 ** CURRENCY_DECIMALS;
  return Math.round(value * factor) / factor;
}

function computeResidualValue(capex, years, rate = 0) {
  const vr = capex * (1 - DEPRECIACAO_ANUAL * years);
  const base = vr > 0 ? vr : 0;
  const pv = rate ? base / (1 + rate) ** years : base;
  return roundCurrency(pv);
}

function updateSimResidualInputs(entry) {
  if (!simEquipmentListEl || !entry) return;
  const capex = parseNumber(entry.custoAq, 0) + parseNumber(entry.custoInst, 0);
  const anosVida = parseNumber(entry.anosVida, 10);
  const taxaReal = parseNumber(simState.usage.taxaReal, 0.01);
  const valorResidual = computeResidualValue(capex, anosVida, taxaReal);
  const inputs = simEquipmentListEl.querySelectorAll(`input[data-role="sim-cf-vr"][data-key="${entry.key}"]`);
  inputs.forEach((input) => {
    input.value = valorResidual;
  });
}

function updateAllSimResidualInputs() {
  simState.equipments.forEach((entry) => updateSimResidualInputs(entry));
}

// Formata valores monetários e percentuais em BRL
function formatCurrencyBr(value) {
  const n = Number.isFinite(value) ? value : 0;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumberBr(value, decimals = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Formata valores percentuais em BR
function formatPercentBr(value, decimals = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return `${(n * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

// Formata horas por dia em formato legível
function formatHoursPerDay(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const mm = m.toString().padStart(2, "0");
  return `${h}h${mm}min/dia`;
}

// Atualiza o preenchimento visual de um input range
function setRangeFill(el) {
  if (!el) return;
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || min);
  const pct = ((val - min) * 100) / (max - min || 1);
  el.style.setProperty("--fill", `${Math.min(Math.max(pct, 0), 100)}%`);
}

// Obtém valores únicos de um campo específico na base de dados
function uniqueValues(field) {
  const values = new Set();
  equipmentData.forEach((eq) => {
    if (eq[field]) values.add(eq[field]);
  });
  return Array.from(values).filter(Boolean).sort((a, b) => (a > b ? 1 : -1));
}


// Gerencia chaves únicas para equipamentos adicionados
function nextSimKey() {
  const keys = simState.equipments.map((e) => e.key);
  return keys.length ? Math.max(...keys) + 1 : 1;
}

// Cria uma entrada padrão para equipamento no comparador
function defaultSimEntry() {
  return {
    key: nextSimKey(),
    equipmentId: "",
    custoAq: "",
    custoInst: "",
    anosVida: "",
    manut: "",
    descarte: "",
    mode: "select",
    customName: "",
    customConsumo: "",
    customTec: "",
    customBtu: "",
    customIdrs: "",
    customClasse: "",
  };
}

// Garante que o número de equipamentos no comparador esteja dentro dos limites
function updateSimQtyDisplay() {
  if (simQtyCountEl) simQtyCountEl.textContent = `Qtde. Equipamentos: ${simState.equipments.length}`;
}

// Constrói a lista de opções para seleção de equipamentos
function buildSimOptionList(filtered) {
  return (
    '<option value="">Selecione</option>' +
    filtered
      .map(
        (eq) => {
          const potencia = eq.potencia_btu ? `${eq.potencia_btu} BTU/h` : "";
          const tecnologia = eq.tecnologia ? `(${eq.tecnologia})` : "";
          const modelo = eq.modelo_concat ? `- ${eq.modelo_concat}` : "";
          const label = [eq.marca, potencia, tecnologia].filter(Boolean).join(" ") + ` ${modelo}`.trimEnd();
          const fullLabel = `${eq.marca} - ${eq.funcao} - ${eq.potencia_btu} BTU/h (${eq.tecnologia}) - ${eq.tipo} - ${eq.tensao} V - IDRS: ${eq.idrs} - Classe: ${eq.classe} - Modelo: ${eq.modelo_concat}`;
          return `<option value="${eq.id}" data-full="${fullLabel}">${label}</option>`;
        }
      )
      .join("")
  );
}

// Renderiza os cards de seleção de equipamentos no comparador
function renderSimEquipmentCards(filtered) {
  if (!simEquipmentListEl) return;
  const optionList = buildSimOptionList(filtered);
  simEquipmentListEl.innerHTML =
    simState.equipments
      .map(
        (entry, idx) => `
      <div class="equipment-card" data-key="${entry.key}">
        <div class="equipment-card__head">
          <h4>Equipamento ${idx + 1}</h4>
          <div class="equipment-card__actions">
            <button class="btn btn-excel equipment-export" data-role="sim-export-equipment" data-key="${entry.key}" type="button" aria-label="Exportar equipamento para Excel">Excel</button>
            <button class="btn soft equipment-remove" data-role="sim-remove-equipment" data-key="${entry.key}" type="button" aria-label="Remover equipamento">✕</button>
          </div>
        </div>
        ${entry.mode === "manual"
          ? `
        <div class="sim-equipment-row manual">
          <div>
            <label>Equipamento (Manual)</label>
            <input type="text" data-role="sim-custom-nome" data-key="${entry.key}" value="${entry.customName ?? ""}" placeholder="Ex.: CGF Brisa 3000" />
          </div>
          <div>
            <label>Capacidade (BTU/h)</label>
            <input type="number" data-role="sim-custom-btu" data-key="${entry.key}" min="0" step="1" value="${entry.customBtu ?? 0}" />
          </div>
          <div>
            <label>Tecnologia</label>
            <select data-role="sim-custom-tec" data-key="${entry.key}">
              <option value="" ${!entry.customTec ? "selected" : ""}>Selecione</option>
              <option value="Inverter" ${entry.customTec === "Inverter" ? "selected" : ""}>Inverter</option>
              <option value="Convencional" ${entry.customTec === "Convencional" ? "selected" : ""}>Convencional</option>
            </select>
          </div>
          <div>
            <label>IDRS</label>
            <input type="number" data-role="sim-custom-idrs" data-key="${entry.key}" min="0" step="0.01" value="${entry.customIdrs ?? 0}" />
          </div>
          <div>
            <label>Classe</label>
            <select data-role="sim-custom-classe" data-key="${entry.key}">
              <option value="">Selecione</option>
              <option value="A" ${entry.customClasse === "A" ? "selected" : ""}>A</option>
              <option value="B" ${entry.customClasse === "B" ? "selected" : ""}>B</option>
              <option value="C" ${entry.customClasse === "C" ? "selected" : ""}>C</option>
              <option value="D" ${entry.customClasse === "D" ? "selected" : ""}>D</option>
              <option value="E" ${entry.customClasse === "E" ? "selected" : ""}>E</option>
              <option value="F" ${entry.customClasse === "F" ? "selected" : ""}>F</option>
            </select>
          </div>
          <div>
            <label>Consumo (kWh/Ano)</label>
            <input type="number" data-role="sim-custom-consumo" data-key="${entry.key}" min="0" step="0.01" value="${entry.customConsumo ?? 0}" />
          </div>
          <div>
            <label>Aquisição (R$)</label>
            <input type="number" data-role="sim-custo-aq" data-key="${entry.key}" step="0.01" value="${entry.custoAq ?? ""}" />
          </div>
          <div>
            <label>Instalação (R$)</label>
            <input type="number" data-role="sim-custo-inst" data-key="${entry.key}" step="0.01" value="${entry.custoInst ?? ""}" />
          </div>
          <div>
            <label>Manutenção (R$)</label>
            <input type="number" data-role="sim-cf-manut" data-key="${entry.key}" min="0" step="1" value="${entry.manut ?? 0}" />
          </div>
          <div>
            <label>Vida Útil (Anos)</label>
            <input type="number" data-role="sim-cf-anos" data-key="${entry.key}" min="1" max="25" step="1" value="${entry.anosVida ?? 10}" />
          </div>
          <div>
            <label>Valor Residual (R$)</label>
            <input type="number" data-role="sim-cf-vr" data-key="${entry.key}" min="0" step="1" value="${computeResidualValue(parseNumber(entry.custoAq, 0) + parseNumber(entry.custoInst, 0), parseNumber(entry.anosVida, 10), parseNumber(simState.usage.taxaReal, 0.01))}" readonly />
          </div>
          <div>
            <label>Descarte (R$)</label>
            <input type="number" data-role="sim-cf-cd" data-key="${entry.key}" min="0" step="1" value="${entry.descarte ?? 0}" />
          </div>
        </div>
        `
          : `
        <div class="sim-equipment-row">
          <div>
            <label>Equipamento (INMETRO)</label>
            <select class="equipment-select-compact" data-role="sim-equipment-select" data-key="${entry.key}">
              ${optionList}
            </select>
          </div>
          <div>
            <label>Aquisição (R$)</label>
            <input type="number" data-role="sim-custo-aq" data-key="${entry.key}" step="0.01" value="${entry.custoAq ?? ""}" />
          </div>
          <div>
            <label>Instalação (R$)</label>
            <input type="number" data-role="sim-custo-inst" data-key="${entry.key}" step="0.01" value="${entry.custoInst ?? ""}" />
          </div>
          <div>
            <label>Manutenção (R$)</label>
            <input type="number" data-role="sim-cf-manut" data-key="${entry.key}" min="0" step="1" value="${entry.manut ?? 0}" />
          </div>
          <div>
            <label>Vida Útil (Anos)</label>
            <input type="number" data-role="sim-cf-anos" data-key="${entry.key}" min="1" max="25" step="1" value="${entry.anosVida ?? 10}" />
          </div>
          <div>
            <label>Valor Residual (R$)</label>
            <input type="number" data-role="sim-cf-vr" data-key="${entry.key}" min="0" step="1" value="${computeResidualValue(parseNumber(entry.custoAq, 0) + parseNumber(entry.custoInst, 0), parseNumber(entry.anosVida, 10), parseNumber(simState.usage.taxaReal, 0.01))}" readonly />
          </div>
          <div>
            <label>Descarte (R$)</label>
            <input type="number" data-role="sim-cf-cd" data-key="${entry.key}" min="0" step="1" value="${entry.descarte ?? 0}" />
          </div>
        </div>
        `}
      </div>
    `
      )
      .join("") || '<div class="notice">Nenhum equipamento disponivel com estes filtros.</div>';

  updateSimQtyDisplay();
  simState.equipments.forEach((entry) => {
    const select = simEquipmentListEl.querySelector(`select[data-key="${entry.key}"]`);
    if (select) {
      select.value = entry.equipmentId?.toString() || "";
      const option = select.selectedOptions?.[0];
      select.title = option?.dataset?.full || option?.textContent || "";
    }
    updateSimResidualInputs(entry);
  });
}

// Analisa um equipamento customizado do comparador
function parseSimCustomEquipment(entry) {
  const consumo = parseNumber(entry.customConsumo, 0);
  if (!consumo) return null;
  return {
    marca: entry.customName || "Equipamento Manual",
    tecnologia: entry.customTec || "",
    potencia_btu: parseNumber(entry.customBtu, 0),
    consumo_kwh_ano: consumo,
    idrs: parseNumber(entry.customIdrs, 0),
    classe: entry.customClasse || "",
  };
}

// Obtém a lista de equipamentos selecionados no comparador
function getSimSelectedEntries(filtered) {
  return simState.equipments
    .map((entry) => {
      if (entry.mode === "manual") {
        const eq = parseSimCustomEquipment(entry);
        if (!eq) return null;
        return { ...entry, eq };
      }
      if (!entry.equipmentId) return null;
      const eq = filtered.find((e) => e.id.toString() === entry.equipmentId.toString());
      if (!eq) return null;
      return { ...entry, eq };
    })
    .filter(Boolean);
}

function getSimLifeYearsMin(entries) {
  const years = Math.min(
    ...entries.map((entry) => {
      const n = parseNumber(entry.anosVida, 10);
      return n > 0 ? n : Infinity;
    })
  );
  return Number.isFinite(years) && years > 0 ? years : 1;
}

function getSimEntryUid(entry) {
  return `k-${entry.key}`;
}

function getSimEntryLabel(entry) {
  const marca = entry?.eq?.marca || "Equipamento";
  const potencia = entry?.eq?.potencia_btu ? `${entry.eq.potencia_btu} BTU/h` : "";
  const tecnologia = entry?.eq?.tecnologia ? `(${entry.eq.tecnologia})` : "";
  const modelo = entry?.eq?.modelo_concat ? `- ${entry.eq.modelo_concat}` : "";
  return [marca, potencia, tecnologia, modelo].filter(Boolean).join(" ").trim();
}

function getSimChartLabel(entry) {
  const nome = entry?.eq?.marca || "Equipamento";
  const tecnologia = entry?.eq?.tecnologia || "";
  return tecnologia ? `${nome}\n(${tecnologia})` : nome;
}

function destroySimPaybackChart() {
  if (simPaybackChart) {
    simPaybackChart.destroy();
    simPaybackChart = null;
  }
}

function buildSimCashflowRows(entry, years, taxaReal) {
  const capex = parseNumber(entry.custoAq, 0) + parseNumber(entry.custoInst, 0);
  const energiaAnual = parseNumber(entry.custoEnergiaAnual, 0);
  const manut = parseNumber(entry.manut, 0);
  const descarte = parseNumber(entry.descarte, 0);
  const taxa = Number.isFinite(taxaReal) ? taxaReal : 0.01;
  const rows = [
    {
      ano: 0,
      capex,
      valorResidual: 0,
      descarte: 0,
      manutencao: 0,
      energia: 0,
      coa: 0,
      vpCoa: 0,
      vpTotal: capex,
    },
  ];

  for (let ano = 1; ano <= years; ano++) {
    const valorResidualAno = ano === years ? computeResidualValue(capex, ano, taxa) : 0;
    const descarteVp = ano === years ? descarte / (1 + taxa) ** ano : 0;
    const descarteAno = descarteVp - valorResidualAno;
    const coa = energiaAnual + manut;
    const vpCoa = coa / (1 + taxa) ** ano;
    rows.push({
      ano,
      capex: 0,
      valorResidual: valorResidualAno,
      descarte: descarteAno,
      manutencao: manut,
      energia: energiaAnual,
      coa,
      vpCoa,
      vpTotal: vpCoa + descarteAno,
    });
  }

  return rows;
}

function renderSimCashflowTable(targetEl, rows, includePayback = false) {
  if (!targetEl) return;
  const sumField = (field) => rows.reduce((acc, r) => acc + (Number.isFinite(r[field]) ? r[field] : 0), 0);
  const totals = {
    ano: "Total",
    capex: rows.find((r) => r.ano === 0)?.capex ?? sumField("capex"),
    valorResidual: null,
    descarte: rows[rows.length - 1]?.descarte ?? 0,
    manutencao: sumField("manutencao"),
    energia: sumField("energia"),
    coa: sumField("coa"),
    vpCoa: sumField("vpCoa"),
    vpTotal: sumField("vpTotal"),
  };

  targetEl.innerHTML =
    rows
      .map(
        (r) => `
      <tr>
        <td>${r.ano}</td>
        <td>${formatNumberBr(r.capex, 2)}</td>
        <td>${formatNumberBr(r.valorResidual, 2)}</td>
        <td>${formatNumberBr(r.descarte, 2)}</td>
        <td>${formatNumberBr(r.manutencao, 2)}</td>
        <td>${formatNumberBr(r.energia, 2)}</td>
        <td>${formatNumberBr(r.vpCoa, 2)}</td>
        <td>${formatNumberBr(r.vpTotal, 2)}</td>
        ${includePayback ? `<td>${r.payback !== undefined ? formatNumberBr(r.payback, 2) : ""}</td>` : ""}
      </tr>`
      )
      .join("") +
    `
    <tr>
      <td>${totals.ano}</td>
      <td>${formatNumberBr(totals.capex, 2)}</td>
      <td></td>
      <td>${formatNumberBr(totals.descarte, 2)}</td>
      <td>${formatNumberBr(totals.manutencao, 2)}</td>
      <td>${formatNumberBr(totals.energia, 2)}</td>
      <td>${formatNumberBr(totals.vpCoa, 2)}</td>
      <td>${formatNumberBr(totals.vpTotal, 2)}</td>
      ${includePayback ? "<td></td>" : ""}
    </tr>`;
}

function clearSimCashflow() {
  simCashflowCard?.classList.add("hidden");
  if (simCfBody1) simCfBody1.innerHTML = "";
  if (simCfBody2) simCfBody2.innerHTML = "";
  if (simCfBodyDiff) simCfBodyDiff.innerHTML = "";
  destroySimPaybackChart();
}

function updateSimBinarySelectors(computed) {
  if (!simCompareAEl || !simCompareBEl) return;
  const options = computed.map((entry, index) => ({
    uid: getSimEntryUid(entry),
    label: `Equipamento ${index + 1} - ${getSimEntryLabel(entry)}`,
  }));
  if (options.length < 2) {
    simCompareAEl.innerHTML = "";
    simCompareBEl.innerHTML = "";
    return;
  }

  const hasA = options.some((o) => o.uid === simState.binaryCompare.a);
  const hasB = options.some((o) => o.uid === simState.binaryCompare.b);
  if (!hasA) simState.binaryCompare.a = options[0].uid;
  if (!hasB || simState.binaryCompare.b === simState.binaryCompare.a) {
    simState.binaryCompare.b = (options.find((o) => o.uid !== simState.binaryCompare.a) || options[0]).uid;
  }

  const optionHtml = options.map((o) => `<option value="${o.uid}">${o.label}</option>`).join("");
  simCompareAEl.innerHTML = optionHtml;
  simCompareBEl.innerHTML = optionHtml;
  simCompareAEl.value = simState.binaryCompare.a;
  simCompareBEl.value = simState.binaryCompare.b;
}

function updateSimCashflowComparison(computed) {
  if (!simCashflowCard) return;
  updateSimBinarySelectors(computed);
  if (!simCompareAEl || !simCompareBEl) return;

  const aUid = simState.binaryCompare.a;
  const bUid = simState.binaryCompare.b;
  if (!aUid || !bUid || aUid === bUid) {
    clearSimCashflow();
    return;
  }

  const eqA = computed.find((c) => getSimEntryUid(c) === aUid);
  const eqB = computed.find((c) => getSimEntryUid(c) === bUid);
  if (!eqA || !eqB) {
    clearSimCashflow();
    return;
  }

  const anosA = Math.max(1, parseNumber(eqA.anosVida, 10));
  const anosB = Math.max(1, parseNumber(eqB.anosVida, 10));
  const years = Math.min(anosA, anosB);
  const taxaReal = parseNumber(simState.usage.taxaReal, 0.01);

  const rowsA = buildSimCashflowRows(eqA, years, taxaReal);
  const rowsB = buildSimCashflowRows(eqB, years, taxaReal);
  const rowsDiff = rowsB.map((rB, idx) => {
    const rA = rowsA[idx];
    const capexDiff = rB.capex - rA.capex;
    const vpCoaDiff = rB.vpCoa - rA.vpCoa;
    return {
      ano: rB.ano,
      capex: capexDiff,
      valorResidual: rB.valorResidual - rA.valorResidual,
      descarte: rB.descarte - rA.descarte,
      manutencao: rB.manutencao - rA.manutencao,
      energia: rB.energia - rA.energia,
      coa: rB.coa - rA.coa,
      vpCoa: vpCoaDiff,
      vpTotal: rB.vpTotal - rA.vpTotal,
      vpPayback: capexDiff + vpCoaDiff,
      payback: 0,
    };
  });

  let acumulado = 0;
  rowsDiff.forEach((r) => {
    acumulado += r.vpPayback;
    r.payback = acumulado;
  });

  if (simCfTitle1) simCfTitle1.textContent = `Fluxo de Caixa - Equipamento 1: ${eqA.eq.marca}`;
  if (simCfTitle2) simCfTitle2.textContent = `Fluxo de Caixa - Equipamento 2: ${eqB.eq.marca}`;
  renderSimCashflowTable(simCfBody1, rowsA, false);
  renderSimCashflowTable(simCfBody2, rowsB, false);
  renderSimCashflowTable(simCfBodyDiff, rowsDiff, true);

  destroySimPaybackChart();
  if (simCfPaybackCanvas) {
    const labelsBase = rowsDiff.map((r) => r.ano);
    const paybacksBase = rowsDiff.map((r) => r.payback);
    const cumulativeFromRows = (rows) => {
      let acc = 0;
      return rows.map((r) => {
        acc += r.capex + r.vpCoa;
        return acc;
      });
    };
    const cumEq1Base = cumulativeFromRows(rowsA);
    const cumEq2Base = cumulativeFromRows(rowsB);

    const labels = [];
    const paybacks = [];
    const cumEq1 = [];
    const cumEq2 = [];
    for (let i = 0; i < labelsBase.length; i++) {
      labels.push(labelsBase[i]);
      paybacks.push(paybacksBase[i]);
      cumEq1.push(cumEq1Base[i]);
      cumEq2.push(cumEq2Base[i]);
      if (i < labelsBase.length - 1) {
        const midLabel = (labelsBase[i] + labelsBase[i + 1]) / 2;
        const midPayback = paybacksBase[i] + (paybacksBase[i + 1] - paybacksBase[i]) * 0.5;
        const midCum1 = cumEq1Base[i] + (cumEq1Base[i + 1] - cumEq1Base[i]) * 0.5;
        const midCum2 = cumEq2Base[i] + (cumEq2Base[i + 1] - cumEq2Base[i]) * 0.5;
        labels.push(midLabel);
        paybacks.push(midPayback);
        cumEq1.push(midCum1);
        cumEq2.push(midCum2);
      }
    }

    const len = paybacks.length;
    const crossIdx = paybacks.findIndex((v) => v >= 0);
    const negData = Array(len).fill(null);
    const posData = Array(len).fill(null);
    if (crossIdx === -1) {
      for (let i = 0; i < len; i++) negData[i] = paybacks[i];
    } else if (crossIdx === 0) {
      for (let i = 0; i < len; i++) posData[i] = paybacks[i];
    } else {
      for (let i = 0; i < len; i++) {
        if (i < crossIdx) negData[i] = paybacks[i];
        else posData[i] = paybacks[i];
      }
      negData[crossIdx] = 0;
      posData[crossIdx - 1] = 0;
    }

    simPaybackChart = new Chart(simCfPaybackCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Curva Resultante",
            data: paybacks,
            borderColor: BLUE_PALETTE[0],
            backgroundColor: "rgba(11, 92, 138, 0.2)",
            tension: 0.15,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            spanGaps: true,
            borderWidth: 3,
            pointBorderWidth: 2,
            pointBackgroundColor: "#fff",
            pointStyle: "circle",
          },
          {
            label: `${eqA.eq.marca} (VP Operação)`,
            data: cumEq1,
            borderColor: BLUE_PALETTE[4],
            backgroundColor: "transparent",
            tension: 0.15,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            spanGaps: true,
            borderWidth: 2.4,
            pointBorderWidth: 1.6,
            pointBackgroundColor: "#fff",
            pointStyle: "circle",
          },
          {
            label: `${eqB.eq.marca} (VP Operação)`,
            data: cumEq2,
            borderColor: BLUE_PALETTE[2],
            backgroundColor: "transparent",
            tension: 0.15,
            fill: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            spanGaps: true,
            borderWidth: 2.4,
            pointBorderWidth: 1.6,
            pointBackgroundColor: "#fff",
            pointStyle: "circle",
          },
          {
            label: "Investimento",
            data: negData,
            borderColor: "rgba(229, 83, 83, 0.7)",
            borderWidth: 1.2,
            backgroundColor: "rgba(229, 83, 83, 0.18)",
            tension: 0.15,
            fill: "origin",
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: true,
            pointStyle: "rectRounded",
          },
          {
            label: "Lucro",
            data: posData,
            borderColor: "rgba(46, 160, 67, 0.7)",
            borderWidth: 1.2,
            backgroundColor: "rgba(46, 160, 67, 0.18)",
            tension: 0.15,
            fill: "origin",
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: true,
            pointStyle: "rectRounded",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.6,
        layout: { padding: { top: 8, bottom: 8, left: 6, right: 6 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              usePointStyle: true,
              boxWidth: 18,
              boxHeight: 8,
              padding: 12,
            },
          },
          tooltip: { intersect: false, mode: "index" },
        },
        scales: {
          x: {
            title: { display: true, text: "Ano" },
            ticks: {
              callback: (value, index) => {
                const lbl = labels[index];
                return Number.isInteger(lbl) ? lbl : "";
              },
            },
          },
          y: { title: { display: true, text: "R$ acumulado" } },
        },
      },
    });
  }

  simCashflowCard.classList.remove("hidden");
}

// Constrói as opções dos filtros com base na base de dados
function simPopulateFilterOptions() {
  if (!simFilterFields.tipo) return;
  simFilterFields.tipo.innerHTML =
    '<option value="all">Todos</option>' +
    uniqueValues("tipo")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
  simFilterFields.funcao.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("funcao")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
  simFilterFields.potencia.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("potencia_btu")
      .map((v) => `<option value="${v}">${v.toLocaleString("pt-BR")} BTU/h</option>`)
      .join("");
  simFilterFields.tensao.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("tensao")
      .map((v) => `<option value="${v}">${v}V</option>`)
      .join("");
  simFilterFields.classe.innerHTML =
    '<option value="all">Todas</option>' +
    uniqueValues("classe")
      .map((v) => `<option value="${v}">${v}</option>`)
      .join("");
}

// Atualiza a visibilidade dos cards de seleção e resultados do comparador
function simUpdateVisibility(filtered) {
  const selected = getSimSelectedEntries(filtered);
  const hasData = selected.length >= 2;
  simSelectionCard?.classList.toggle("hidden", !equipmentData.length);
  simUsageCard?.classList.toggle("hidden", !hasData);
  simChartsCard?.classList.toggle("hidden", !hasData);
  simCashflowCard?.classList.toggle("hidden", !hasData);
}

// Atualiza os gráficos do comparador com base nos equipamentos selecionados
function simUpdateCharts(filtered) {
  if (!simChartsCard) return;
  const selected = getSimSelectedEntries(filtered);
  if (selected.length < 2) {
    simChartsCard.classList.add("hidden");
    destroyChartGroup(simCharts);
    clearSimCashflow();
    return;
  }

  const entries = selected.map((entry) => ({
    ...entry,
    custoAq: parseNumber(entry.custoAq, 0),
    custoInst: parseNumber(entry.custoInst, 0),
    manut: parseNumber(entry.manut, 0),
    descarte: parseNumber(entry.descarte, 0),
  }));

  const lifeYears = getSimLifeYearsMin(entries);
  const computed = computeEnergyTotals(entries, simState.usage, lifeYears).map((entry, idx) => ({
    ...entry,
    color: BLUE_PALETTE[idx % BLUE_PALETTE.length],
  }));

  const sortedByConsumo = [...computed].sort((a, b) => a.consumoTotal - b.consumoTotal);
  const sortedByCusto = [...computed].sort((a, b) => a.custoEnergiaPV - b.custoEnergiaPV);

  const labelsConsumo = sortedByConsumo.map((_, idx) => (idx + 1).toString());
  const labelsCusto = sortedByCusto.map((_, idx) => (idx + 1).toString());
  const labelsTotal = computed.map((entry) => getSimChartLabel(entry));
  const tooltipFor = (item) => {
    const marca = item.eq.marca || "Equipamento";
    const potencia = item.eq.potencia_btu ? `${item.eq.potencia_btu} BTU/h` : "";
    return potencia ? `${marca} - ${potencia}` : marca;
  };
  const tooltipLabelsConsumo = sortedByConsumo.map(tooltipFor);
  const tooltipLabelsCusto = sortedByCusto.map(tooltipFor);
  const tooltipLabelsTotal = computed.map(tooltipFor);
  const colorScaleConsumo = sortedByConsumo.map((c) => c.color);
  const colorScaleCusto = sortedByCusto.map((c) => c.color);
  const consumos = sortedByConsumo.map((c) => c.consumoTotal);
  const custosEnergia = sortedByCusto.map((c) => c.custoEnergiaPV);
  const custosAquisicao = computed.map((c) => c.custoAq);
  const custosInstalacao = computed.map((c) => c.custoInst);
  const custosEnergiaTotal = computed.map((c) => c.custoEnergiaPV);

  const barWidth = 24;
  const consumoCanvas = document.getElementById("sim-chart-consumo");
  const custoCanvas = document.getElementById("sim-chart-custo");
  const consumoWrap = consumoCanvas?.closest(".chart-scroll");
  const baseWidth = consumoWrap?.clientWidth || 720;
  const chartWidth = Math.max(baseWidth, selected.length * barWidth + 160);
  const chartHeight = Math.max(260, Math.min(360, Math.round(baseWidth * 0.45)));

  destroyChartGroup(simCharts);
  simCharts = createComparadorChartsLite({
    labelsConsumo,
    labelsCusto,
    labelsTotal,
    tooltipLabelsConsumo,
    tooltipLabelsCusto,
    tooltipLabelsTotal,
    consumos,
    custosEnergia,
    custosAquisicao,
    custosInstalacao,
    custosEnergiaTotal,
    colorScaleConsumo,
    colorScaleCusto,
    lifeYears,
    targets: { consumoId: "sim-chart-consumo", custoId: "sim-chart-custo", totalId: "sim-chart-total" },
    size: { width: chartWidth, height: chartHeight },
  });

  simChartsCard.classList.remove("hidden");
  updateSimCashflowComparison(computed);
}

// Aplica os filtros selecionados no comparador
function simApplyFilters() {
  const filtered = equipmentData.filter((eq) => {
    if (simState.filters.tipo !== "all" && eq.tipo !== simState.filters.tipo) return false;
    if (simState.filters.tecnologia !== "all" && eq.tecnologia !== simState.filters.tecnologia) return false;
    if (simState.filters.funcao !== "all" && eq.funcao !== simState.filters.funcao) return false;
    if (simState.filters.potencia !== "all" && eq.potencia_btu.toString() !== simState.filters.potencia) return false;
    if (simState.filters.tensao !== "all" && eq.tensao.toString() !== simState.filters.tensao) return false;
    if (simState.filters.classe !== "all" && (eq.classe || "").toString() !== simState.filters.classe) return false;
    return true;
  });

  if (simResultCount) simResultCount.textContent = `${filtered.length} Equipamentos Encontrados`;
  lastFiltered = filtered;

  simState.equipments.forEach((entry) => {
    if (entry.mode !== "select") return;
    if (!entry.equipmentId) return;
    const exists = filtered.find((eq) => eq.id.toString() === entry.equipmentId.toString());
    if (!exists) entry.equipmentId = "";
  });

  renderSimEquipmentCards(filtered);
  simUpdateCharts(filtered);
  simUpdateVisibility(filtered);
}

// Anexa eventos aos campos de filtro e inputs do comparador
function attachSimEvents() {
  if (!simFilterFields.tipo) return;
  Object.entries(simFilterFields).forEach(([key, el]) => {
    if (!el) return;
    el.addEventListener("change", () => {
      simState.filters[key] = el.value;
      simApplyFilters();
    });
  });

  if (simUsageInputs.horas) {
    simUsageInputs.horas.addEventListener("input", () => {
      simState.usage.horasUso = parseNumber(simUsageInputs.horas.value, 5.698);
      simUsageInputs.horasVal.textContent = formatHoursPerDay(simState.usage.horasUso);
      simApplyFilters();
    });
  }
  if (simUsageInputs.tarifa) {
    simUsageInputs.tarifa.addEventListener("input", () => {
      simState.usage.tarifaKwh = parseNumber(simUsageInputs.tarifa.value, 0.63);
      simUsageInputs.tarifaVal.textContent = formatCurrencyBr(simState.usage.tarifaKwh);
      simApplyFilters();
    });
  }
  if (simUsageInputs.taxa) {
    simUsageInputs.taxa.addEventListener("input", () => {
      simState.usage.taxaReal = parseNumber(simUsageInputs.taxa.value, 0.01);
      simUsageInputs.taxaVal.textContent = formatPercentBr(simState.usage.taxaReal, 2);
      updateAllSimResidualInputs();
      simApplyFilters();
    });
  }
  if (simUsageInputs.dias) {
    simUsageInputs.dias.addEventListener("input", () => {
      simState.usage.diasAno = parseNumber(simUsageInputs.dias.value, 255);
      simUsageInputs.diasVal.textContent = `${simState.usage.diasAno} dias`;
      simApplyFilters();
    });
  }

  if (simUsageInputs.horas) simUsageInputs.horas.value = simState.usage.horasUso.toString();
  if (simUsageInputs.tarifa) simUsageInputs.tarifa.value = simState.usage.tarifaKwh.toString();
  if (simUsageInputs.dias) simUsageInputs.dias.value = simState.usage.diasAno.toString();
  if (simUsageInputs.taxa) simUsageInputs.taxa.value = simState.usage.taxaReal.toString();
  if (simUsageInputs.horasVal) simUsageInputs.horasVal.textContent = formatHoursPerDay(simState.usage.horasUso);
  if (simUsageInputs.tarifaVal) simUsageInputs.tarifaVal.textContent = formatCurrencyBr(simState.usage.tarifaKwh);
  if (simUsageInputs.diasVal) simUsageInputs.diasVal.textContent = `${simState.usage.diasAno} dias`;
  if (simUsageInputs.taxaVal) simUsageInputs.taxaVal.textContent = formatPercentBr(simState.usage.taxaReal, 2);
  setRangeFill(simUsageInputs.horas);
  setRangeFill(simUsageInputs.tarifa);
  setRangeFill(simUsageInputs.dias);
  setRangeFill(simUsageInputs.taxa);

  updateSimQtyDisplay();

  if (simAddInmetroBtn) {
    simAddInmetroBtn.addEventListener("click", () => {
      if (simState.equipments.length >= 20) return;
      simState.equipments.push(defaultSimEntry());
      renderSimEquipmentCards(lastFiltered);
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });
  }

  if (simAddEquipmentBtn) {
    simAddEquipmentBtn.addEventListener("click", () => {
      if (simState.equipments.length >= 20) return;
      simState.equipments.push({ ...defaultSimEntry(), mode: "manual" });
      renderSimEquipmentCards(lastFiltered);
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });
  }

  if (simEquipmentListEl) {
    simEquipmentListEl.addEventListener("click", (event) => {
      const target = event.target;
      const role = target?.dataset?.role;
      const key = target?.dataset?.key;
      if (role !== "sim-remove-equipment" || !key) return;
      if (simState.equipments.length <= 1) return;
      simState.equipments = simState.equipments.filter((e) => e.key.toString() !== key.toString());
      renderSimEquipmentCards(lastFiltered);
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });

    simEquipmentListEl.addEventListener("change", (event) => {
      const target = event.target;
      const role = target?.dataset?.role;
      const key = target?.dataset?.key;
      if (!role || !key) return;
      const entry = simState.equipments.find((e) => e.key.toString() === key.toString());
      if (!entry) return;
      switch (role) {
        case "sim-equipment-select":
          entry.equipmentId = target.value || "";
          if (target instanceof HTMLSelectElement) {
            const option = target.selectedOptions?.[0];
            target.title = option?.dataset?.full || option?.textContent || "";
          }
          break;
        case "sim-custom-tec":
          entry.customTec = target.value || "";
          break;
        case "sim-custom-classe":
          entry.customClasse = target.value || "";
          break;
        case "sim-cf-anos":
          entry.anosVida = target.value;
          updateSimResidualInputs(entry);
          break;
        default:
          break;
      }
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });
    simEquipmentListEl.addEventListener("input", (event) => {
      const target = event.target;
      const role = target?.dataset?.role;
      const key = target?.dataset?.key;
      if (!role || !key) return;
      const entry = simState.equipments.find((e) => e.key.toString() === key.toString());
      if (!entry) return;
      switch (role) {
        case "sim-custom-nome":
          entry.customName = target.value;
          break;
        case "sim-custom-btu":
          entry.customBtu = target.value;
          break;
        case "sim-custom-idrs":
          entry.customIdrs = target.value;
          break;
        case "sim-custom-consumo":
          entry.customConsumo = target.value;
          break;
        case "sim-custo-aq":
          entry.custoAq = target.value;
          updateSimResidualInputs(entry);
          break;
        case "sim-custo-inst":
          entry.custoInst = target.value;
          updateSimResidualInputs(entry);
          break;
        case "sim-cf-manut":
          entry.manut = target.value;
          break;
        case "sim-cf-anos":
          entry.anosVida = target.value;
          updateSimResidualInputs(entry);
          break;
        case "sim-cf-cd":
          entry.descarte = target.value;
          break;
        default:
          break;
      }
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });
  }

  if (simCompareAEl) {
    simCompareAEl.addEventListener("change", () => {
      simState.binaryCompare.a = simCompareAEl.value;
      if (simState.binaryCompare.a === simState.binaryCompare.b) {
        const alt = Array.from(simCompareBEl?.options || []).find((opt) => opt.value !== simState.binaryCompare.a);
        if (alt) simState.binaryCompare.b = alt.value;
      }
      simUpdateCharts(lastFiltered);
    });
  }

  if (simCompareBEl) {
    simCompareBEl.addEventListener("change", () => {
      simState.binaryCompare.b = simCompareBEl.value;
      if (simState.binaryCompare.b === simState.binaryCompare.a) {
        const alt = Array.from(simCompareAEl?.options || []).find((opt) => opt.value !== simState.binaryCompare.b);
        if (alt) simState.binaryCompare.a = alt.value;
      }
      simUpdateCharts(lastFiltered);
    });
  }
}

// Inicializa o comparador simultâneo com a base de dados fornecida
export function initComparadorMultiplo(data) {
  if (!simFilterFields.tipo) return;
  equipmentData = Array.isArray(data) ? data : [];

  simPopulateFilterOptions();
  if (simFilterFields.potencia) simFilterFields.potencia.value = simState.filters.potencia;
  if (simFilterFields.funcao) simFilterFields.funcao.value = simState.filters.funcao;

  attachSimEvents();
  simApplyFilters();

  if (simLoaderEl) simLoaderEl.classList.add("hidden");
  if (simUiEl) simUiEl.classList.remove("hidden");
  if (simErrorEl) simErrorEl.classList.add("hidden");

  if (!resizeAttached) {
    resizeAttached = true;
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (!lastFiltered.length) return;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => simUpdateCharts(lastFiltered), 180);
    });
  }
}

// Exibe uma mensagem de erro no comparador simultâneo
export function showComparadorMultiploError(message) {
  if (simLoaderEl) simLoaderEl.classList.add("hidden");
  if (simErrorEl) {
    simErrorEl.textContent = message || "Nao foi possivel carregar a base de equipamentos.";
    simErrorEl.classList.remove("hidden");
  }
}
