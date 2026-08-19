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

## Correção importante (armazenamento)

A primeira versão usava `localStorage` para guardar as sessões, que tem
limite de ~5MB por site — suficiente para um ponto ou dois com fotos, mas
insuficiente para uma nota inteira. Depois de estourar esse limite, salvar
passava a falhar silenciosamente (o app parecia "parar de salvar" sem
mostrar nenhum erro). A partir desta versão, o armazenamento é feito via
`IndexedDB`, que aguenta ordens de grandeza a mais de espaço. Dados
salvos na versão antiga (se sobrou algum no celular de alguém) são
migrados automaticamente na primeira vez que o app abrir com essa
atualização.

## Nome da rua na foto

Além das coordenadas, o app tenta buscar o nome da rua via geocodificação
reversa (serviço gratuito Nominatim/OpenStreetMap), atualizando em segundo
plano a cada ~45 segundos enquanto a sessão está aberta. Se a busca falhar
(sem internet no momento, área não mapeada, serviço fora do ar), a foto
sai só com as coordenadas — nunca trava a captura esperando isso.

Atenção: Nominatim é gratuito mas tem política de uso limitada (pensada
para uso ocasional, não uso pesado). Para o volume de uma pequena equipe
deve ser suficiente; se o uso crescer bastante, vale migrar para um
serviço pago (Google Maps Geocoding, Mapbox) para mais garantia de
disponibilidade.

## Setor de Viabilidade (novo)

A tela inicial agora tem um seletor de setor (Medição / Viabilidade) ao
criar uma nota nova. Diferenças do setor de Viabilidade em relação ao de
Medição:

- **Sem nível 90°:** a câmera não mostra nem grava as linhas de nível ou
  o selo de ângulo — só hora e localização na foto, igual ao registro
  básico.
- **Formulário obrigatório antes do PDF:** ao finalizar a sessão (ou
  tentar gerar o PDF), se o formulário de Viabilidade ainda não foi
  preenchido, o app abre um assistente de 3 passos (Identificação →
  Checklist técnico → Observações gerais) — cada passo bloqueia avançar
  sem preencher os campos obrigatórios. Só depois de concluído é que
  segue pra revisão/geração do PDF.
- **Formulário editável depois:** na tela de revisão, sessões de
  Viabilidade têm um botão "Editar formulário de Viabilidade" pra
  corrigir algo depois de já ter preenchido.
- **PDF com página(s) extra:** o relatório de Viabilidade inclui, antes
  das fotos dos pontos, as páginas com os dados do formulário
  (identificação, as 23 perguntas do checklist técnico com os detalhes
  preenchidos, e as observações gerais).

O checklist técnico e a lógica de qual resposta (Sim/Não) exige detalhe
obrigatório foram definidos a partir do documento "CHECKLIST
VIABILIDADE" fornecido pela empresa — vale conferir com quem preenche
esse formulário no papel se a lista bate com o que é usado hoje, já que
foi feita uma consolidação entre duas versões diferentes do documento.

## Backup semanal (terça a terça)

Toda vez que o app é aberto, ele confere se já passou uma terça-feira
desde o último backup confirmado. Se sim, mostra uma tela bloqueante
(cobrindo o app inteiro, sem botão de fechar) exigindo gerar e
compartilhar um arquivo de backup antes de continuar.

O arquivo é um `.json` com todos os dados salvos localmente (todas as
sessões, pontos, fotos em base64), nomeado `backup_tobace_DD-MM-AAAA.json`.
Ao gerar, o app tenta abrir o compartilhamento nativo (mesmo mecanismo já
usado pros PDFs); se não tiver suporte, baixa o arquivo pra enviar
manualmente. Depois de compartilhar (ou baixar), aparece um botão "Já
enviei no grupo" que precisa ser tocado manualmente para liberar o app —
essa confirmação é deliberada, não é só detectar que o compartilhamento
abriu, já que isso sozinho não garante que o arquivo realmente chegou ao
grupo.

Limitação técnica honesta: como esse arquivo é baseado no que já está
salvo no celular, ele só serve como cópia de segurança dos dados daquele
aparelho específico — não existe verificação nenhuma do lado do
escritório confirmando que o backup foi realmente recebido, só que o
encarregado confirmou o envio pelo próprio celular.

## Cadastro de usuário (GD / Cesto)

Na primeira vez que o app abre, pede nome + tipo de equipe (GD ou Cesto),
salvo permanentemente no celular. O nível 90° do setor CCM/B2 só aparece
pra quem estiver cadastrado como GD — equipe de Cesto não vê nível em
nenhum setor, e Viabilidade continua sem nível pra ninguém.

**Isso não é segurança de verdade, é fricção deliberada.** Editar o
cadastro diretamente exige um PIN (tocar 5x seguidas em "Cadastrado
como..." revela o campo). Sem o PIN, a única opção é "Solicitar
alteração", que manda um pedido por WhatsApp pro responsável decidir —
não muda nada sozinho. Como é tudo local, sem servidor, alguém com
conhecimento técnico ainda consegue burlar limpando os dados do site e
recadastrando do zero — essa trava serve pra evitar troca por engano ou
malandragem casual, não pra impedir alguém realmente decidido.

O PIN está configurado no próprio código-fonte (`ADMIN_PIN` em
`app.js`), o que significa que tecnicamente é visível pra quem souber
inspecionar o código do app — outra razão pra não tratar isso como
segurança robusta.

## Ponto (P...) e Vão (V...)

Cada registro de uma nota agora pode ser um **Ponto** (poste, rótulo
`P05`) ou um **Vão** (trecho entre dois pontos, rótulo `V1-2`). A escolha
acontece na própria tela da câmera, antes de tirar a foto — isso é
necessário porque o nível 90° só se aplica a Ponto (Vão nunca mostra
nível, mesmo pra GD em CCM/B2). Como o vão às vezes não é entre pontos
consecutivos (ex: V1-6), os campos "de" e "até" são livres, só vêm
pré-sugeridos com base no último ponto numerado.

Um detalhe técnico que vale saber: se o encarregado trocar o alternador
Ponto/Vão *no meio* de tirar duas fotos do mesmo item (ex: 1ª foto como
Ponto, troca pra Vão antes da 2ª foto), cada foto grava o nível conforme
o que estava selecionado *naquele momento* — o app não impede essa
inconsistência no meio do caminho, então vale orientar a equipe a
escolher o tipo antes de começar a tirar as fotos daquele item específico
e não mudar até salvar.

## Qualidade da foto em situações de luz difícil (ex: emergência à noite)

Uma luz forte perto da câmera (lanterna, farol, poste de iluminação) pode
"estourar" a imagem — uma vez que o pixel vira branco puro, não tem
processamento que recupere aquele detalhe depois. Pra ajudar nisso:

- **Toque na tela** durante o enquadramento foca/expõe naquele ponto
  específico, igual o app de câmera nativo — tocar na área do poste (não
  na luz) evita que a luz "queime" o resto da imagem.
- **Ajuste de exposição** (mais escuro ↔ mais claro) aparece automaticamente
  abaixo do botão de captura, mas só em aparelhos que expõem esse
  controle pro navegador — é decisão do fabricante, não dá pra forçar em
  todos.
- Resolução e qualidade da foto foram aumentadas (era 1100px/68% de
  qualidade, agora 1400px/80%) pra fotos mais nítidas no geral, já que o
  armazenamento local (IndexedDB) aguenta bem mais espaço que o
  localStorage usado antes.

Nenhuma dessas medidas substitui a técnica de campo: apontar a câmera de
um ângulo que não pegue a luz direto no quadro continua sendo o jeito
mais eficaz de evitar o estouro, quando for possível.

## Correção de qualidade da foto (ImageCapture)

Até esta versão, a foto era tirada capturando um quadro do **vídeo ao
vivo** da câmera (o preview que aparece na tela) — que roda em resolução
bem mais baixa que a foto real que o sensor do celular consegue captar,
já que vídeo ao vivo prioriza fluidez, não nitidez de um único quadro.
Isso deixava as fotos visivelmente inferiores a um app de câmera nativo.

Agora o app tenta usar a **API `ImageCapture`**, que acessa a foto de
alta resolução de verdade da câmera (a mesma pipeline que o app de
câmera nativo usa), em vez de congelar o vídeo. Funciona na maioria dos
Android com Chrome atualizado. Onde não tiver suporte (navegadores mais
antigos, e possivelmente Safari/iOS), o app detecta automaticamente e
volta pro método antigo (captura do vídeo) — sem quebrar a captura, só
sem o ganho de qualidade.

Efeitos colaterais esperados dessa mudança, worth avisar a equipe:
- **Pode haver uma pequena pausa** (meio segundo, às vezes um pouco mais)
  entre tocar em "Capturar foto" e a imagem aparecer — é o tempo da
  câmera processar a foto de alta resolução, diferente do congelamento
  instantâneo de antes.
- **Fotos ficam maiores** (aumentei a resolução de saída de 1400px para
  1800px de largura, já que agora a fonte é nitidamente melhor) — isso
  aumenta um pouco o espaço usado no celular por sessão, mas o IndexedDB
  aguenta bem essa margem.

Vale testar em campo e comparar a nitidez com o app antigo antes de
considerar isso definitivamente resolvido — cada fabricante de celular
implementa `ImageCapture` de um jeito ligeiramente diferente.

## Correção da vinheta escura nas bordas

Em alguns aparelhos, a foto de alta resolução (via `ImageCapture`) veio
com uma vinheta escura arredondada nos cantos — sinal de que o celular
capturou usando a lente ultra-angular em vez da lente principal (a
mesma que aparece no vídeo ao vivo). Isso é uma particularidade de
hardware/driver de câmera que não dá pra controlar diretamente pela web.

Correção aplicada: a foto de alta resolução agora é cortada em 10% de
cada borda antes de salvar, removendo a região onde a vinheta aparece.
Isso reduz um pouco o campo de visão capturado, mas garante que a área
usada seja sempre nítida e sem vinheta. Vale conferir em mais de um
aparelho se esse corte é suficiente, ou se em algum modelo específico o
problema é mais ou menos intenso que o testado.

## Tentativas adicionais de melhorar a qualidade da foto

- **Resolução máxima explícita:** ao tirar a foto de alta resolução, o
  app agora consulta `getPhotoCapabilities()` e pede explicitamente a
  maior largura/altura que o sensor suporta, em vez de deixar o
  navegador escolher uma resolução padrão sozinho.
- **Tentativa de fugir da lente ultra-angular:** ao abrir a câmera, o
  app tenta aplicar um leve zoom (mirando no valor 2x, mais comumente
  relatado como o que costuma empurrar o aparelho a trocar da lente
  ultra-angular pra principal). **Isso não é garantido** — não existe,
  até hoje, uma forma padronizada e confiável de escolher qual lente
  física a câmera usa pela web (é uma limitação conhecida e ainda em
  aberto nas discussões oficiais do padrão). Em aparelhos que não
  suportam zoom, ou que já usam a lente principal, essa tentativa
  simplesmente não faz efeito nenhum — não quebra a captura.

O corte de 10% nas bordas (pra remover vinheta) continua ativo como
correção principal, já que é a única solução 100% garantida nesse
cenário — as duas mudanças acima são reforços, não substitutas.

## Controle de zoom manual

Um controle deslizante de zoom apareceu na tela da câmera (acima do
ajuste de exposição), em aparelhos que suportam essa função pelo
navegador. O valor inicial já reflete o que a tentativa automática de
fugir da lente ultra-angular deixou configurado — o encarregado pode
ajustar livremente a partir dali. Igual aos outros controles opcionais,
some sozinho em aparelhos que não expõem essa função pro navegador, sem
quebrar a captura.

## Zoom: botões 1x/2x/3x em vez de slider automático

A tentativa automática de zoom pra fugir da lente ultra-angular foi
**removida** — ela deixava a câmera abrindo já zoomada, sem o
encarregado entender por quê. Agora o zoom começa sempre neutro (1x) e
é 100% manual: três botões (1x, 2x, 3x) parecidos com os de app de
câmera nativo, onde o encarregado escolhe. O corte de 10% nas bordas
continua sendo a defesa principal contra a vinheta da lente
ultra-angular — os botões de zoom agora são só uma opção de
enquadramento, não uma tentativa automática de correção.

## Lista fechada de encarregados no cadastro

O campo "nome" do cadastro (inicial e na edição por PIN) virou um menu
de seleção com os 13 encarregados cadastrados, em vez de texto livre —
evita erro de digitação e variação de nome entre pessoas diferentes (o
que também ajuda a ferramenta de leitura de PDF a consolidar certo).
Tem uma opção "Outro (digitar nome)" que libera um campo de texto, pra
não travar o cadastro de alguém que ainda não está na lista.

Pra adicionar, remover ou corrigir um nome na lista, é só editar o array
`LISTA_ENCARREGADOS` no topo do `app.js`.

## Correção: perda de dados ao trocar de aba/janela

Causa provável identificada: se o app ficar aberto em **mais de uma
aba/instância ao mesmo tempo** (ex: o ícone instalado na tela inicial E
uma aba do navegador pro mesmo link, ou o Android abrindo uma cópia nova
em vez de voltar pra que já estava aberta), cada instância carrega os
dados pra memória no momento que abre. Se uma instância ficar com dado
desatualizado e salvar algo depois, ela sobrescreve o banco de dados
inteiro com a versão velha — apagando o que a outra instância tinha
salvo nesse meio tempo, mesmo coisas de antes que já pareciam
gravadas.

Duas correções:
- **`manifest.json`** ganhou `launch_handler` pedindo pro Android
  reaproveitar a mesma janela do app ao tocar no ícone, em vez de abrir
  uma instância nova. Suporte a isso ainda está evoluindo entre
  fabricantes — não é garantido em 100% dos aparelhos.
- **`app.js`** agora recarrega a lista de sessões do banco de dados toda
  vez que a aba volta a ficar visível (troca de app e volta, ou destrava
  a tela), antes de continuar. Isso reduz bastante a chance de uma
  gravação usar dado desatualizado.

**Ainda assim, o hábito de uso mais seguro é: usar só o ícone instalado
na tela inicial, nunca abrir o link também numa aba separada do
navegador ao mesmo tempo.** Se desconfiar que abriu em duplicidade, feche
todas as abas/instâncias do app e abra de novo só pelo ícone.

## Correção: dados sumindo ao fechar o app (não só ao trocar de aba)

Causa provável real: sem pedir explicitamente, o navegador trata o
armazenamento local (IndexedDB) desse app como "descartável" — o
sistema pode limpar ele sozinho quando precisa liberar espaço ou
memória, sem avisar, mesmo sem o usuário fazer nada de errado. Isso
explica perder tudo (não só a nota em andamento) ao fechar o app.

Adicionado: o app agora pede ao navegador `navigator.storage.persist()`
assim que abre, pedindo pra tratar os dados como permanentes em vez de
descartáveis. **Isso não é garantido em 100% dos aparelhos** — depende
de como cada fabricante/navegador decide conceder isso — mas reduz
bastante o risco.

Por isso o backup semanal (toda terça-feira) continua sendo importante
como rede de segurança, mesmo depois dessa correção — nenhuma proteção
de armazenamento local é 100% à prova de falha.

## Correção real: falso "vazio" travando por cima dos dados salvos

Achada a causa mais provável de verdade: o mecanismo de tempo-limite
(6 segundos) que eu tinha colocado numa correção anterior — pensado pra
detectar travamento silencioso do banco de dados em iPhone — podia
disparar por engano em inicializações mais lentas do banco logo depois
do app ser reaberto do zero em Android. Quando isso acontecia, o app
tratava a leitura como "falhou" e seguia como se não tivesse nada
salvo. Se a pessoa criasse uma nota nova nesse estado, a gravação
seguinte **sobrescrevia o banco inteiro só com a nota nova**, apagando
de verdade tudo que existia antes.

Duas correções:
- Tempo-limite aumentado de 6 para 20 segundos, reduzindo bastante a
  chance de falso alarme.
- **Mais importante:** se mesmo assim a leitura falhar (mesmo depois de
  tentar duas vezes), o app agora **nunca mais finge que está vazio**.
  Em vez disso, mostra um aviso vermelho bloqueando a criação de nota
  nova, com um botão "Tentar de novo" — só volta ao normal depois de
  confirmar de verdade que conseguiu ler os dados salvos.

Combinado com o pedido de armazenamento persistente (correção anterior),
isso ataca o problema por dois lados: reduz a chance dos dados serem
apagados pelo sistema, e impede que uma falha de leitura vire uma
sobrescrita destrutiva.
