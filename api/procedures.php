<?php
declare(strict_types=1);

function handleProcedures(PDO $pdo, int $userId, string $action, array $data): never {
    $pdo->exec("CREATE TABLE IF NOT EXISTS scheduling_procedures (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        place_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(180) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        duration SMALLINT UNSIGNED NOT NULL,
        INDEX idx_procedures_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS scheduling_procedure_places (
        procedure_id BIGINT UNSIGNED NOT NULL,
        place_id BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (procedure_id,place_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    if ($action === 'procedures.list') {
        $stmt = $pdo->prepare('SELECT s.*,p.id AS allowed_place_id FROM scheduling_procedures s LEFT JOIN scheduling_procedure_places l ON l.procedure_id=s.id JOIN places p ON p.id=COALESCE(l.place_id,s.place_id) AND p.user_id=s.user_id WHERE s.user_id=? ORDER BY s.name,s.id,p.id');
        $stmt->execute([$userId]);
        $items=[];
        foreach ($stmt->fetchAll() as $row) {
            $placeId=(int)$row['allowed_place_id'];
            if (!secretaryCanUsePlace($placeId)) continue;
            if (!isset($items[$row['id']])) {
                unset($row['allowed_place_id']);$row['place_id']=$placeId;$row['place_ids']=[];
                $items[$row['id']]=$row;
            }
            $items[$row['id']]['place_ids'][]=$placeId;
        }
        respond(['ok'=>true,'items'=>array_values($items)]);
    }
    $id = (int)($data['id'] ?? 0);
    if ($action === 'procedures.delete') {
        $pdo->beginTransaction();
        $stmt=$pdo->prepare('DELETE l FROM scheduling_procedure_places l JOIN scheduling_procedures s ON s.id=l.procedure_id WHERE s.id=? AND s.user_id=?');
        $stmt->execute([$id,$userId]);
        $stmt=$pdo->prepare('DELETE FROM scheduling_procedures WHERE id=? AND user_id=?');
        $stmt->execute([$id,$userId]);
        $pdo->commit();
        respond(['ok'=>true]);
    }
    if ($action !== 'procedures.save') respond(['ok'=>false,'error'=>'Operação inválida.'],404);
    $name=trim((string)($data['name']??''));
    $price=(string)($data['price']??'');
    $duration=filter_var($data['duration']??null,FILTER_VALIDATE_INT);
    $placeIds=$data['place_ids']??[$data['place_id']??0];
    if (!is_array($placeIds) || !$placeIds) respond(['ok'=>false,'error'=>'Selecione pelo menos um local.'],422);
    $placeIds=array_values(array_unique(array_map('intval',$placeIds)));
    $placeId=$placeIds[0];
    if (!$name || mb_strlen($name)>180 || !preg_match('/^\d{1,8}(\.\d{1,2})?$/D',$price) || $duration===false || $duration<1 || $duration>720) respond(['ok'=>false,'error'=>'Informe nome, valor válido e duração de 1 a 720 minutos.'],422);
    $stmt=$pdo->prepare('SELECT id FROM places WHERE user_id=?');
    $stmt->execute([$userId]);
    $owned=array_map('intval',$stmt->fetchAll(PDO::FETCH_COLUMN));
    if (array_diff($placeIds,$owned)) respond(['ok'=>false,'error'=>'Selecione apenas locais do seu cadastro.'],422);
    $pdo->beginTransaction();
    if ($id) {
        $stmt=$pdo->prepare('SELECT id FROM scheduling_procedures WHERE id=? AND user_id=? FOR UPDATE');
        $stmt->execute([$id,$userId]);
        if (!$stmt->fetchColumn()) {$pdo->rollBack();respond(['ok'=>false,'error'=>'Procedimento não encontrado.'],404);}
        $stmt=$pdo->prepare('UPDATE scheduling_procedures SET name=?,price=?,duration=?,place_id=? WHERE id=? AND user_id=?');
        $stmt->execute([$name,$price,$duration,$placeId,$id,$userId]);
    } else {
        $stmt=$pdo->prepare('INSERT INTO scheduling_procedures (name,price,duration,place_id,user_id) VALUES (?,?,?,?,?)');
        $stmt->execute([$name,$price,$duration,$placeId,$userId]);
        $id=(int)$pdo->lastInsertId();
    }
    $stmt=$pdo->prepare('DELETE FROM scheduling_procedure_places WHERE procedure_id=?');
    $stmt->execute([$id]);
    $stmt=$pdo->prepare('INSERT INTO scheduling_procedure_places (procedure_id,place_id) VALUES (?,?)');
    foreach ($placeIds as $selectedPlaceId) $stmt->execute([$id,$selectedPlaceId]);
    $pdo->commit();
    respond(['ok'=>true,'id'=>$id]);
}
