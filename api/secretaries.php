<?php
declare(strict_types=1);

function secretaryAllowedAction(string $action): bool {
    return in_array($action, ['schedule.list','schedule.save','patients.list','patients.save','patients.update','places.list'], true);
}

function authorizeSchedulingUser(PDO $pdo, int $userId, string $action): int {
    $stmt=$pdo->prepare('SELECT secretary_owner_id,secretary_enabled FROM users WHERE id=?');
    $stmt->execute([$userId]); $user=$stmt->fetch();
    if (!$user || !$user['secretary_enabled']) respond(['ok'=>false,'error'=>'Acesso desativado.'],401);
    if (!$user['secretary_owner_id']) return $userId;
    if (!secretaryAllowedAction($action)) respond(['ok'=>false,'error'=>'A secretaria tem acesso somente à agenda e ao cadastro de pacientes.'],403);
    return (int)$user['secretary_owner_id'];
}

function handleSecretaries(PDO $pdo, int $userId, string $action, array $data): never {
    if ($action==='secretaries.list') {
        $stmt=$pdo->prepare('SELECT id,name,email,secretary_enabled FROM users WHERE secretary_owner_id=? ORDER BY name');$stmt->execute([$userId]);
        respond(['ok'=>true,'items'=>$stmt->fetchAll()]);
    }
    if ($action==='secretaries.disable') {
        $stmt=$pdo->prepare('UPDATE users SET secretary_enabled=0 WHERE id=? AND secretary_owner_id=?');$stmt->execute([(int)($data['id']??0),$userId]);
        respond(['ok'=>true]);
    }
    if ($action!=='secretaries.save') respond(['ok'=>false,'error'=>'Operação inválida.'],404);
    $name=trim((string)($data['name']??''));$email=mb_strtolower(trim((string)($data['email']??'')));$password=(string)($data['password']??'');
    if (!$name || mb_strlen($name)>180 || strlen($email)>190 || !filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($password)<8 || strlen($password)>72) respond(['ok'=>false,'error'=>'Informe nome, e-mail válido e senha de 8 a 72 caracteres.'],422);
    $stmt=$pdo->prepare('SELECT id,secretary_owner_id FROM users WHERE email=?');$stmt->execute([$email]);$existing=$stmt->fetch();
    if ($existing && (int)$existing['secretary_owner_id']!==$userId) respond(['ok'=>false,'error'=>'E-mail já cadastrado em outra conta.'],409);
    if ($existing) {
        $stmt=$pdo->prepare('UPDATE users SET name=?,password_hash=?,secretary_enabled=1 WHERE id=? AND secretary_owner_id=?');
        $stmt->execute([$name,password_hash($password,PASSWORD_DEFAULT),$existing['id'],$userId]);
    } else {
        $stmt=$pdo->prepare("INSERT INTO users (title,name,cpf,specialty,crm,rqe,email,password_hash,secretary_owner_id) VALUES ('',?,'','','','',?,?,?)");
        $stmt->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT),$userId]);
    }
    respond(['ok'=>true]);
}
