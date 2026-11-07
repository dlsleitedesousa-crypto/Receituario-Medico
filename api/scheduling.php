<?php
declare(strict_types=1);

function schedulingValues(array $data): array {
    foreach (['cpf','phone'] as $key) $data[$key] = preg_replace('/\D/', '', (string)($data[$key] ?? ''));
    $value = [];
    foreach (['name'=>180,'cpf'=>11,'birth_date'=>10,'phone'=>30,'date'=>10,'start'=>5,'end'=>5,'procedure'=>180,'attendance_type'=>80,'visit_mode'=>20,'insurance'=>120,'notes'=>4000,'status'=>30,'email'=>190,'city'=>180,'sex'=>30] as $key=>$limit) {
        $value[$key] = trim((string)($data[$key] ?? ''));
        if (mb_strlen($value[$key]) > $limit) throw new InvalidArgumentException('Campo muito longo: ' . $key);
    }
    if (!array_key_exists('visit_mode',$data)) $value['visit_mode'] = $value['attendance_type']==='Teleconsulta' ? 'On-line' : 'Presencial';
    if (!in_array($value['visit_mode'],['Presencial','On-line'],true)) throw new InvalidArgumentException('Selecione atendimento presencial ou on-line.');
    if ($value['phone'] !== '' && !preg_match('/^\d{10,11}$/D', $value['phone'])) throw new InvalidArgumentException('Informe telefone com DDD e 10 ou 11 dígitos.');
    if ($value['email']!=='' && !filter_var($value['email'],FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Informe um e-mail válido.');
    if ($value['sex']!=='' && !in_array($value['sex'],['Não informado','Feminino','Masculino','Intersexo'],true)) throw new InvalidArgumentException('Sexo biológico inválido.');
    $price = (string)($data['price'] ?? '0');
    if (!preg_match('/^\d{1,8}(\.\d{1,2})?$/D', $price)) throw new InvalidArgumentException('Informe um valor válido.');
    $value['price'] = $price;
    foreach (['birth_date','date'] as $key) {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value[$key]);
        if (!$date || $date->format('Y-m-d') !== $value[$key]) throw new InvalidArgumentException('Informe datas válidas.');
    }
    if ($value['birth_date'] > date('Y-m-d') || count(preg_split('/\s+/', $value['name'])) < 2 || !preg_match('/^\d{11}$/D', $value['cpf'])) throw new InvalidArgumentException('Informe nome completo, CPF com 11 dígitos e nascimento válido.');
    foreach (['start','end'] as $key) if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $value[$key])) throw new InvalidArgumentException('Horário inválido.');
    if ($value['start'] >= $value['end'] || !$value['procedure'] || !$value['attendance_type']) throw new InvalidArgumentException('Preencha procedimento, tipo de atendimento e horário final posterior ao inicial.');
    if (!in_array($value['status'], ['Agendado','Confirmado','Aguardando','Em atendimento','Finalizado','Cancelado','Faltou'], true)) throw new InvalidArgumentException('Status inválido.');
    return $value;
}

function handleScheduling(PDO $pdo, int $userId, string $action, array $data): never {
    $pdo->exec("CREATE TABLE IF NOT EXISTS scheduled_visits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        patient_id BIGINT UNSIGNED NOT NULL,
        place_id BIGINT UNSIGNED NOT NULL,
        visit_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(30) NOT NULL,
        details TEXT NOT NULL,
        INDEX idx_schedule_user_date (user_id, visit_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS scheduled_visit_timing (
        visit_id BIGINT UNSIGNED PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        started_at DATETIME NOT NULL,
        ended_at DATETIME NULL,
        duration_seconds INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    if ($action === 'schedule.start') {
        $stmt=$pdo->prepare("SELECT id FROM scheduled_visits WHERE id=? AND user_id=? AND status='Em atendimento'");
        $stmt->execute([(int)($data['id']??0),$userId]);$id=$stmt->fetchColumn();
        if (!$id) respond(['ok'=>false,'error'=>'Consulta não está em atendimento.'],409);
        $stmt=$pdo->prepare('INSERT INTO scheduled_visit_timing (visit_id,user_id,started_at) VALUES (?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE visit_id=VALUES(visit_id)');
        $stmt->execute([$id,$userId]);
        $stmt=$pdo->prepare('SELECT started_at FROM scheduled_visit_timing WHERE visit_id=? AND user_id=?');
        $stmt->execute([$id,$userId]);
        respond(['ok'=>true,'started_at'=>str_replace(' ','T',$stmt->fetchColumn()).'Z']);
    }
    if ($action === 'schedule.return') {
        $stmt=$pdo->prepare('SELECT * FROM scheduled_visits WHERE id=? AND user_id=?');
        $stmt->execute([(int)($data['id']??0),$userId]);$visit=$stmt->fetch();
        if (!$visit) respond(['ok'=>false,'error'=>'Consulta não encontrada.'],404);
        $today=(new DateTimeImmutable('now',new DateTimeZone('America/Fortaleza')))->format('Y-m-d');
        if ($visit['visit_date']!==$today) respond(['ok'=>false,'error'=>'Só é possível voltar para editar a consulta no mesmo dia do atendimento.'],403);
        if (!in_array($visit['status'],['Em atendimento','Finalizado'],true)) respond(['ok'=>false,'error'=>'Esta consulta ainda não foi atendida ou foi cancelada.'],409);
        $stmt=$pdo->prepare("SELECT document_type,document_title,document_text FROM appointments WHERE user_id=? AND patient_id=? AND place_id=? AND document_date=? AND document_type NOT IN ('tempo_atendimento','historia_clinica') ORDER BY id DESC LIMIT 1");
        $stmt->execute([$userId,$visit['patient_id'],$visit['place_id'],$today]);$document=$stmt->fetch()?:null;
        $stmt=$pdo->prepare("SELECT document_text FROM appointments WHERE user_id=? AND patient_id=? AND document_date=? AND document_type='historia_clinica' ORDER BY id DESC LIMIT 1");
        $stmt->execute([$userId,$visit['patient_id'],$today]);$clinical=$stmt->fetchColumn();
        respond(['ok'=>true,'document'=>$document,'clinical_history'=>$clinical?:'']);
    }
    if ($action === 'schedule.finish') {
        $stmt = $pdo->prepare('SELECT s.id,s.place_id,s.status,p.cpf FROM scheduled_visits s JOIN patients p ON p.id=s.patient_id AND p.user_id=s.user_id WHERE s.id=? AND s.user_id=?');
        $stmt->execute([(int)($data['id'] ?? 0),$userId]);
        $visit = $stmt->fetch();
        if (!$visit || !secretaryCanUsePlace((int)$visit['place_id'])) respond(['ok'=>false,'error'=>'Agendamento não encontrado.'],404);
        if ($visit['cpf'] !== preg_replace('/\D/', '', (string)($data['cpf'] ?? '')) || (int)$visit['place_id'] !== (int)($data['place_id'] ?? 0)) respond(['ok'=>false,'error'=>'O paciente ou local não corresponde ao agendamento aberto.'],422);
        $stmt = $pdo->prepare("UPDATE scheduled_visits SET status='Finalizado' WHERE id=? AND user_id=? AND status IN ('Em atendimento','Finalizado')");
        $stmt->execute([$visit['id'],$userId]);
        $stmt=$pdo->prepare('SELECT status FROM scheduled_visits WHERE id=? AND user_id=?');
        $stmt->execute([$visit['id'],$userId]);
        if ($stmt->fetchColumn() !== 'Finalizado') respond(['ok'=>false,'error'=>'O agendamento não está em atendimento. Confira o status em Consultas.'],409);
        $stmt=$pdo->prepare('UPDATE scheduled_visit_timing SET duration_seconds=GREATEST(0,TIMESTAMPDIFF(SECOND,started_at,UTC_TIMESTAMP())),ended_at=UTC_TIMESTAMP() WHERE visit_id=? AND user_id=? AND ended_at IS NULL');
        $stmt->execute([$visit['id'],$userId]);
        respond(['ok'=>true]);
    }
    if ($action === 'schedule.list') {
        $date = (string)($data['date'] ?? '');
        $endDate=(string)($data['end_date']??$date);
        $start=DateTimeImmutable::createFromFormat('!Y-m-d',$date);$end=DateTimeImmutable::createFromFormat('!Y-m-d',$endDate);
        if (!$start || !$end || $start->format('Y-m-d')!==$date || $end->format('Y-m-d')!==$endDate || $end<$start || $start->diff($end)->days>41) respond(['ok'=>false,'error'=>'Selecione um período válido de até 42 dias.'],422);
        $stmt = $pdo->prepare('SELECT s.*,p.name AS patient_name,p.cpf,p.birth_date,p.phone,l.name AS place_name,t.started_at AS actual_started_at,t.ended_at AS actual_ended_at,CASE WHEN t.ended_at IS NULL THEN GREATEST(0,TIMESTAMPDIFF(SECOND,t.started_at,UTC_TIMESTAMP())) ELSE t.duration_seconds END AS actual_duration_seconds FROM scheduled_visits s JOIN patients p ON p.id=s.patient_id AND p.user_id=s.user_id JOIN places l ON l.id=s.place_id AND l.user_id=s.user_id LEFT JOIN scheduled_visit_timing t ON t.visit_id=s.id AND t.user_id=s.user_id WHERE s.user_id=? AND s.visit_date BETWEEN ? AND ? ORDER BY s.visit_date,s.start_time,s.id');
        $stmt->execute([$userId, $date, $endDate]);
        $items = [];
        foreach ($stmt->fetchAll() as $row) {
            if (!secretaryCanUsePlace((int)$row['place_id'])) continue;
            $details = json_decode($row['details'], true) ?: [];
            $items[] = array_merge($details, ['id'=>$row['id'],'patient_id'=>$row['patient_id'],'place_id'=>$row['place_id'],'place_name'=>$row['place_name'],'name'=>$row['patient_name'],'cpf'=>$row['cpf'],'birth_date'=>$row['birth_date'],'phone'=>$row['phone'],'date'=>$row['visit_date'],'start'=>substr($row['start_time'],0,5),'end'=>substr($row['end_time'],0,5),'status'=>$row['status'],
                'actual_started_at'=>$row['actual_started_at']?str_replace(' ','T',$row['actual_started_at']).'Z':null,
                'actual_ended_at'=>$row['actual_ended_at']?str_replace(' ','T',$row['actual_ended_at']).'Z':null,
                'actual_duration_seconds'=>$row['actual_started_at']?(int)$row['actual_duration_seconds']:null]);
        }
        respond(['ok'=>true,'items'=>$items]);
    }
    if ($action !== 'schedule.save') respond(['ok'=>false,'error'=>'Operação inválida.'],404);
    try { $value = schedulingValues($data); }
    catch (InvalidArgumentException $error) { respond(['ok'=>false,'error'=>$error->getMessage()],422); }
    $id = (int)($data['id'] ?? 0);
    $placeId = (int)($data['place_id'] ?? 0);
    if (!secretaryCanUsePlace($placeId)) respond(['ok'=>false,'error'=>'Você não tem permissão para agendar neste local.'],403);
    require_once __DIR__.'/agenda-settings.php';
    $configuration=agendaSettings($pdo,$userId);
    $pdo->beginTransaction();
    // Serialize writes for this professional, including concurrent secretary sessions.
    $stmt = $pdo->prepare('SELECT id FROM users WHERE id=? FOR UPDATE');
    $stmt->execute([$userId]);
    $stmt = $pdo->prepare('SELECT id FROM places WHERE id=? AND user_id=?');
    $stmt->execute([$placeId,$userId]);
    if (!$stmt->fetch()) { $pdo->rollBack(); respond(['ok'=>false,'error'=>'Selecione um local válido.'],422); }
    if ($id) {
        $stmt = $pdo->prepare('SELECT id,place_id,visit_date,start_time,end_time FROM scheduled_visits WHERE id=? AND user_id=?');
        $stmt->execute([$id,$userId]);
        $existingVisit=$stmt->fetch();
        if (!$existingVisit || !secretaryCanUsePlace((int)$existingVisit['place_id'])) { $pdo->rollBack(); respond(['ok'=>false,'error'=>'Agendamento não encontrado.'],404); }
    }
    if (!in_array($value['status'],['Cancelado','Faltou'],true) && (!$id || $existingVisit['visit_date']!==$value['date'] || substr($existingVisit['start_time'],0,5)!==$value['start'] || substr($existingVisit['end_time'],0,5)!==$value['end'])) {
        if ($value['start']<$configuration['opening'] || $value['end']>$configuration['closing'] || ($configuration['lunch_enabled'] && $value['start']<$configuration['lunch_end'] && $value['end']>$configuration['lunch_start'])) {$pdo->rollBack();respond(['ok'=>false,'error'=>'Escolha um horário dentro do funcionamento e fora do almoço.'],422);}
    }
    if (!in_array($value['status'], ['Cancelado','Faltou'], true)) {
        $stmt = $pdo->prepare("SELECT id FROM scheduled_visits WHERE user_id=? AND visit_date=? AND id<>? AND status NOT IN ('Cancelado','Faltou') AND start_time<? AND end_time>? LIMIT 1");
        $stmt->execute([$userId,$value['date'],$id,$value['end'],$value['start']]);
        if ($stmt->fetch()) { $pdo->rollBack(); respond(['ok'=>false,'error'=>'Já existe um atendimento nesse horário.'],409); }
    }
    $stmt = $pdo->prepare('SELECT id FROM patients WHERE user_id=? AND cpf=?');
    $stmt->execute([$userId,$value['cpf']]);
    $patientId = $stmt->fetchColumn();
    if (!$patientId) {
        $stmt = $pdo->prepare('INSERT INTO patients (user_id,name,cpf,birth_date,phone) VALUES (?,?,?,?,?)');
        $stmt->execute([$userId,$value['name'],$value['cpf'],$value['birth_date'],$value['phone']]);
        $patientId = $pdo->lastInsertId();
    } else {
        $stmt = $pdo->prepare('UPDATE patients SET name=?,birth_date=?,phone=? WHERE id=? AND user_id=?');
        $stmt->execute([$value['name'],$value['birth_date'],$value['phone'],$patientId,$userId]);
    }
    $params = [$patientId,$placeId,$value['date'],$value['start'],$value['end'],$value['status'],json_encode($value,JSON_UNESCAPED_UNICODE)];
    if ($id) {
        $stmt = $pdo->prepare('UPDATE scheduled_visits SET patient_id=?,place_id=?,visit_date=?,start_time=?,end_time=?,status=?,details=? WHERE id=? AND user_id=?');
        $stmt->execute([...$params,$id,$userId]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO scheduled_visits (patient_id,place_id,visit_date,start_time,end_time,status,details,user_id) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([...$params,$userId]);
        $id = (int)$pdo->lastInsertId();
    }
    $pdo->commit();
    respond(['ok'=>true,'id'=>$id]);
}
