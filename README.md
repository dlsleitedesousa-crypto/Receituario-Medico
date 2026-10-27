# Flow Receita — Receituário Médico

Arquivos recuperados de https://receita.drdanielleite.com.br/ e da conexão autorizada com a Hostinger em 16/09/2026.

## Arquivos recuperados

- `index.html`: página principal, com estilos CSS e JavaScript incorporados.
- `print-summary.js`: recursos de impressão.
- `backend.js`: integração da página com a API PHP/MySQL da Hostinger.
- `api/index.php`: API PHP original, com credenciais substituídas por configuração privada.
- `api/config.example.php`: exemplo de configuração do banco.
- `LEIA-ME-HOSTINGER.txt`: instruções originais da hospedagem.
- `api/download` e `download (1)`: arquivos existentes no servidor, preservados com seus nomes originais.

A página pública referencia apenas esses dois arquivos JavaScript externos. As imagens dos locais de atendimento são carregadas durante o uso da aplicação.

## Configuração do banco

Copie `api/config.example.php` para `api/config.local.php` e preencha as credenciais no ambiente de instalação. Esse arquivo privado está no `.gitignore`. Como alternativa, configure `DB_HOST`, `DB_NAME`, `DB_USER` e `DB_PASS` nas variáveis de ambiente do PHP. A configuração da hospedagem existente não foi alterada.

## Limites da recuperação

Todos os sete arquivos que a conexão da Hostinger permitiu ler foram recuperados. O oitavo arquivo listado, `database.sql`, teve sua leitura bloqueada pela Hostinger por conteúdo sensível e não foi incluído. Não houve exportação dos dados do MySQL; este repositório não é um backup do banco.

As instruções originais mencionam dois arquivos `.htaccess`, mas eles não foram listados e não puderam ser recuperados nesses caminhos. Em 25/10/2026 o `.htaccess` da raiz passou a ser versionado, com `DirectoryIndex index.html index.php` e `Cache-Control: no-cache` para as páginas HTML, evitando que o navegador use uma versão antiga após cada publicação. Os arquivos `api/download` e `download (1)` contêm regras de Apache; seus nomes não foram alterados durante a cópia.

Configurações privadas e backups com dados pessoais não devem ser publicados no GitHub. A sintaxe JavaScript foi verificada; PHP e MySQL precisam de validação em um ambiente com esses serviços.

## Histórico no GitHub

Cada alteração de código deve ser verificada, registrada em um commit e enviada ao repositório `dlsleitedesousa-crypto/Receituario-Medico` antes da publicação no site. A orientação para os agentes está em `AGENTS.md`.

Em 16/09/2026, a publicação automática foi ativada na Hostinger para o repositório `dlsleitedesousa-crypto/Receituario-Medico`, branch `main`, na raiz do site. A branch foi publicada no GitHub e `api/config.local.php` foi preparado no servidor. A primeira publicação preservou essa configuração privada e a API confirmou a conexão com o MySQL. Novos pushes para `main` publicam automaticamente o site; alterações apenas salvas no editor ainda precisam de commit e push.

A publicação automática envia alterações do GitHub para a Hostinger; edições feitas diretamente no servidor não voltam automaticamente ao GitHub. Faça as alterações pelo repositório para manter o histórico. Dados do banco e credenciais ficam fora desse histórico.

## Visualização local

Na pasta do projeto, execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra http://127.0.0.1:8000/. Em `localhost` e `127.0.0.1`, o próprio JavaScript original desativa a integração com a API e usa o comportamento local da página. Essa visualização não valida os recursos PHP/MySQL de produção.

Uma instalação em outro domínio precisa de PHP 8.1 ou superior, PDO MySQL, mbstring e um banco MySQL configurado. A API contém a criação das tabelas necessárias.

## Recuperação de senha

A opção “Esqueceu sua senha?” envia um link para criar uma nova senha; a senha original é um hash e não pode ser recuperada. O link expira em 30 minutos, é de uso único e deixa de funcionar se o e-mail ou a senha da conta forem alterados. Há limites de solicitação por e-mail e IP.

Configure o remetente `suporte@receitaflow.drdanielleite.com.br` no servidor copiando `api/mail.example.php` para `api/mail.local.php`. Preencha a senha da caixa apenas no arquivo privado, ou use `SMTP_PASSWORD` no ambiente do PHP. O transporte utiliza `smtp.hostinger.com:465` com TLS e PHPMailer 7.1.1, incluído com sua licença. Preserve `api/mail.local.php` e `api/config.local.php` em todas as publicações. IMAP e POP3 não são usados para enviar mensagens.

A prévia local não envia e-mails nem redefine contas do servidor. Para verificar a recuperação, use o site publicado. Os testes de fluxo podem ser executados com `php tests/password-reset.php`; eles usam SQLite e um envio simulado, sem mensagens reais.

## Medicamentos

A aba “Medicamentos”, no topo do receituário, permite cadastrar nome, princípio ativo opcional, quantidade, posologia e tipo de receita. A busca considera nome e princípio ativo; a seleção de vários itens é mantida ao filtrar. A inserção acrescenta os medicamentos ao texto existente, com `Nome-----------Quantidade` na primeira linha e a posologia a partir da segunda linha. Se houver um item especial, todos entram na receita especial; acrescentar um item simples a uma receita especial mantém seu tipo.

No site publicado, os cadastros são salvos na tabela `medicines`, vinculados ao usuário autenticado. Eles podem ser editados e excluídos na biblioteca. Na prévia local, ficam apenas na memória da página. Cadastros de medicamentos são dados dos usuários e não são versionados no GitHub. Execute `php tests/medicines.php` para validar cadastro, edição, exclusão e isolamento entre contas.

## Impressão em PDF

O botão “Imprimir ou salvar PDF” gera um PDF A4 no próprio navegador e abre o arquivo em uma nova aba. No iPhone e iPad, use Compartilhar → Imprimir no visualizador de PDF. Cada folha da prévia corresponde a uma página do arquivo; a receita especial mantém as duas vias. A geração usa imagens em resolução dupla e preserva o conteúdo visual, mas o texto do PDF não é selecionável.

Publique também `print-pdf.js` e a pasta `vendor/`. As bibliotecas html2canvas 1.4.1 e jsPDF 4.2.1 ficam no próprio site, com suas licenças; são carregadas apenas ao gerar o PDF. O documento é processado localmente, sem envio dos dados do paciente a um serviço de PDF.

## APAC

No receituário, **APAC** abre os campos de procedimento, código SIGTAP automático, quantidade, CID-10, diagnóstico e observações. **Gerar PDF da APAC** preenche diretamente o modelo `assets/apac-modelo.pdf` fornecido pelo usuário, mantendo a página e o desenho originais. Nome e data de nascimento do paciente, CNES do estabelecimento, procedimento, CID, diagnóstico, observações e dados disponíveis do profissional são inseridos nos campos correspondentes; o nome do estabelecimento e os campos de autorização ficam em branco. O arquivo abre em outra aba para impressão ou salvamento. Publique também `apac.js`, `apac-template-pdf.js`, `apac.css`, o modelo PDF e `vendor/pdf-lib-1.17.1.min.js`.

O cadastro e **Meu perfil** pedem o CPF do médico e o validam antes de salvar. A API adiciona automaticamente a coluna `users.cpf` ao banco existente, deixando-a vazia para contas antigas; o profissional deve preenchê-la no perfil antes de gerar uma APAC. No PDF, o campo 43 marca a opção CPF e o campo 44 recebe os 11 dígitos, um por lacuna. O CPF é armazenado somente no MySQL, não no repositório.

O catálogo local `apac-catalog.json` foi gerado da [Tabela Unificada SIGTAP do DATASUS](https://sigtap.datasus.gov.br/tabela-unificada/app/download.jsp), competência **09/2026**. Inclui os 873 procedimentos com instrumento de registro **06 — APAC (procedimento principal)** e os 14.246 códigos CID-10 da mesma competência. A busca aceita nome ou código; a escolha do procedimento preenche seu código SIGTAP, e a escolha de CID preenche o código e sugere a descrição no diagnóstico quando ele estiver vazio. O catálogo é uma referência de registro; a autorização e as regras clínicas devem ser conferidas no SIGTAP da competência vigente.

Para atualizar o catálogo, baixe o ZIP da competência no SIGTAP e execute `node tools/build-apac-catalog.mjs caminho/para/TabelaUnificada_YYYYMM.zip`. Versione o JSON gerado, sem incluir o ZIP bruto, e publique também `apac-catalog.json`.

O layout segue os campos do [Anexo I da Portaria SAS/MS nº 768/2006](https://bvsms.saude.gov.br/bvs/saudelegis/gm/2006/anexo/anexo_prt0768_26_10_2006.pdf). O PDF gerado é uma solicitação; número e validade da autorização dependem do órgão autorizador.

## AIH

O botão **AIH** abre um formulário apenas com procedimento principal e código SIGTAP, CID-10 principal, diagnóstico inicial, sinais e sintomas, condições que justificam a internação e principais resultados diagnósticos. Procedimento e CID têm busca por nome ou código nos catálogos SIGTAP do SUS da competência 09/2026; a escolha do procedimento preenche seu código e a escolha do CID preenche o diagnóstico com a descrição oficial. O diagnóstico pode ser resumido para caber na lacuna do PDF. Os códigos são validados antes de salvar ou gerar o documento. O PDF usa o formulário original em `assets/aih-modelo.pdf` e preenche também os dados já disponíveis do paciente, local e profissional. CNES, código do procedimento, datas e CPF são inseridos dígito por dígito nas lacunas originais. Os outros campos do formulário original ficam em branco. **Salvar modelo** fica ao lado de **Gerar PDF da AIH**; os modelos são pesquisáveis e ordenados por nome, e guardam apenas os campos clínicos reutilizáveis, sem dados pessoais do paciente. O catálogo de procedimentos é gerado com `node tools/build-aih-catalog.mjs sigtap-202609.zip` e o de CID-10 é compartilhado com a APAC.

## Histórico de atendimentos

**Salvar atendimento** grava o documento atual e confirma que ele aparece no histórico do paciente. Abrir o PDF de receitas simples ou especiais, atestados, laudos, solicitações de exames ou fisioterapia e documentos personalizados também registra o documento no histórico; voltar da prévia não apaga o texto. Ao gerar o PDF de APAC ou AIH, a solicitação também é registrada. Repetir a impressão do mesmo documento nos cinco minutos seguintes não duplica o registro. Para vincular qualquer atendimento ao paciente, informe nome completo, CPF com 11 dígitos e data de nascimento válida; o resumo temporário de impressões não substitui esse registro no banco.

## Modelos de orçamento

O botão **Modelos de Orçamento** no receituário abre a biblioteca com busca, cadastro, edição e exclusão. Cada modelo contém nome e texto livre para serviços, valores, condições de pagamento e validade. **Usar no receituário** seleciona o tipo **Orçamento** e preenche o documento, que pode ser editado, impresso em PDF e salvo no histórico do paciente. Na produção, os modelos ficam no MySQL vinculados à conta do profissional; no modo local, ficam no navegador. Execute `node --test tests/budget-models.mjs` para verificar os fluxos locais e a integração simulada com a API.

## História clínica

A seção **História clínica**, após o receituário, fica fora da folha de impressão e do PDF. **Salvar atendimento** grava o texto na data do receituário, inclusive sem documento preenchido. A geração de documentos também salva a história preenchida. No histórico, ela aparece antes dos documentos do dia e não entra na contagem de documentos. Há um registro por paciente, profissional e data; um novo texto substitui o anterior desse dia, e um campo vazio preserva o registro salvo. A gravação ocorre na mesma transação do atendimento, sem migração de tabelas. O campo é limpo ao mudar os dados do paciente ou sair da conta. Execute `node --test tests/clinical-history.mjs` para verificar o fluxo com API simulada, a ordem e a exclusão da impressão.

## Dados profissionais e imagem da assinatura

O cadastro e Meu perfil permitem informar telefone, título de especialista e imagem da assinatura (PNG/JPG, até 2 MB e 4096 pixels por lado). O título aparece abaixo do CRM/RQE na identificação dos documentos do receituário. O telefone fica salvo no cadastro profissional.

A chave “Usar imagem da assinatura”, na aba Receituário, inclui a imagem na identificação do profissional e nas prévias/impressões, inclusive nas duas vias da receita especial. Ela começa desligada e só fica disponível com uma imagem cadastrada. A imagem pode ser substituída ou removida em Meu perfil; cancelar a edição preserva a imagem salva. Trata-se da inserção da imagem da assinatura, sem certificação digital.

A API acrescenta automaticamente as colunas `phone`, `specialistTitle` e `signature` à tabela `users`; imagens e dados dos profissionais permanecem no banco, fora do GitHub. Verifique o fluxo local com `node --test tests/profile-signature.mjs`. A conexão e a migração MySQL devem ser verificadas no ambiente PHP/MySQL da hospedagem.

## Assinatura digital ICP-Brasil (BRy)

Na prévia de receitas simples e especiais, atestados, laudos e solicitações de exames ou fisioterapia, **Assinar digitalmente** abre a escolha de onde está o certificado do médico e gera o PDF com uma faixa de 30 mm no pé das folhas.

As opções são os PSCs em nuvem disponíveis no Integra BRy (BirdID, VIDaaS, SafeID, RemoteID, SyngularID, SerproID e DS Cloud), filtrados pelos que têm certificado no CPF do médico quando a BRy informa, e o BRy KMS com PIN. Para um PSC, o sistema pede à BRy um link de autorização (`POST /psc/link`, `scope: signature_session`, 8 horas) e o abre em nova aba. Lá o médico entra no BirdID, VIDaaS etc. e aprova no aplicativo, se o provedor pedir. O provedor devolve o navegador ao Integra BRy, que o redireciona a `/psc/retorno?state=…`; não há webhook. Esse endereço confere o `state` de uso único e libera a conexão. O modal, que consulta o status, segue então para a assinatura com `kms_type: PSC`. Durante a validade da conexão, as próximas assinaturas não pedem nova autorização. Se a BRy recusar o token (401/403), a conexão é apagada e o modal pede para conectar de novo. O token do PSC fica no banco (`signature_psc_sessions`) cifrado com AES-256-GCM, com chave derivada do `client_secret`; trocar a chave da BRy exige reconectar. Na última página, o sistema desenha o QR Code de validação e o código impresso (`XXXX-XXXX`) **antes** da assinatura, porque qualquer alteração posterior invalidaria o PAdES. O servidor envia o PDF à API HUB Signer da BRy (`POST /fw/v1/pdf/kms/lote/assinaturas`), com o perfil `TIMESTAMP`, ou seja, PAdES com carimbo do tempo. A BRy desenha o carimbo do profissional (imagem da assinatura do perfil, nome e CPF do certificado) no canto inferior direito da última página. O PDF assinado abre em outra aba, e o documento é registrado no histórico do paciente.

A assinatura é síncrona: a resposta da BRy já traz o arquivo assinado, sem webhook. O PIN não é gravado nem registrado em log. O token JWT da aplicação fica em cache até expirar e é renovado uma vez se a BRy responder 401.

O QR aponta para `https://receita.drdanielleite.com.br/v/{id}`, regra de `.htaccess` que leva a `api/index.php?action=validar`. O [validar.iti.gov.br](https://validar.iti.gov.br/) acrescenta `format` e `secretCode`; com o código correto, recebe `{"url": …}` e baixa o PDF assinado. Quem lê o QR pela câmera vê uma página que pede o código. Sem o código não há acesso ao arquivo, a página pública não mostra dados do paciente e há limite de 20 tentativas erradas por IP e hora.

Configuração no servidor: copie `api/bry.example.php` para `api/bry.local.php` (privado, fora do GitHub) e preencha `client_id` e `client_secret` da aplicação criada em cloud.bry.com.br. Informe também `storage_dir`, uma pasta **fora** da pasta pública do site; a API recusa pastas dentro dela. Comece em `homologacao` e confirme com a BRy o endereço do HUB de homologação e o perfil desejado (`TIMESTAMP` ou `ADRT` com `policy_oid`). Enquanto o arquivo não existir, o botão não aparece. O médico precisa do CPF em Meu perfil e de um certificado em um dos PSCs ou no BRy KMS; a assinatura gov.br não está implementada.

A tabela `signed_documents` guarda apenas o identificador público, o hash do código, o tipo, o SHA-256 e as datas; os PDFs ficam em `storage_dir`. Esses arquivos são documentos de pacientes: inclua a pasta nos backups privados do servidor e nunca no GitHub. Testes: `php tests/digital-signature.php` (SQLite e BRy simulada) e `node --test tests/digital-signature.mjs`.

## Cronômetro do atendimento

No topo do receituário, “Iniciar atendimento” inicia a contagem para o paciente preenchido e o local selecionado. O início e a duração são gravados no histórico ao salvar o atendimento, gerar documentos ou limpar os dados do paciente. O botão de limpar grava a duração final antes de zerar; se a gravação falhar, preserva os dados para nova tentativa. Também é possível salvar somente o tempo, sem documento ou história clínica.

O registro “Tempo de atendimento” exibe o início no fuso America/Fortaleza e a duração em horas, minutos e segundos. Salvamentos repetidos atualizam o mesmo cronômetro, sem duplicá-lo. A API cria as colunas `consultation_started_at` e `consultation_duration_seconds` em `appointments`. O cronômetro fica apenas na sessão aberta do navegador; trocar o paciente, sair da conta ou recarregar a página encerra a contagem local. Execute `node --test tests/consultation-timer.mjs` para conferir os fluxos de tempo, salvamento e limpeza.
