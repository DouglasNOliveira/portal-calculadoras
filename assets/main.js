// Arquivo principal que inicializa as abas, renderiza os cards de módulos e inicia a lógica do comparador.
//
// Resumo: inicia abas, cards da home e logica do comparador/ciclo de vida.
import { initTabs } from "./tabs.js";
import { renderModules } from "./modules-cards.js";
import { initComparador } from "./comparador.js";

// Bootstrap: abas, cards de módulo e lógica principal do comparador/ciclo de vida
initTabs();
renderModules();
initComparador();

// Renderiza fórmulas LaTeX (KaTeX) se disponível
if (window.renderMathInElement) {
  window.renderMathInElement(document.body, {
    delimiters: [{ left: "\\(", right: "\\)", display: false }],
    throwOnError: false,
  });
}
