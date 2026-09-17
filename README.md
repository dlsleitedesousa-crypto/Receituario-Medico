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

As instruções originais mencionam dois arquivos `.htaccess`, mas eles não foram listados e não puderam ser recuperados nesses caminhos. Os arquivos `api/download` e `download (1)` contêm regras de Apache; seus nomes não foram alterados durante a cópia.

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
