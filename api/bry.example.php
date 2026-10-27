<?php
// Copie para bry.local.php e preencha apenas no servidor. Credenciais em cloud.bry.com.br → Aplicações.
return [
    'environment' => 'homologacao', // 'producao' usa cloud.bry.com.br e hub2.bry.com.br
    'client_id' => 'ID_DA_APLICACAO',
    'client_secret' => 'API_KEY_DA_APLICACAO',
    // Pasta privada, FORA da pasta pública do site, para os PDFs assinados.
    'storage_dir' => '/home/USUARIO/assinaturas-flow-receita',
    // 'hub_url' => 'https://hub2.hom.bry.com.br', // confirme o endereço de homologação com a BRy
    'profile' => 'TIMESTAMP', // PAdES com carimbo do tempo; use 'ADRT' com policy_oid se a BRy indicar
    'policy_oid' => '',
    // 'stamp' => ['coordenadaX' => 10, 'coordenadaY' => 5, 'largura' => 80, 'altura' => 22],
];
