# Front-end: Portal de Calculadoras de Custo-Benefício

Este repositório contém um projeto piloto e experimental desenvolvido para a aplicação de conceitos do curso de **Pós-Graduação em Ciência de Dados**. O objetivo principal é servir como interface para o Portal de Calculadoras de Custo-Benefício e Vida Útil de bens de consumo.

## ⚖️ Direitos Autorais e Licença

**Todos os direitos reservados (All Rights Reserved).**

Este projeto é de caráter estritamente acadêmico e pessoal. Como o repositório **não possui uma licença de código aberto**:
- É terminantemente **proibida** a cópia, clonagem, redistribuição ou uso (parcial ou total) deste código para fins comerciais ou privados sem autorização prévia.
- O código está disponível publicamente apenas para fins de **portfólio e visualização**, conforme os [Termos de Serviço do GitHub](https://docs.github.com/pt/site-policy/github-terms/github-terms-of-service).

© 2026 [DouglasNOliveira]

---
# Visão geral do projeto
O produto é um front-end estático (HTML/CSS/JS). Ele carrega uma base INMETRO de equipamentos tratada para .json, permite filtrar/selecionar itens, calcula consumo/custos, gera gráficos e exporta relatórios (.xlsx e .pdf). No momento não há backend; tudo roda no navegador.

---
# Arquivos e funções essenciais
- index.html: estrutura da página, seções/abas, placeholders e inclusão dos assets e libs via CDN (Charts.js, xlsx, jsPDF);
- assets/style.css: define o visual completo (layout, cores, grids, cards, formulários, tabelas, gráficos e responsividade);
- assets/main.js: ponto de entrada; inicializa as abas, cards de módulos e toda a lógica do comparador/ciclo de vida;
- tabs.js: controla navegação entre abas e dropdows (ativa/desativa seções);
- modules-cards.js: lista de módulos (ativos e "em breve") e renderiza os cards da home, com links para as abas corretas.
- comparador.js: coração do sistema; carrega o JSON de equipamentos, aplica filtros, renderiza UI de seleção, calcula consumo/custos, atualiza gráficos, monta fluxo de caixa e payback, e dispara exportações;
- comparador-multiplo.js: disponibiliza os mesmos filtros do comparador, sem a seleção nominal de equipamentos. Então é feita a comparação múltipla entre todos os equipamentos filtrados;
- energy.js: cálculos de consumo anual ajustado, custos energéticos e valores presentes;
- lifecycle.js: modelo de ciclo de vida (Weibull/AFT) com penalizações por uso/manutenção/ambiente e geração de curvas;
- charts.js: configurações e plugins; cria gráficos do comparador e do ciclo de vida.
- export-excel.js: monta e baixa uma planilha em .xlsx com resumo, fluxos de caixa e (se houver) ciclo de vida;
- export-pdf.js: gera PDF com tabelas e gráficos com a data e hora de uso da calculadora; tenta carregar fonte Manrope local e faz fallback remoto;
- conversao_dados.ipynb: notebook que trata e converte os dados da planilha do INMETRO em um arquivo .json;

- launch.json: configuração de debug/launch para servir o site localmente em testes.

