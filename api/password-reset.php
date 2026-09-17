<?php
declare(strict_types=1);

function resetSchema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS password_resets (
        user_id BIGINT UNSIGNED PRIMARY KEY,
        token_hash CHAR(64) NOT NULL UNIQUE,
        email VARCHAR(190) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        requested_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS reset_rate_limits (
        bucket CHAR(64) PRIMARY KEY,
        attempts INT UNSIGNED NOT NULL,
        expires_at DATETIME NOT NULL
    ) ENGINE=InnoDB");
}

function resetMailConfig(): array {
    $path = __DIR__ . '/mail.local.php';
    $config = is_file($path) ? require $path : [];
    return array_merge([
        'host' => 'smtp.hostinger.com', 'port' => 465,
        'username' => 'suporte@receitaflow.drdanielleite.com.br',
        'password' => getenv('SMTP_PASSWORD') ?: '',
        'from' => 'suporte@receitaflow.drdanielleite.com.br',
        'site_url' => 'https://receita.drdanielleite.com.br/',
    ], $config);
}

function sendResetEmail(array $config, string $email, string $token): void {
    require_once __DIR__ . '/vendor/phpmailer/src/Exception.php';
    require_once __DIR__ . '/vendor/phpmailer/src/PHPMailer.php';
    require_once __DIR__ . '/vendor/phpmailer/src/SMTP.php';
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $config['host'];
    $mail->Port = (int)$config['port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['username'];
    $mail->Password = $config['password'];
    $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    $mail->Timeout = 15;
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($config['from'], 'Flow Receita');
    $mail->addAddress($email);
    $mail->Subject = 'Crie uma nova senha — Flow Receita';
    $url = rtrim($config['site_url'], '/') . '/#reset-password=' . $token;
    $mail->Body = "Recebemos uma solicitação para redefinir sua senha no Flow Receita.\n\n" .
        "Abra o link abaixo para criar uma nova senha:\n" . $url . "\n\n" .
        "O link expira em 30 minutos e pode ser utilizado uma única vez.\n" .
        "Se você não solicitou essa alteração, ignore este e-mail. Sua senha permanece a mesma.\n\nFlow Receita";
    $mail->send();
}

function requestPasswordReset(PDO $pdo, array $data, ?array $config = null, ?callable $send = null): void {
    $email = mb_strtolower(trim((string)($data['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        respond(['ok' => false, 'error' => 'Informe um e-mail válido.'], 422);
    }
    $config ??= resetMailConfig();
    if (empty($config['password'])) respond(['ok' => false, 'error' => 'A recuperação por e-mail está temporariamente indisponível. Entre em contato com o suporte.'], 503);
    resetSchema($pdo);
    // Limit both addresses and origin IPs, without storing their raw values.
    $pdo->exec('DELETE FROM reset_rate_limits WHERE expires_at < UTC_TIMESTAMP()');
    $pdo->exec('DELETE FROM password_resets WHERE expires_at < UTC_TIMESTAMP()');
    foreach (['ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 'email:' . $email] as $key) {
        $bucket = hash('sha256', $key . ':' . gmdate('Y-m-d-H'));
        $stmt = $pdo->prepare('INSERT INTO reset_rate_limits (bucket,attempts,expires_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR)) ON DUPLICATE KEY UPDATE attempts=attempts+1');
        $stmt->execute([$bucket]);
        $stmt = $pdo->prepare('SELECT attempts FROM reset_rate_limits WHERE bucket=?');
        $stmt->execute([$bucket]);
        if ((int)$stmt->fetchColumn() > 10) respond(['ok' => false, 'error' => 'Muitas solicitações. Tente novamente em uma hora.'], 429);
    }
    $result = ['ok' => true, 'message' => 'Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também a pasta de spam.'];
    $stmt = $pdo->prepare('SELECT id,email,password_hash FROM users WHERE email=?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user) respond($result);
    $stmt = $pdo->prepare('SELECT user_id FROM password_resets WHERE user_id=? AND requested_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)');
    $stmt->execute([$user['id']]);
    if ($stmt->fetch()) respond($result);
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare('INSERT INTO password_resets (user_id,token_hash,email,password_hash,expires_at,requested_at) VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),email=VALUES(email),password_hash=VALUES(password_hash),expires_at=VALUES(expires_at),requested_at=VALUES(requested_at)');
    $stmt->execute([$user['id'], $hash, $user['email'], $user['password_hash']]);
    try {
        ($send ?? 'sendResetEmail')($config, $user['email'], $token);
    } catch (Throwable $e) {
        $stmt = $pdo->prepare('DELETE FROM password_resets WHERE token_hash=?');
        $stmt->execute([$hash]);
        // Do not log SMTP credentials, addresses, or reset links.
        error_log('Flow Receita: envio SMTP de recuperação falhou.');
        respond(['ok' => false, 'error' => 'Não foi possível enviar o e-mail agora. Tente novamente mais tarde.'], 503);
    }
    respond($result);
}

function finishPasswordReset(PDO $pdo, array $data): void {
    $token = (string)($data['token'] ?? '');
    $password = (string)($data['password'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) respond(['ok' => false, 'error' => 'Link inválido. Solicite uma nova recuperação.'], 422);
    if (strlen($password) < 8 || strlen($password) > 72) respond(['ok' => false, 'error' => 'A nova senha deve ter entre 8 e 72 caracteres.'], 422);
    resetSchema($pdo);
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM password_resets WHERE token_hash=? AND expires_at > UTC_TIMESTAMP() FOR UPDATE');
        $stmt->execute([hash('sha256', $token)]);
        $reset = $stmt->fetch();
        if (!$reset) {
            $pdo->rollBack();
            respond(['ok' => false, 'error' => 'O link expirou ou já foi utilizado. Solicite uma nova recuperação.'], 422);
        }
        // Invalidate the link if the account email or password changed since it was issued.
        $stmt = $pdo->prepare('UPDATE users SET password_hash=? WHERE id=? AND email=? AND password_hash=?');
        $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $reset['user_id'], $reset['email'], $reset['password_hash']]);
        $changed = $stmt->rowCount() === 1;
        $stmt = $pdo->prepare('DELETE FROM password_resets WHERE user_id=?');
        $stmt->execute([$reset['user_id']]);
        $pdo->commit();
        if (!$changed) respond(['ok' => false, 'error' => 'Este link não é mais válido. Solicite uma nova recuperação.'], 422);
        $_SESSION = [];
        session_regenerate_id(true);
        respond(['ok' => true, 'message' => 'Senha atualizada. Entre com seu e-mail e a nova senha.']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
