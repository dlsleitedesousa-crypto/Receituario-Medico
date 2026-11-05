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
    if ($action === 'procedures.list') {
        $stmt = $pdo->prepare('SELECT s.* FROM scheduling_procedures s JOIN places p ON p.id=s.place_id AND p.user_id=s.user_id WHERE s.user_id=? ORDER BY s.name,s.id');
        $stmt->execute([$userId]);
        respond(['ok'=>true,'items'=>array_values(array_filter($stmt->fetchAll(), fn($row)=>secretaryCanUsePlace((int)$row['place_id'])))]);
    }
    $id = (int)($data['id'] ?? 0);
    if ($action === 'procedures.delete') {
        $stmt=$pdo->prepare('DELETE FROM scheduling_procedures WHERE id=? AND user_id=?');
        $stmt->execute([$id,$userId]);
        respond(['ok'=>true]);
    }
    if ($action !== 'procedures.save') respond(['ok'=>false,'error'=>'Operação inválida.'],404);
    $name=trim((string)($data['name']??''));
    $price=(string)($data['price']??'');
    $duration=filter_var($data['duration']??null,FILTER_VALIDATE_INT);
    $placeId=(int)($data['place_id']??0);
    if (!$name || mb_strlen($name)>180 || !preg_match('/^\d{1,8}(\.\d{1,2})?$/D',$price) || $duration===false || $duration<1 || $duration>720) respond(['ok'=>false,'error'=>'Informe nome, valor válido e duração de 1 a 720 minutos.'],422);
    $stmt=$pdo->prepare('SELECT id FROM places WHERE id=? AND user_id=?');
    $stmt->execute([$placeId,$userId]);
    if (!$stmt->fetchColumn()) respond(['ok'=>false,'error'=>'Selecione um local cadastrado.'],422);
    if ($id) {
        $stmt=$pdo->prepare('UPDATE scheduling_procedures SET name=?,price=?,duration=?,place_id=? WHERE id=? AND user_id=?');
        $stmt->execute([$name,$price,$duration,$placeId,$id,$userId]);
    } else {
        $stmt=$pdo->prepare('INSERT INTO scheduling_procedures (name,price,duration,place_id,user_id) VALUES (?,?,?,?,?)');
        $stmt->execute([$name,$price,$duration,$placeId,$userId]);
        $id=(int)$pdo->lastInsertId();
    }
    respond(['ok'=>true,'id'=>$id]);
}
