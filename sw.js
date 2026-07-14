# B. Tobace — Relatório fotográfico de postes

App web (PWA) para registrar fotos de postes por nota/ponto, com checagem
de prumo via sensor do celular (85°–95°) e geração de relatório em PDF.

## Como publicar (GitHub Pages, sem custo)

1. Crie um repositório novo no GitHub (pode ser privado).
2. Suba todos os arquivos desta pasta (`index.html`, `app.js`, `manifest.json`,
   `sw.js`, pasta `assets/`) para a raiz do repositório.
3. Em **Settings → Pages**, escolha a branch `main` e a pasta `/ (root)`.
4. O GitHub gera um link do tipo `https://seu-usuario.github.io/nome-do-repo/`.
5. Envie esse link pros encarregados. No celular, cada um abre o link no
   **Chrome** e usa "Adicionar à tela inicial" — depois disso o app funciona
   offline, sem precisar abrir o navegador de novo.

Qualquer atualização futura (correção de bug, ajuste de layout) é só subir
os arquivos novos no mesmo repositório — não precisa reinstalar nada nos
celulares.

## O que ainda vale testar em campo antes de liberar de vez

- **Sensor de nível (85°–95°):** a leitura usa o giroscópio do próprio
  celular (`gamma` do `DeviceOrientationEvent`, que mede a inclinação
  esquerda/direita — é essa inclinação que faz o poste parecer torto na
  foto; inclinar o celular pra frente/trás só muda a mira da câmera e não
  afeta o prumo aparente). Não é um instrumento certificado — a precisão
  varia por aparelho e pode estar levemente desalinhada de fábrica em
  alguns modelos. Vale comparar a leitura do app com o nível a laser
  físico em pelo menos alguns postes antes de confiar 100% no número
  mostrado.
- **Localização (GPS), agora obrigatória por exigência da GED:** a captura
  começa em segundo plano assim que a sessão é iniciada (`watchPosition`),
  pra já ter uma posição pronta na hora da foto, em vez de esperar o GPS
  fechar a cada captura. Se não conseguir uma posição de até 2 minutos
  atrás, a foto sai marcada como "localização indisponível" em vez de
  travar a captura — em área rural, perto de linha de alta tensão, isso
  pode acontecer ocasionalmente, e é esperado.
- **iOS pede permissão explícita** pra liberar o sensor de orientação —
  aparece um botão "Ativar sensor de nível" na tela da câmera nesse caso.
  Android geralmente libera direto, mas pode variar por fabricante.
- **Orientação do celular:** o cálculo assume o aparelho segurado na
  vertical (retrato), como numa foto normal. Se for segurado de lado ou
  muito inclinado lateralmente, a leitura perde precisão — isso não foi
  tratado nesta versão.
- **Compartilhamento direto (`btn-share-pdf`)** funciona em navegadores/SOs
  que suportam Web Share API com arquivos (Chrome Android recente). Se não
  suportar, o app cai automaticamente para baixar o PDF, e o encarregado
  compartilha manualmente pelo WhatsApp do jeito que já faz hoje.
- **Armazenamento local:** as fotos ficam guardadas no navegador
  (`localStorage`) até o PDF ser gerado. Sessões muito longas (muitos
  pontos, várias fotos cada) podem esbarrar no limite de armazenamento do
  navegador — o app avisa se isso acontecer, mas vale observar na prática
  quantos pontos cabem numa nota sem problema.

## Fluxo implementado

1. Tela inicial → digita nota (ou retoma sessão salva).
2. Câmera com guia tracejada de enquadramento + linha de nível em tempo
   real (verde fixa / vermelha conforme inclinação) + selo de ângulo.
3. Confirma ou refaz a foto.
4. Pergunta se quer mais uma foto do mesmo ponto (ângulo diferente).
5. Número do ponto (sugerido automaticamente, editável) + observação
   opcional — um campo só, cobrindo todas as fotos daquele ponto.
6. Volta pra câmera pro próximo ponto, ou finaliza a nota.
7. Revisão com miniaturas antes de gerar o PDF (permite excluir um ponto).
8. Gera o PDF (uma página por ponto, tema Tobace) e compartilha ou baixa.

Se a foto for tirada fora da faixa de 85°–95°, o aviso "fora do prumo —
XX°" fica gravado na própria imagem, e a página correspondente no PDF
recebe um selo vermelho na faixa de identificação, pra facilitar a
revisão rápida do relatório.
