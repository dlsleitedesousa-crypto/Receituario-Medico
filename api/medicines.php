<?php
declare(strict_types=1);

function medicineSchema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS medicines (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(180) NOT NULL,
        ingredient VARCHAR(180) NOT NULL,
        quantity VARCHAR(120) NOT NULL,
        prescription TEXT NOT NULL,
        type VARCHAR(16) NOT NULL,
        INDEX medicines_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function handleMedicines(PDO $pdo, int $userId, string $action, array $data): void {
    medicineSchema($pdo);
    if ($action === 'medicines.list') {
        $stmt = $pdo->prepare('SELECT id,name,ingredient,quantity,prescription,type FROM medicines WHERE user_id=? ORDER BY name,id');
        $stmt->execute([$userId]);
        respond(['ok' => true, 'items' => $stmt->fetchAll()]);
    }
    if ($action === 'medicines.save') {
        $values = [];
        foreach (['name' => 180, 'ingredient' => 180, 'quantity' => 120, 'prescription' => 10000] as $field => $limit) {
            $values[$field] = trim((string)($data[$field] ?? ''));
            if ($values[$field] === '' || mb_strlen($values[$field]) > $limit) {
                respond(['ok' => false, 'error' => 'Preencha os dados do medicamento e respeite o tamanho permitido.'], 422);
            }
        }
        $type = (string)($data['type'] ?? '');
        if (!in_array($type, ['simples', 'especial'], true)) respond(['ok' => false, 'error' => 'Selecione receita simples ou especial.'], 422);
        $id = (int)($data['id'] ?? 0);
        if ($id) {
            $stmt = $pdo->prepare('SELECT id FROM medicines WHERE id=? AND user_id=?');
            $stmt->execute([$id, $userId]);
            if (!$stmt->fetch()) respond(['ok' => false, 'error' => 'Medicamento não encontrado.'], 404);
            $stmt = $pdo->prepare('UPDATE medicines SET name=?,ingredient=?,quantity=?,prescription=?,type=? WHERE id=? AND user_id=?');
            $stmt->execute([...array_values($values), $type, $id, $userId]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO medicines (name,ingredient,quantity,prescription,type,user_id) VALUES (?,?,?,?,?,?)');
            $stmt->execute([...array_values($values), $type, $userId]);
            $id = (int)$pdo->lastInsertId();
        }
        respond(['ok' => true, 'id' => $id]);
    }
    if ($action === 'medicines.delete') {
        $stmt = $pdo->prepare('DELETE FROM medicines WHERE id=? AND user_id=?');
        $stmt->execute([(int)($data['id'] ?? 0), $userId]);
        if (!$stmt->rowCount()) respond(['ok' => false, 'error' => 'Medicamento não encontrado.'], 404);
        respond(['ok' => true]);
    }
    respond(['ok' => false, 'error' => 'Ação inválida.'], 404);
}
