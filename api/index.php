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
    $schemaTable = 'patients';
    $pdo->exec("CREATE TABLE IF NOT EXISTS patients (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(180) NOT NULL,
        cpf CHAR(11) NOT NULL,
        birth_date DATE NOT NULL,
        phone VARCHAR(30) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_patient_user_cpf (user_id, cpf),
        INDEX idx_patients_user_name (user_id, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    if (!$pdo->query("SHOW COLUMNS FROM patients LIKE 'phone'")->fetch()) {
        $pdo->exec("ALTER TABLE patients ADD COLUMN phone VARCHAR(30) NOT NULL DEFAULT '' AFTER birth_date");
    }
    $schemaTable = 'appointments';
    $pdo->exec("CREATE TABLE IF NOT EXISTS appointments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        patient_id BIGINT UNSIGNED NOT NULL,
        place_id BIGINT UNSIGNED NOT NULL,
        place_name VARCHAR(180) NOT NULL DEFAULT '',
        document_type VARCHAR(30) NOT NULL,
        document_title VARCHAR(180) NOT NULL,
        document_text MEDIUMTEXT NOT NULL,
        document_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_appointments_patient (user_id, patient_id, created_at),
        INDEX idx_appointments_place (user_id, place_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    if (!$pdo->query("SHOW COLUMNS FROM appointments LIKE 'place_name'")->fetch()) {
        $pdo->exec("ALTER TABLE appointments ADD COLUMN place_name VARCHAR(180) NOT NULL DEFAULT '' AFTER place_id");
        $pdo->exec("UPDATE appointments a JOIN places p ON p.id=a.place_id AND p.user_id=a.user_id SET a.place_name=p.name WHERE a.place_name=''");
    }
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

    if (in_array($action, ['forgot', 'reset-password'], true)) {
        require_once __DIR__ . '/password-reset.php';
        if ($action === 'forgot') requestPasswordReset($pdo, $data);
        finishPasswordReset($pdo, $data);
    }

    $userId = requireUser();

    if (str_starts_with($action, 'medicines.')) {
        require_once __DIR__ . '/medicines.php';
        handleMedicines($pdo, $userId, $action, $data);
    }

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

    if ($action === 'patients.list') {
        $stmt = $pdo->prepare('SELECT p.id,p.name,p.cpf,p.birth_date,p.phone,COUNT(a.id) AS appointments FROM patients p LEFT JOIN appointments a ON a.patient_id=p.id AND a.user_id=p.user_id WHERE p.user_id=? GROUP BY p.id ORDER BY p.name,p.id');
        $stmt->execute([$userId]);
        respond(['ok' => true, 'items' => $stmt->fetchAll()]);
    }
    if ($action === 'patients.history') {
        $patientId = (int)($data['id'] ?? 0);
        $stmt = $pdo->prepare('SELECT id,name,cpf,birth_date,phone FROM patients WHERE id=? AND user_id=?');
        $stmt->execute([$patientId,$userId]);
        $patient = $stmt->fetch();
        if (!$patient) respond(['ok' => false, 'error' => 'Paciente não encontrado.'], 404);
        $stmt = $pdo->prepare("SELECT a.id,a.document_type,a.document_title,a.document_text,a.document_date,a.created_at,COALESCE(NULLIF(a.place_name,''),p.name) AS place_name FROM appointments a LEFT JOIN places p ON p.id=a.place_id AND p.user_id=a.user_id WHERE a.patient_id=? AND a.user_id=? ORDER BY a.created_at DESC,a.id DESC");
        $stmt->execute([$patientId,$userId]);
        respond(['ok' => true, 'patient' => $patient, 'items' => $stmt->fetchAll()]);
    }
    if ($action === 'patients.delete') {
        $patientId = (int)($data['id'] ?? 0);
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT id FROM patients WHERE id=? AND user_id=? FOR UPDATE');
        $stmt->execute([$patientId, $userId]);
        if (!$stmt->fetch()) {
            $pdo->rollBack();
            respond(['ok' => false, 'error' => 'Paciente não encontrado.'], 404);
        }
        $stmt = $pdo->prepare('DELETE FROM appointments WHERE patient_id=? AND user_id=?');
        $stmt->execute([$patientId, $userId]);
        $stmt = $pdo->prepare('DELETE FROM patients WHERE id=? AND user_id=?');
        $stmt->execute([$patientId, $userId]);
        $pdo->commit();
        respond(['ok' => true]);
    }
    if (in_array($action, ['patients.save', 'patients.update', 'appointments.save'], true)) {
        $name = trim((string)($data['name'] ?? ''));
        $cpf = preg_replace('/\D/', '', (string)($data['cpf'] ?? ''));
        $birth = (string)($data['birth_date'] ?? '');
        $phone = trim((string)($data['phone'] ?? ''));
        $birthDate = DateTimeImmutable::createFromFormat('!Y-m-d', $birth);
        if (mb_strlen($name) < 3 || mb_strlen($name) > 180 || !preg_match('/^\d{11}$/', $cpf) || !$birthDate || $birthDate->format('Y-m-d') !== $birth || $birthDate > new DateTimeImmutable('today')) {
            respond(['ok' => false, 'error' => 'Informe nome completo, CPF com 11 dígitos e data de nascimento válida.'], 422);
        }
        if (mb_strlen($phone) > 30) respond(['ok' => false, 'error' => 'O telefone deve ter no máximo 30 caracteres.'], 422);
        if ($action === 'patients.update') {
            $patientId = (int)($data['id'] ?? 0);
            $stmt = $pdo->prepare('SELECT id FROM patients WHERE id=? AND user_id=?');
            $stmt->execute([$patientId, $userId]);
            if (!$stmt->fetch()) respond(['ok' => false, 'error' => 'Paciente não encontrado.'], 404);
            $stmt = $pdo->prepare('UPDATE patients SET name=?,cpf=?,birth_date=?,phone=? WHERE id=? AND user_id=?');
            $stmt->execute([$name, $cpf, $birth, $phone, $patientId, $userId]);
            respond(['ok' => true, 'patient_id' => $patientId]);
        }
        if ($action === 'appointments.save') {
            $placeId = (int)($data['place_id'] ?? 0);
            $stmt = $pdo->prepare('SELECT id,name FROM places WHERE id=? AND user_id=?');
            $stmt->execute([$placeId, $userId]);
            $place = $stmt->fetch();
            if (!$place) respond(['ok' => false, 'error' => 'Local de atendimento inválido.'], 422);
            $type = (string)($data['document_type'] ?? '');
            $title = trim((string)($data['document_title'] ?? ''));
            $text = trim((string)($data['document_text'] ?? ''));
            $date = (string)($data['document_date'] ?? '');
            $documentDate = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
            if (!in_array($type, ['simples','especial','atestado','laudo','fisioterapia','exame'], true) || $title === '' || mb_strlen($title) > 180 || $text === '' || !$documentDate || $documentDate->format('Y-m-d') !== $date) {
                respond(['ok' => false, 'error' => 'Preencha o tipo, texto e data do documento.'], 422);
            }
        }
        $pdo->beginTransaction();
        $stmt = $pdo->prepare($action === 'patients.save'
            ? 'INSERT INTO patients (user_id,name,cpf,birth_date,phone) VALUES (?,?,?,?,?)'
            : 'INSERT INTO patients (user_id,name,cpf,birth_date,phone) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),birth_date=VALUES(birth_date),id=LAST_INSERT_ID(id)');
        $stmt->execute([$userId,$name,$cpf,$birth,$phone]);
        $patientId = (int)$pdo->lastInsertId();
        if ($action === 'appointments.save') {
            $stmt = $pdo->prepare('INSERT INTO appointments (user_id,patient_id,place_id,place_name,document_type,document_title,document_text,document_date) VALUES (?,?,?,?,?,?,?,?)');
            $stmt->execute([$userId,$patientId,$placeId,$place['name'],$type,$title,$text,$date]);
            $appointmentId = (int)$pdo->lastInsertId();
        }
        $pdo->commit();
        respond(['ok' => true, 'patient_id' => $patientId, 'appointment_id' => $appointmentId ?? null]);
    }

    if ($action === 'models.list') {
        $stmt = $pdo->prepare('SELECT id,name,type,text FROM models WHERE user_id=? AND category=? ORDER BY name,id');
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
    if ((int)$e->errorInfo[1] === 1062) respond(['ok' => false, 'error' => str_starts_with($action, 'patients.') ? 'Este CPF já está cadastrado. Use o botão Editar na lista de pacientes.' : 'Este e-mail já está cadastrado.'], 409);
    respond(['ok' => false, 'error' => 'Não foi possível concluir a operação.'], 500);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => 'Erro interno.'], 500);
}
