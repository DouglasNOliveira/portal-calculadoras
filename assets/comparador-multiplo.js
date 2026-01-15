// -------------------------------------------------------------------------------------------------
// Comparador Simultâneo (Múltiplo).
// -------------------------------------------------------------------------------------------------
// Responsável por filtrar e comparar todos os equipamentos ao mesmo tempo, sem seleção individual.
// -------------------------------------------------------------------------------------------------

import { computeEnergyTotals } from "./energy.js";
import { createComparadorChartsLite, destroyChartGroup, BLUE_PALETTE } from "./charts.js";

// -------------------------------------------------------------------------------------------------
// Estado local do comparador simultâneo
// -------------------------------------------------------------------------------------------------
const simState = {
  filters: { tipo: "all", tecnologia: "all", funcao: "all", potencia: "all", tensao: "all", classe: "all" },
  equipments: [
    {
      key: 1,
      equipmentId: "",
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
};

let equipmentData = [];
let simCharts = { consumo: null, custo: null };
let lastFiltered = [];
let resizeAttached = false;

// -------------------------------------------------------------------------------------------------
// Referências de UI (comparador simultâneo)
// -------------------------------------------------------------------------------------------------
const simLoaderEl = document.getElementById("sim-equipment-loader");
const simErrorEl = document.getElementById("sim-equipment-error");
const simUiEl = document.getElementById("sim-equipment-ui");
const simUsageCard = document.getElementById("sim-usage-card");
const simChartsCard = document.getElementById("sim-charts-card");
const simResultCount = document.getElementById("sim-result-count");
const simSelectionCard = document.getElementById("sim-selection-card");
const simEquipmentListEl = document.getElementById("sim-equipment-list");
const simAddEquipmentBtn = document.getElementById("sim-add-equipment");
const simQtyInput = document.getElementById("sim-qty");

const simFilterFields = {
  tipo: document.getElementById("sim-filter-tipo"),
  tecnologia: document.getElementById("sim-filter-tecnologia"),
  funcao: document.getElementById("sim-filter-funcao"),
  potencia: document.getElementById("sim-filter-potencia"),
  tensao: document.getElementById("sim-filter-tensao"),
  classe: document.getElementById("sim-filter-classe"),
};

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

// -------------------------------------------------------------------------------------------------
// Utilitários simples (mantidos locais para evitar dependência circular)
// -------------------------------------------------------------------------------------------------
function parseNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrencyBr(value) {
  const n = Number.isFinite(value) ? value : 0;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercentBr(value, decimals = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return `${(n * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function formatHoursPerDay(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const mm = m.toString().padStart(2, "0");
  return `${h}h${mm}min/dia`;
}

function setRangeFill(el) {
  if (!el) return;
  const min = parseFloat(el.min || "0");
  const max = parseFloat(el.max || "100");
  const val = parseFloat(el.value || min);
  const pct = ((val - min) * 100) / (max - min || 1);
  el.style.setProperty("--fill", `${Math.min(Math.max(pct, 0), 100)}%`);
}

function uniqueValues(field) {
  const values = new Set();
  equipmentData.forEach((eq) => {
    if (eq[field]) values.add(eq[field]);
  });
  return Array.from(values).filter(Boolean).sort((a, b) => (a > b ? 1 : -1));
}

function nextSimKey() {
  const keys = simState.equipments.map((e) => e.key);
  return keys.length ? Math.max(...keys) + 1 : 1;
}

function defaultSimEntry() {
  return {
    key: nextSimKey(),
    equipmentId: "",
    mode: "select",
    customName: "",
    customConsumo: "",
    customTec: "",
    customBtu: "",
    customIdrs: "",
    customClasse: "",
  };
}

function ensureSimEquipmentCount(count) {
  const target = Math.max(2, Math.min(20, parseInt(count, 10) || 2));
  while (simState.equipments.length < target) simState.equipments.push(defaultSimEntry());
  if (simState.equipments.length > target) simState.equipments = simState.equipments.slice(0, target);
  if (simQtyInput) simQtyInput.value = target.toString();
}

function buildSimOptionList(filtered) {
  return (
    '<option value="">Selecione</option>' +
    filtered
      .map(
        (eq) => `<option value="${eq.id}">${eq.marca} - ${eq.funcao} 
        - ${eq.potencia_btu} BTU/h (${eq.tecnologia}) - ${eq.tipo} - ${eq.tensao} V 
        - IDRS: ${eq.idrs} - Classe: ${eq.classe} - Modelo: ${eq.modelo_concat}</option>`
      )
      .join("")
  );
}

function renderSimEquipmentCards(filtered) {
  if (!simEquipmentListEl) return;
  const optionList = buildSimOptionList(filtered);
  simEquipmentListEl.innerHTML =
    simState.equipments
      .map(
        (entry, idx) => `
      <div class="equipment-card" data-key="${entry.key}">
        <h4>Equipamento ${idx + 1}</h4>
        ${entry.mode === "manual"
          ? `
        <div class="mode-manual">
          <div class="grid manual-cols-4 gap">
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
          </div>
          <div class="grid manual-cols-4 gap">
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
          </div>
        </div>
        `
          : `
        <div class="mode-select">
          <label>Equipamento (INMETRO)</label>
          <select data-role="sim-equipment-select" data-key="${entry.key}">
            ${optionList}
          </select>
        </div>
        `}
      </div>
    `
      )
      .join("") || '<div class="notice">Nenhum equipamento disponivel com estes filtros.</div>';

  simState.equipments.forEach((entry) => {
    const select = simEquipmentListEl.querySelector(`select[data-key="${entry.key}"]`);
    if (select) select.value = entry.equipmentId?.toString() || "";
  });
}

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

// -------------------------------------------------------------------------------------------------
// Filtros e graficos
// -------------------------------------------------------------------------------------------------
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

function simUpdateVisibility(filtered) {
  const selected = getSimSelectedEntries(filtered);
  const hasData = selected.length >= 2;
  simSelectionCard?.classList.toggle("hidden", !equipmentData.length);
  simUsageCard?.classList.toggle("hidden", !hasData);
  simChartsCard?.classList.toggle("hidden", !hasData);
}

function simUpdateCharts(filtered) {
  if (!simChartsCard) return;
  const selected = getSimSelectedEntries(filtered);
  if (selected.length < 2) {
    simChartsCard.classList.add("hidden");
    destroyChartGroup(simCharts);
    return;
  }

  const lifeYears = 1;
  const entries = selected.map((entry) => ({
    ...entry,
    custoAq: 0,
    custoInst: 0,
    manut: 0,
    descarte: 0,
  }));

  const computed = computeEnergyTotals(entries, simState.usage, lifeYears).map((entry, idx) => ({
    ...entry,
    color: BLUE_PALETTE[idx % BLUE_PALETTE.length],
  }));

  const sortedByConsumo = [...computed].sort((a, b) => a.consumoTotal - b.consumoTotal);
  const sortedByCusto = [...computed].sort((a, b) => a.custoEnergiaPV - b.custoEnergiaPV);

  const labelsConsumo = sortedByConsumo.map((_, idx) => (idx + 1).toString());
  const labelsCusto = sortedByCusto.map((_, idx) => (idx + 1).toString());
  const tooltipFor = (item) => {
    const marca = item.eq.marca || "Equipamento";
    const potencia = item.eq.potencia_btu ? `${item.eq.potencia_btu} BTU/h` : "";
    return potencia ? `${marca} - ${potencia}` : marca;
  };
  const tooltipLabelsConsumo = sortedByConsumo.map(tooltipFor);
  const tooltipLabelsCusto = sortedByCusto.map(tooltipFor);
  const colorScaleConsumo = sortedByConsumo.map((c) => c.color);
  const colorScaleCusto = sortedByCusto.map((c) => c.color);
  const consumos = sortedByConsumo.map((c) => c.consumoTotal);
  const custosEnergia = sortedByCusto.map((c) => c.custoEnergiaPV);

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
    tooltipLabelsConsumo,
    tooltipLabelsCusto,
    consumos,
    custosEnergia,
    colorScaleConsumo,
    colorScaleCusto,
    lifeYears,
    targets: { consumoId: "sim-chart-consumo", custoId: "sim-chart-custo" },
    size: { width: chartWidth, height: chartHeight },
  });

  simChartsCard.classList.remove("hidden");
}

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

// -------------------------------------------------------------------------------------------------
// Eventos e bootstrap do comparador simultaneo
// -------------------------------------------------------------------------------------------------
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

  if (simQtyInput) {
    simQtyInput.addEventListener("change", () => {
      ensureSimEquipmentCount(simQtyInput.value);
      renderSimEquipmentCards(lastFiltered);
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });
    ensureSimEquipmentCount(simQtyInput.value);
  }

  if (simAddEquipmentBtn) {
    simAddEquipmentBtn.addEventListener("click", () => {
      simState.equipments.push({ ...defaultSimEntry(), mode: "manual" });
      if (simQtyInput) simQtyInput.value = simState.equipments.length.toString();
      renderSimEquipmentCards(lastFiltered);
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });
  }

  if (simEquipmentListEl) {
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
          break;
        case "sim-custom-tec":
          entry.customTec = target.value || "";
          break;
        case "sim-custom-classe":
          entry.customClasse = target.value || "";
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
        default:
          break;
      }
      simUpdateCharts(lastFiltered);
      simUpdateVisibility(lastFiltered);
    });
  }
}

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

export function showComparadorMultiploError(message) {
  if (simLoaderEl) simLoaderEl.classList.add("hidden");
  if (simErrorEl) {
    simErrorEl.textContent = message || "Nao foi possivel carregar a base de equipamentos.";
    simErrorEl.classList.remove("hidden");
  }
}
