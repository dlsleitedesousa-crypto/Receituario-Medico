# Flow Receita — Receituário Médico

Arquivos públicos recuperados de https://receita.drdanielleite.com.br/ em 16/09/2026, preservados sem alterações.

## Arquivos recuperados

- `index.html`: página principal, com estilos CSS e JavaScript incorporados.
- `print-summary.js`: recursos de impressão.
- `backend.js`: integração da página com a API PHP/MySQL da Hostinger.

A página pública referencia apenas esses dois arquivos JavaScript externos. As imagens dos locais de atendimento são carregadas durante o uso da aplicação.

## Cópia ainda incompleta

Este repositório contém a parte pública recuperável pelo navegador. Não é um backup completo da hospedagem.

O arquivo `backend.js` utiliza `api/index.php`, cujo código PHP é executado no servidor e não é disponibilizado pelo endereço público. Para completar a cópia, é necessário obter pela Hostinger os arquivos da pasta deste site (incluindo a API e eventuais uploads, configurações e arquivos ocultos). O banco MySQL precisa de uma exportação separada, se for necessário preservar os dados.

Antes de versionar os arquivos adicionais, remover credenciais de banco de dados, senhas, chaves e dados pessoais. Configurações privadas e backups do banco não devem ser publicados no GitHub.

## Visualização local

Na pasta do projeto, execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra http://127.0.0.1:8000/. Em `localhost` e `127.0.0.1`, o próprio JavaScript original desativa a integração com a API e usa o comportamento local da página. Essa visualização não valida os recursos PHP/MySQL de produção.

Uma instalação em outro domínio depende da API e do banco originais, ainda não incluídos.
