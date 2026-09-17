<?php
declare(strict_types=1);

session_set_cookie_params([
    'httponly' => true,
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'samesite' => 'Strict',
    'path' => '/',
]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Configure o banco por variáveis de ambiente ou api/config.local.php (não versionado).
$configPath = __DIR__ . '/config.local.php';
$dbConfig = is_file($configPath) ? require $configPath : [];
define('DB_HOST', $dbConfig['host'] ?? (getenv('DB_HOST') ?: 'localhost'));
define('DB_NAME', $dbConfig['name'] ?? (getenv('DB_NAME') ?: ''));
define('DB_USER', $dbConfig['user'] ?? (getenv('DB_USER') ?: ''));
define('DB_PASS', $dbConfig['password'] ?? (getenv('DB_PASS') ?: ''));

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function requireUser(): int {
    if (empty($_SESSION['user_id'])) respond(['ok' => false, 'error' => 'Não autenticado'], 401);
    return (int) $_SESSION['user_id'];
}

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    error_log('Flow Receita MySQL connect: ' . $e->getMessage());
    $mysqlCode = ($e instanceof PDOException && isset($e->errorInfo[1])) ? (string)$e->errorInfo[1] : 'PDO';
    respond([
        'ok' => false,
        'error' => 'Falha na conexão com o banco de dados.',
        'diagnostic' => 'DB_CONNECT_' . $mysqlCode,
        'pdo_mysql' => in_array('mysql', PDO::getAvailableDrivers(), true)
    ], 500);
}

try {
    $schemaTable = 'users';
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(8) NOT NULL,
        name VARCHAR(180) NOT NULL,
        specialty VARCHAR(180) NOT NULL,
        crm VARCHAR(80) NOT NULL,
        rqe VARCHAR(80) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $schemaTable = 'places';
    $pdo->exec("CREATE TABLE IF NOT EXISTS places (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(180) NOT NULL,
        cnes VARCHAR(60) DEFAULT '',
        cnpj VARCHAR(40) DEFAULT '',
        address VARCHAR(255) DEFAULT '',
        phone VARCHAR(60) DEFAULT '',
        logo LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_places_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $schemaTable = 'models';
    $pdo->exec("CREATE TABLE IF NOT EXISTS models (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        category VARCHAR(30) NOT NULL,
        name VARCHAR(180) NOT NULL,
        type VARCHAR(30) DEFAULT 'simples',
        text MEDIUMTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_models_user_category (user_id, category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Throwable $e) {
    error_log('Flow Receita schema [' . ($schemaTable ?? 'unknown') . ']: ' . $e->getMessage());
    $mysqlCode = ($e instanceof PDOException && isset($e->errorInfo[1])) ? (string)$e->errorInfo[1] : 'SQL';
    respond([
        'ok' => false,
        'error' => 'O banco conectou, mas não foi possível preparar as tabelas.',
        'diagnostic' => 'DB_SCHEMA_' . ($schemaTable ?? 'unknown') . '_' . $mysqlCode
    ], 500);
}

$action = (string)($_GET['action'] ?? 'status');
$data = body();

try {
    if ($action === 'status') respond(['ok' => true, 'database' => 'connected']);

    if ($action === 'register') {
        $email = mb_strtolower(trim((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
            respond(['ok' => false, 'error' => 'Informe um e-mail válido e senha com pelo menos 8 caracteres.'], 422);
        }
        $stmt = $pdo->prepare('INSERT INTO users (title,name,specialty,crm,rqe,email,password_hash) VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([
            trim((string)$data['title']), trim((string)$data['name']), trim((string)$data['specialty']),
            trim((string)$data['crm']), trim((string)$data['rqe']), $email, password_hash($password, PASSWORD_DEFAULT)
        ]);
        respond(['ok' => true]);
    }

    if ($action === 'login') {
        $email = mb_strtolower(trim((string)($data['email'] ?? '')));
        $stmt = $pdo->prepare('SELECT * FROM users WHERE email=? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if (!$user || !password_verify((string)($data['password'] ?? ''), $user['password_hash'])) {
            respond(['ok' => false, 'error' => 'E-mail ou senha inválidos.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$user['id'];
        unset($user['password_hash']);
        respond(['ok' => true, 'user' => $user]);
    }

    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        respond(['ok' => true]);
    }

    if ($action === 'forgot') {
        respond(['ok' => true]);
    }

    $userId = requireUser();

    if ($action === 'profile.update') {
        $values = [];
        foreach (['title', 'name', 'specialty', 'crm', 'rqe', 'email'] as $field) {
            $values[$field] = trim((string)($data[$field] ?? ''));
            if ($values[$field] === '') respond(['ok' => false, 'error' => 'Preencha todos os dados do perfil.'], 422);
        }
        $values['email'] = mb_strtolower($values['email']);
        if (!in_array($values['title'], ['Dr.', 'Dra.'], true) || !filter_var($values['email'], FILTER_VALIDATE_EMAIL)) {
            respond(['ok' => false, 'error' => 'Informe um tratamento e e-mail válidos.'], 422);
        }
        foreach (['title' => 8, 'name' => 180, 'specialty' => 180, 'crm' => 80, 'rqe' => 80, 'email' => 190] as $field => $limit) {
            if (mb_strlen($values[$field]) > $limit) respond(['ok' => false, 'error' => 'O campo ' . $field . ' excede o tamanho permitido.'], 422);
        }
        $stmt = $pdo->prepare('UPDATE users SET title=?,name=?,specialty=?,crm=?,rqe=?,email=? WHERE id=?');
        $stmt->execute([...array_values($values), $userId]);
        respond(['ok' => true, 'user' => $values]);
    }

    if ($action === 'places.list') {
        $stmt = $pdo->prepare('SELECT id,name,cnes,cnpj,address,phone,logo FROM places WHERE user_id=? ORDER BY name');
        $stmt->execute([$userId]);
        respond(['ok' => true, 'items' => $stmt->fetchAll()]);
    }
    if ($action === 'places.save') {
        $id = (int)($data['id'] ?? 0);
        $values = [trim((string)$data['name']), trim((string)($data['cnes'] ?? '')), trim((string)($data['cnpj'] ?? '')), trim((string)($data['address'] ?? '')), trim((string)($data['phone'] ?? '')), (string)($data['logo'] ?? '')];
        if ($id) {
            $stmt = $pdo->prepare('UPDATE places SET name=?,cnes=?,cnpj=?,address=?,phone=?,logo=? WHERE id=? AND user_id=?');
            $stmt->execute([...$values, $id, $userId]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO places (name,cnes,cnpj,address,phone,logo,user_id) VALUES (?,?,?,?,?,?,?)');
            $stmt->execute([...$values, $userId]);
            $id = (int)$pdo->lastInsertId();
        }
        respond(['ok' => true, 'id' => $id]);
    }
    if ($action === 'places.delete') {
        $stmt = $pdo->prepare('DELETE FROM places WHERE id=? AND user_id=?');
        $stmt->execute([(int)$data['id'], $userId]);
        respond(['ok' => true]);
    }

    if ($action === 'models.list') {
        $stmt = $pdo->prepare('SELECT id,name,type,text FROM models WHERE user_id=? AND category=? ORDER BY updated_at DESC');
        $stmt->execute([$userId, (string)$data['category']]);
        respond(['ok' => true, 'items' => $stmt->fetchAll()]);
    }
    if ($action === 'models.save') {
        $id = (int)($data['id'] ?? 0);
        $category = (string)$data['category'];
        if ($id) {
            $stmt = $pdo->prepare('UPDATE models SET name=?,type=?,text=? WHERE id=? AND user_id=? AND category=?');
            $stmt->execute([trim((string)$data['name']), (string)($data['type'] ?? 'simples'), (string)$data['text'], $id, $userId, $category]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO models (user_id,category,name,type,text) VALUES (?,?,?,?,?)');
            $stmt->execute([$userId, $category, trim((string)$data['name']), (string)($data['type'] ?? 'simples'), (string)$data['text']]);
            $id = (int)$pdo->lastInsertId();
        }
        respond(['ok' => true, 'id' => $id]);
    }
    if ($action === 'models.delete') {
        $stmt = $pdo->prepare('DELETE FROM models WHERE id=? AND user_id=? AND category=?');
        $stmt->execute([(int)$data['id'], $userId, (string)$data['category']]);
        respond(['ok' => true]);
    }

    respond(['ok' => false, 'error' => 'Ação inválida.'], 404);
} catch (PDOException $e) {
    if ((int)$e->errorInfo[1] === 1062) respond(['ok' => false, 'error' => 'Este e-mail já está cadastrado.'], 409);
    respond(['ok' => false, 'error' => 'Não foi possível concluir a operação.'], 500);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => 'Erro interno.'], 500);
}
