<?php
declare(strict_types=1);

// Somente campos presentes no pedido são alterados; outros fluxos preservam o cadastro.
function patientAdditionalFields(array $data): array {
    $limits = ['sex'=>30,'gender'=>80,'rg'=>30,'rg_issuer'=>40,'marital_status'=>40,
        'passport'=>40,'birth_certificate'=>80,'email'=>190,'landline'=>30,'other_phone'=>30,
        'postal_code'=>9,'street'=>180,'number'=>30,'complement'=>120,'neighborhood'=>120,
        'city'=>180,'state'=>2,'ibge_code'=>7,'birthplace'=>180,'insurance'=>120,
        'insurance_plan'=>120,'insurance_card'=>60,'notes'=>4000];
    $profile = [];
    foreach ($limits as $key=>$limit) {
        if (!array_key_exists($key,$data)) continue;
        if (!is_scalar($data[$key]) && $data[$key] !== null) throw new InvalidArgumentException('Campo inválido: '.$key);
        $value = trim((string)$data[$key]);
        if (mb_strlen($value)>$limit) throw new InvalidArgumentException('Campo muito longo: '.$key);
        $profile[$key] = $value;
    }
    if (($profile['email'] ?? '') !== '' && !filter_var($profile['email'],FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Informe um e-mail válido.');
    if (($profile['sex'] ?? '') !== '' && !in_array($profile['sex'],['Não informado','Feminino','Masculino','Intersexo'],true)) throw new InvalidArgumentException('Sexo biológico inválido.');
    if (($profile['postal_code'] ?? '') !== '' && !preg_match('/^\d{5}-?\d{3}$/D',$profile['postal_code'])) throw new InvalidArgumentException('Informe um CEP válido.');
    if (($profile['ibge_code'] ?? '') !== '' && !preg_match('/^\d{7}$/D',$profile['ibge_code'])) throw new InvalidArgumentException('O código IBGE deve ter 7 dígitos.');
    if (isset($profile['state'])) {
        $profile['state'] = strtoupper($profile['state']);
        if ($profile['state'] !== '' && !in_array($profile['state'],['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],true)) throw new InvalidArgumentException('Selecione uma UF válida.');
    }
    return $profile;
}
