<?php
declare(strict_types=1);

function agendaDefaults(): array {
    return ['opening'=>'07:00','closing'=>'23:00','lunch_enabled'=>false,'lunch_start'=>'12:00','lunch_end'=>'13:00','default_duration'=>30,'slot_interval'=>30,'use_procedure_duration'=>true,'row_height'=>66];
}
function agendaSettings(PDO $pdo, int $userId): array {
    $pdo->exec("CREATE TABLE IF NOT EXISTS agenda_settings (user_id BIGINT UNSIGNED PRIMARY KEY, settings TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $stmt=$pdo->prepare('SELECT settings FROM agenda_settings WHERE user_id=?');$stmt->execute([$userId]);
    return array_replace(agendaDefaults(),json_decode((string)($stmt->fetchColumn()?:'{}'),true)?:[]);
}
function validateAgendaSettings(array $data): array {
    $value=agendaDefaults();
    foreach (['opening','closing','lunch_start','lunch_end'] as $key) {
        $time=(string)($data[$key]??$value[$key]);
        if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D',$time)) throw new InvalidArgumentException('Informe horários válidos.');
        $value[$key]=$time;
    }
    foreach (['default_duration'=>[1,720],'slot_interval'=>[1,120],'row_height'=>[16,100]] as $key=>$limits) {
        $number=filter_var($data[$key]??$value[$key],FILTER_VALIDATE_INT);
        if ($number===false || $number<$limits[0] || $number>$limits[1]) throw new InvalidArgumentException('Confira duração, intervalo e altura da grade.');
        $value[$key]=$number;
    }
    foreach (['lunch_enabled','use_procedure_duration'] as $key) $value[$key]=filter_var($data[$key]??$value[$key],FILTER_VALIDATE_BOOLEAN);
    if ($value['opening'] >= $value['closing']) throw new InvalidArgumentException('O fechamento deve ser posterior à abertura.');
    if ($value['lunch_enabled'] && ($value['lunch_start'] >= $value['lunch_end'] || $value['lunch_start'] < $value['opening'] || $value['lunch_end'] > $value['closing'])) throw new InvalidArgumentException('O almoço deve estar dentro do funcionamento, com fim posterior ao início.');
    return $value;
}
function handleAgendaSettings(PDO $pdo,int $userId,string $action,array $data): never {
    $settings=agendaSettings($pdo,$userId);
    if ($action==='agenda-settings.get') respond(['ok'=>true,'settings'=>$settings]);
    if ($action!=='agenda-settings.save') respond(['ok'=>false,'error'=>'Operação inválida.'],404);
    try {$settings=validateAgendaSettings($data);} catch (InvalidArgumentException $e) {respond(['ok'=>false,'error'=>$e->getMessage()],422);}
    $stmt=$pdo->prepare('INSERT INTO agenda_settings (user_id,settings) VALUES (?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)');
    $stmt->execute([$userId,json_encode($settings,JSON_UNESCAPED_UNICODE)]);
    respond(['ok'=>true,'settings'=>$settings]);
}
