<?php
declare(strict_types=1);

function schedulingValues(array $data): array {
    $value = [];
    foreach (['name'=>180,'cpf'=>11,'birth_date'=>10,'phone'=>30,'date'=>10,'start'=>5,'end'=>5,'procedure'=>180,'attendance_type'=>80,'insurance'=>120,'notes'=>4000,'status'=>30] as $key=>$limit) {
        $value[$key] = trim((string)($data[$key] ?? ''));
        if (mb_strlen($value[$key]) > $limit) throw new InvalidArgumentException('Campo muito longo: ' . $key);
    }
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
    if ($action === 'schedule.list') {
        $date = (string)($data['date'] ?? '');
        $stmt = $pdo->prepare('SELECT s.*,p.name AS patient_name,p.cpf,p.birth_date,p.phone,l.name AS place_name FROM scheduled_visits s JOIN patients p ON p.id=s.patient_id AND p.user_id=s.user_id JOIN places l ON l.id=s.place_id AND l.user_id=s.user_id WHERE s.user_id=? AND s.visit_date=? ORDER BY s.start_time,s.id');
        $stmt->execute([$userId, $date]);
        $items = [];
        foreach ($stmt->fetchAll() as $row) {
            if (!secretaryCanUsePlace((int)$row['place_id'])) continue;
            $details = json_decode($row['details'], true) ?: [];
            $items[] = array_merge($details, ['id'=>$row['id'],'patient_id'=>$row['patient_id'],'place_id'=>$row['place_id'],'place_name'=>$row['place_name'],'name'=>$row['patient_name'],'cpf'=>$row['cpf'],'birth_date'=>$row['birth_date'],'phone'=>$row['phone'],'date'=>$row['visit_date'],'start'=>substr($row['start_time'],0,5),'end'=>substr($row['end_time'],0,5),'status'=>$row['status']]);
        }
        respond(['ok'=>true,'items'=>$items]);
    }
    if ($action !== 'schedule.save') respond(['ok'=>false,'error'=>'Operação inválida.'],404);
    try { $value = schedulingValues($data); }
    catch (InvalidArgumentException $error) { respond(['ok'=>false,'error'=>$error->getMessage()],422); }
    $id = (int)($data['id'] ?? 0);
    $placeId = (int)($data['place_id'] ?? 0);
    if (!secretaryCanUsePlace($placeId)) respond(['ok'=>false,'error'=>'Você não tem permissão para agendar neste local.'],403);
    $pdo->beginTransaction();
    // Serialize writes for this professional, including concurrent secretary sessions.
    $stmt = $pdo->prepare('SELECT id FROM users WHERE id=? FOR UPDATE');
    $stmt->execute([$userId]);
    $stmt = $pdo->prepare('SELECT id FROM places WHERE id=? AND user_id=?');
    $stmt->execute([$placeId,$userId]);
    if (!$stmt->fetch()) { $pdo->rollBack(); respond(['ok'=>false,'error'=>'Selecione um local válido.'],422); }
    if ($id) {
        $stmt = $pdo->prepare('SELECT id,place_id FROM scheduled_visits WHERE id=? AND user_id=?');
        $stmt->execute([$id,$userId]);
        $existingVisit=$stmt->fetch();
        if (!$existingVisit || !secretaryCanUsePlace((int)$existingVisit['place_id'])) { $pdo->rollBack(); respond(['ok'=>false,'error'=>'Agendamento não encontrado.'],404); }
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
