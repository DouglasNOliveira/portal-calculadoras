// Arquivo responsável por exportar os dados do comparador e análise de ciclo de vida para Excel.
//
// Resumo: monta workbook XLSX com resumo do comparador, fluxos de caixa e (se houver) resultados de ciclo de vida.
import { tecnologiaNormalizada } from "./lifecycle.js";

function buildWorkbook(ds, lc) {
  if (!ds?.computed?.length || !window.XLSX) return null;
  const wb = XLSX.utils.book_new();

  const resumo = ds.computed.map((c) => ({
    Marca: c.eq.marca,
    Tecnologia: c.eq.tecnologia || tecnologiaNormalizada(c.eq),
    IDRS: c.eq.idrs ?? 0,
    ConsumoTotal_kWh: c.consumoTotal,
    CustoEnergia_Total: c.custoEnergiaTotal,
    COA_Total: c.coaTotal,
    Total_Vida: c.totalVida,
    CT: c.totalVidaPV,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "CB_Resumo");

  const mapCashflowRow = (r, includePayback = false) => ({
    Ano: r.ano,
    CO: r.capex,
    VR: r.valorResidual,
    CD: r.descarte,
    "COA-Manutencao": r.manutencao,
    "COA-Energia": r.energia,
    COA: r.vpCoa ?? 0,
    CT: r.vpTotal ?? r.vpCoa,
    ...(includePayback ? { Payback: r.payback ?? 0 } : {}),
  });

  if (ds.cashflow) {
    // Mantem as abas separadas para facilitar auditoria financeira por equipamento.
    const wsCF1 = XLSX.utils.json_to_sheet((ds.cashflow.rows1 || []).map((r) => mapCashflowRow(r, false)));
    const wsCF2 = XLSX.utils.json_to_sheet((ds.cashflow.rows2 || []).map((r) => mapCashflowRow(r, false)));
    const wsCFD = XLSX.utils.json_to_sheet((ds.cashflow.rowsDiff || []).map((r) => mapCashflowRow(r, true)));
    XLSX.utils.book_append_sheet(wb, wsCF1, "CB_Fluxo_Equip1");
    XLSX.utils.book_append_sheet(wb, wsCF2, "CB_Fluxo_Equip2");
    XLSX.utils.book_append_sheet(wb, wsCFD, "CB_Fluxo_Diferenca");
  }

  if (lc?.resultados?.length) {
    const resumoLC = lc.resultados.map((r) => ({
      Equipamento: r.rotulo,
      MTTF_anos: r.mttf,
      Vida_caracteristica_eta: r.eta_aj,
      Fator_aceleracao: r.AF,
      Tecnologia: r.params?.tecnologia,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoLC), "LC_Resumo");
  }

  return wb;
}

function triggerWorkbookDownload(wb, filename) {
  if (!wb || !window.XLSX) return;
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(ds, lc) {
  const wb = buildWorkbook(ds, lc);
  if (!wb || !window.XLSX) return;
  triggerWorkbookDownload(wb, "comparador-custo-beneficio.xlsx");
}

export function downloadSingleEquipmentExcel(payload) {
  if (!payload?.equipment || !window.XLSX) return false;
  const { equipment, usage, cashflowRows } = payload;
  const wb = XLSX.utils.book_new();
  const rows = Array.isArray(cashflowRows) ? cashflowRows : [];
  const sumField = (field) =>
    rows.reduce((acc, r) => acc + (Number.isFinite(r?.[field]) ? Number(r[field]) : 0), 0);
  // Prioriza os totais do fluxo exportado para garantir consistencia com a tabela do front-end.
  const coaVpTotal = rows.length ? sumField("vpCoa") : equipment.coaPV ?? 0;
  const ctTotal = rows.length ? sumField("vpTotal") : equipment.totalVidaPV ?? 0;

  const resumo = [
    {
      Equipamento: equipment.eq?.marca || "Equipamento",
      Tecnologia: equipment.eq?.tecnologia || tecnologiaNormalizada(equipment.eq),
      IDRS: equipment.eq?.idrs ?? 0,
      Potencia_BTU_h: equipment.eq?.potencia_btu || 0,
      Classe: equipment.eq?.classe || "",
      Consumo_Anual_kWh: equipment.consumoAnual ?? 0,
      Custo_Energia_Anual: equipment.custoEnergiaAnual ?? 0,
      Custo_Aquisicao: equipment.custoAq ?? 0,
      Custo_Instalacao: equipment.custoInst ?? 0,
      Manutencao_Anual: equipment.manut ?? 0,
      Descarte: equipment.descarte ?? 0,
      Vida_Util_Anos: equipment.anosVida ?? 0,
      COA_VP: coaVpTotal,
      CT: ctTotal,
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");

  const parametros = [
    {
      Horas_Uso_Dia: usage?.horasUso ?? 0,
      Dias_Uso_Ano: usage?.diasAno ?? 0,
      Tarifa_kWh: usage?.tarifaKwh ?? 0,
      Taxa_Real: usage?.taxaReal ?? 0,
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parametros), "Parametros");

  if (rows.length) {
    // Exporta exatamente as colunas usadas na leitura operacional do fluxo (sem COA nominal).
    const fluxo = rows.map((r) => ({
      Ano: r.ano,
      CO: r.capex,
      VR: r.valorResidual,
      CD: r.descarte,
      Manutencao: r.manutencao,
      Energia: r.energia,
      COA_VP: r.vpCoa ?? 0,
      CT: r.vpTotal ?? 0,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fluxo), "Fluxo_Caixa");
  }

  const rawName = equipment.eq?.marca || "equipamento";
  const safeName = String(rawName).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
  triggerWorkbookDownload(wb, `comparacao-lote-${safeName}.xlsx`);
  return true;
}
