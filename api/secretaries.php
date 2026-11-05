<?php
declare(strict_types=1);

function secretaryAllowedAction(string $action): bool {
    return in_array($action, ['schedule.list','schedule.save','procedures.list','patients.list','patients.save','patients.update','places.list'], true);
}

function secretaryCanUsePlace(int $placeId): bool {
    $ids = $GLOBALS['secretaryPlaceIds'] ?? null;
    return $ids === null || in_array($placeId, $ids, true);
}

function authorizeSchedulingUser(PDO $pdo, int $userId, string $action): int {
    $GLOBALS['secretaryPlaceIds'] = null;
    $stmt=$pdo->prepare('SELECT secretary_owner_id,secretary_enabled,secretary_place_ids FROM users WHERE id=?');
    $stmt->execute([$userId]); $user=$stmt->fetch();
    if (!$user || !$user['secretary_enabled']) respond(['ok'=>false,'error'=>'Acesso desativado.'],401);
    if (!$user['secretary_owner_id']) return $userId;
    if (!secretaryAllowedAction($action)) respond(['ok'=>false,'error'=>'A secretaria tem acesso somente à agenda e ao cadastro de pacientes.'],403);
    if ($user['secretary_place_ids'] !== null) $GLOBALS['secretaryPlaceIds'] = array_map('intval', json_decode($user['secretary_place_ids'], true) ?: []);
    return (int)$user['secretary_owner_id'];
}

function handleSecretaries(PDO $pdo, int $userId, string $action, array $data): never {
    if ($action==='secretaries.list') {
        $stmt=$pdo->prepare('SELECT id,name,email,secretary_enabled,secretary_place_ids FROM users WHERE secretary_owner_id=? ORDER BY name');$stmt->execute([$userId]);
        $items=$stmt->fetchAll();
        foreach ($items as &$item) { $item['place_ids']=$item['secretary_place_ids']===null?null:array_map('intval',json_decode($item['secretary_place_ids'],true)?:[]); unset($item['secretary_place_ids']); } unset($item);
        respond(['ok'=>true,'items'=>$items]);
    }
    if ($action==='secretaries.disable') {
        $stmt=$pdo->prepare('UPDATE users SET secretary_enabled=0 WHERE id=? AND secretary_owner_id=?');$stmt->execute([(int)($data['id']??0),$userId]);
        respond(['ok'=>true]);
    }
    if ($action!=='secretaries.save') respond(['ok'=>false,'error'=>'Operação inválida.'],404);
    $name=trim((string)($data['name']??''));$email=mb_strtolower(trim((string)($data['email']??'')));$password=(string)($data['password']??'');
    if (!$name || mb_strlen($name)>180 || strlen($email)>190 || !filter_var($email,FILTER_VALIDATE_EMAIL) || ($password!=='' && (strlen($password)<8 || strlen($password)>72))) respond(['ok'=>false,'error'=>'Informe nome, e-mail válido e senha de 8 a 72 caracteres.'],422);
    $placeIds=$data['place_ids']??null;
    if (!is_array($placeIds) || !$placeIds) respond(['ok'=>false,'error'=>'Selecione pelo menos um local permitido.'],422);
    $placeIds=array_values(array_unique(array_map('intval',$placeIds)));
    $stmt=$pdo->prepare('SELECT id FROM places WHERE user_id=?');$stmt->execute([$userId]);
    $owned=array_map('intval',$stmt->fetchAll(PDO::FETCH_COLUMN));
    if (array_diff($placeIds,$owned)) respond(['ok'=>false,'error'=>'Selecione apenas locais do seu cadastro.'],422);
    $stmt=$pdo->prepare('SELECT id,secretary_owner_id FROM users WHERE email=?');$stmt->execute([$email]);$existing=$stmt->fetch();
    if ($existing && (int)$existing['secretary_owner_id']!==$userId) respond(['ok'=>false,'error'=>'E-mail já cadastrado em outra conta.'],409);
    if ($existing) {
        $params=[$name,json_encode($placeIds)];
        $sql='UPDATE users SET name=?,secretary_place_ids=?,secretary_enabled=1';
        if ($password!=='') { $sql.=',password_hash=?';$params[]=password_hash($password,PASSWORD_DEFAULT); }
        $stmt=$pdo->prepare($sql.' WHERE id=? AND secretary_owner_id=?');
        $stmt->execute([...$params,$existing['id'],$userId]);
    } else {
        if ($password==='') respond(['ok'=>false,'error'=>'Informe uma senha para o novo acesso.'],422);
        $stmt=$pdo->prepare("INSERT INTO users (title,name,cpf,specialty,crm,rqe,email,password_hash,secretary_owner_id,secretary_place_ids) VALUES ('',?,'','','','',?,?,?,?)");
        $stmt->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT),$userId,json_encode($placeIds)]);
    }
    respond(['ok'=>true]);
}
