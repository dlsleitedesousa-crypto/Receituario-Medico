<?php
declare(strict_types=1);

// Assinatura PAdES ICP-Brasil com carimbo do tempo pela API HUB Signer da BRy.
// O certificado pode estar no BRy KMS (PIN) ou em um PSC em nuvem (BirdID, VIDaaS etc.) conectado pelo Integra BRy.

final class SignatureFailure extends RuntimeException {
    public function __construct(string $message, public int $status = 502, public int $upstream = 0) { parent::__construct($message); }
}

const SIGNATURE_TYPES = ['simples' => 'Receita', 'especial' => 'Receita de controle especial', 'atestado' => 'Atestado', 'laudo' => 'Laudo', 'exame' => 'Solicitação de exames', 'fisioterapia' => 'Solicitação de fisioterapia'];
const SIGNATURE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function signatureSchema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS signed_documents (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        public_id CHAR(32) NOT NULL UNIQUE,
        secret_hash VARCHAR(255) NOT NULL,
        doc_type VARCHAR(30) NOT NULL,
        status VARCHAR(16) NOT NULL,
        sha256 CHAR(64) NULL,
        created_at DATETIME NOT NULL,
        signed_at DATETIME NULL,
        INDEX idx_signed_documents_user (user_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS signature_rate_limits (
        bucket CHAR(64) PRIMARY KEY,
        attempts INT UNSIGNED NOT NULL,
        expires_at DATETIME NOT NULL
    ) ENGINE=InnoDB");
    $pdo->exec("CREATE TABLE IF NOT EXISTS signature_psc_sessions (
        user_id BIGINT UNSIGNED PRIMARY KEY,
        psc VARCHAR(40) NOT NULL,
        state_hash CHAR(64) NOT NULL UNIQUE,
        token TEXT NOT NULL,
        status VARCHAR(16) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function signatureConfig(): array {
    $path = __DIR__ . '/bry.local.php';
    $config = is_file($path) ? require $path : [];
    $production = ($config['environment'] ?? getenv('BRY_ENVIRONMENT') ?: 'homologacao') === 'producao';
    $config = array_merge([
        'client_id' => getenv('BRY_CLIENT_ID') ?: '',
        'client_secret' => getenv('BRY_CLIENT_SECRET') ?: '',
        'storage_dir' => getenv('BRY_STORAGE_DIR') ?: '',
        'token_url' => $production ? 'https://cloud.bry.com.br/token-service/jwt' : 'https://cloud-hom.bry.com.br/token-service/jwt',
        'hub_url' => $production ? 'https://hub2.bry.com.br' : 'https://hub2.hom.bry.com.br',
        'integra_url' => $production ? 'https://integra.bry.com.br/api/service' : 'https://integra.hom.bry.com.br/api/service',
        'psc_lifetime' => 28800,
        'profile' => 'TIMESTAMP',
        'policy_oid' => '',
        'site_url' => 'https://receita.drdanielleite.com.br',
    ], $config);
    // Carimbo do profissional no canto inferior direito da última página, ao lado do QR Code.
    $config['stamp'] = array_merge(['pagina' => 'ULTIMA', 'posicao' => 'INFERIOR_DIREITO', 'coordenadaX' => 10, 'coordenadaY' => 5, 'largura' => 80, 'altura' => 22, 'proporcaoImagem' => 35], $config['stamp'] ?? []);
    return $config;
}

function signatureEnabled(array $config): bool {
    return $config['client_id'] !== '' && $config['client_secret'] !== '' && $config['storage_dir'] !== '';
}

function signatureStorage(array $config): string {
    $dir = rtrim((string)$config['storage_dir'], '/\\');
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new SignatureFailure('A pasta dos documentos assinados não está disponível no servidor.', 503);
    $real = (string)realpath($dir);
    $root = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    // Os PDFs só podem ser entregues pela API, nunca por URL direta.
    if ($root && str_starts_with($real . DIRECTORY_SEPARATOR, rtrim($root, '/\\') . DIRECTORY_SEPARATOR)) {
        throw new SignatureFailure('A pasta dos documentos assinados deve ficar fora da pasta pública do site.', 503);
    }
    return $real;
}

function bryCurl(string $url, array $headers, array|string|null $body): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 90, CURLOPT_HTTPHEADER => $headers]);
    if ($body !== null) curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body]);
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($response === false) {
        error_log('Flow Receita BRy: ' . $error);
        throw new SignatureFailure('O serviço de assinatura da BRy não respondeu. Tente novamente em instantes.');
    }
    return ['status' => $status, 'body' => (string)$response];
}

function bryAccessToken(array $config, callable $http): string {
    $cache = signatureStorage($config) . '/.bry-token.json';
    $cached = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
    if (is_array($cached) && ($cached['client_id'] ?? '') === $config['client_id'] && (int)($cached['expires_at'] ?? 0) > time() + 60) return (string)$cached['token'];
    $response = $http($config['token_url'], ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'grant_type' => 'client_credentials', 'client_id' => $config['client_id'], 'client_secret' => $config['client_secret'],
    ]));
    $result = json_decode($response['body'], true);
    if ($response['status'] !== 200 || !is_string($result['access_token'] ?? null)) {
        error_log('Flow Receita BRy token: HTTP ' . $response['status']);
        throw new SignatureFailure('Não foi possível autenticar na BRy. Confira as credenciais da aplicação no servidor.');
    }
    file_put_contents($cache, json_encode(['client_id' => $config['client_id'], 'token' => $result['access_token'], 'expires_at' => time() + (int)($result['expires_in'] ?? 300)]), LOCK_EX);
    @chmod($cache, 0600);
    return $result['access_token'];
}

function signedPdfLooksValid(string $bytes): bool {
    return str_starts_with($bytes, '%PDF-') && str_contains($bytes, '/ByteRange') && str_contains($bytes, '/Contents');
}

// $kms: ['type' => 'BRYKMS'|'PSC', 'data' => kms_data] conforme a documentação do HUB Signer.
function brySign(array $config, callable $http, string $pdf, array $kms, ?array $image, bool $retry = true): string {
    $signature = [
        'perfil' => $config['profile'], 'algoritmoHash' => 'SHA256', 'tipoRetorno' => 'BASE64',
        'tipoRestricao' => 'DESABILITAR_QUALQUER_ALTERACAO', 'razao' => 'Documento médico emitido no Flow Receita',
        'kms_data' => $kms['data'],
    ];
    $fields = [
        'documento[0]' => new CURLStringFile($pdf, 'documento.pdf', 'application/pdf'),
        'dados_assinatura' => json_encode($signature, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'configuracao_imagem[0]' => json_encode($config['stamp']),
        'configuracao_texto[0]' => json_encode(['texto' => 'Assinado digitalmente (ICP-Brasil)', 'incluirCN' => true, 'incluirCPF' => true, 'fonte' => 'HELVETICA', 'tamanhoFonte' => 7]),
    ];
    if ($config['policy_oid'] !== '') $fields['oidPolitica'] = $config['policy_oid'];
    if ($image) $fields['imagem[0]'] = new CURLStringFile($image['bytes'], 'assinatura.' . $image['ext'], $image['mime']);
    $response = $http(rtrim($config['hub_url'], '/') . '/fw/v1/pdf/kms/lote/assinaturas', ['Authorization: Bearer ' . bryAccessToken($config, $http), 'kms_type: ' . $kms['type']], $fields);
    if ($response['status'] === 401 && $retry) {
        @unlink(signatureStorage($config) . '/.bry-token.json');
        return brySign($config, $http, $pdf, $kms, $image, false);
    }
    $result = json_decode($response['body'], true);
    if ($response['status'] !== 200) {
        // O corpo enviado contém o PIN ou o token do PSC; registre apenas a resposta da BRy.
        $message = is_array($result) && is_string($result['message'] ?? null) ? mb_substr($result['message'], 0, 300) : 'HTTP ' . $response['status'];
        error_log('Flow Receita BRy sign: HTTP ' . $response['status'] . ' ' . $message . ' ' . (string)($result['traceId'] ?? ''));
        $client = $response['status'] >= 400 && $response['status'] < 500;
        throw new SignatureFailure(($client ? 'A BRy recusou a assinatura: ' : 'A BRy não concluiu a assinatura: ') . $message, $client ? 422 : 502, $response['status']);
    }
    $signed = is_array($result) && is_string($result[0] ?? null) ? base64_decode($result[0], true) : false;
    if (!is_string($signed) || !signedPdfLooksValid($signed)) throw new SignatureFailure('A BRy não devolveu um PDF assinado.');
    return $signed;
}

// O token do PSC autoriza assinaturas em nome do médico: fica cifrado no banco com uma chave derivada do client_secret.
function pscKey(array $config): string {
    return hash('sha256', 'flow-receita-psc:' . $config['client_secret'], true);
}

function pscEncrypt(array $config, string $plain): string {
    $iv = random_bytes(12);
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', pscKey($config), OPENSSL_RAW_DATA, $iv, $tag);
    return base64_encode($iv . $tag . $cipher);
}

function pscDecrypt(array $config, string $stored): ?string {
    $raw = base64_decode($stored, true);
    if ($raw === false || strlen($raw) <= 28) return null;
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', pscKey($config), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $plain === false ? null : $plain;
}

// PSCs em que o CPF tem certificado; sem resultado, mostra todos os disponíveis.
function pscList(array $config, callable $http, string $cpf): array {
    $cache = signatureStorage($config) . '/.psc-list-' . substr(hash('sha256', $cpf), 0, 16) . '.json';
    $cached = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
    if (is_array($cached) && (int)($cached['expires_at'] ?? 0) > time()) return $cached['names'];
    $names = [];
    foreach ($cpf !== '' ? ['?cpf=' . $cpf, ''] : [''] as $query) {
        $response = $http(rtrim($config['integra_url'], '/') . '/psc/list' . $query, ['Authorization: Bearer ' . bryAccessToken($config, $http)], null);
        $result = $response['status'] === 200 ? json_decode($response['body'], true) : null;
        foreach (is_array($result) ? $result : [] as $item) {
            if (is_string($item['name'] ?? null) && preg_match('/^[\w .-]{1,40}$/u', $item['name'])) $names[] = $item['name'];
        }
        if ($names) break;
    }
    if ($names) file_put_contents($cache, json_encode(['names' => $names, 'expires_at' => time() + 3600]), LOCK_EX);
    return $names;
}

function pscSession(PDO $pdo, int $userId): ?array {
    $stmt = $pdo->prepare('SELECT psc,token,status,expires_at,created_at FROM signature_psc_sessions WHERE user_id=? AND expires_at > ?');
    $stmt->execute([$userId, gmdate('Y-m-d H:i:s')]);
    $session = $stmt->fetch() ?: null;
    // Autorizações pendentes valem por 15 minutos.
    if ($session && $session['status'] === 'pending' && $session['created_at'] < gmdate('Y-m-d H:i:s', time() - 900)) return null;
    return $session;
}

function signatureImage(?string $dataUrl): ?array {
    if (!$dataUrl || !preg_match('#^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$#D', $dataUrl, $matches)) return null;
    $bytes = base64_decode($matches[2], true);
    return $bytes === false ? null : ['bytes' => $bytes, 'mime' => 'image/' . $matches[1], 'ext' => $matches[1] === 'png' ? 'png' : 'jpg'];
}

function newValidationCode(): string {
    $code = '';
    for ($i = 0; $i < 8; $i++) $code .= SIGNATURE_CODE_ALPHABET[random_int(0, strlen(SIGNATURE_CODE_ALPHABET) - 1)];
    return $code;
}

function normalizeValidationCode(string $code): string {
    return strtoupper((string)preg_replace('/[^A-Za-z0-9]/', '', $code));
}

function validationUrl(array $config, string $publicId): string {
    return rtrim($config['site_url'], '/') . '/v/' . $publicId;
}

function doctorCpf(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare('SELECT cpf,signature FROM users WHERE id=?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch() ?: [];
    return ['cpf' => preg_match('/^\d{11}$/', (string)($user['cpf'] ?? '')) ? (string)$user['cpf'] : '', 'signature' => $user['signature'] ?? null];
}

function handleDigitalSignature(PDO $pdo, int $userId, string $action, array $data, array $files = [], ?array $config = null, ?callable $http = null): void {
    $config ??= signatureConfig();
    $http ??= 'bryCurl';
    if (!signatureEnabled($config)) {
        if ($action === 'signature.status') respond(['ok' => true, 'enabled' => false]);
        respond(['ok' => false, 'error' => 'A assinatura digital ainda não foi configurada no servidor.'], 503);
    }
    signatureSchema($pdo);
    try {
        if ($action === 'signature.status') {
            try { $pscs = pscList($config, $http, doctorCpf($pdo, $userId)['cpf']); }
            catch (SignatureFailure $e) { $pscs = []; }
            $session = pscSession($pdo, $userId);
            respond(['ok' => true, 'enabled' => true, 'pscs' => $pscs, 'psc_session' => $session ? [
                'psc' => $session['psc'], 'status' => $session['status'], 'expires_at' => str_replace(' ', 'T', $session['expires_at']) . 'Z',
            ] : null]);
        }
        if ($action === 'signature.psc.connect') {
            $psc = (string)($data['psc'] ?? '');
            $cpf = doctorCpf($pdo, $userId)['cpf'];
            if ($cpf === '') respond(['ok' => false, 'error' => 'Cadastre seu CPF em Meu perfil antes de conectar o certificado.'], 422);
            if (!in_array($psc, pscList($config, $http, ''), true)) respond(['ok' => false, 'error' => 'Provedor de certificado indisponível.'], 422);
            $state = bin2hex(random_bytes(24));
            $lifetime = max(180, min(604800, (int)$config['psc_lifetime']));
            $response = $http(rtrim($config['integra_url'], '/') . '/psc/link', ['Authorization: Bearer ' . bryAccessToken($config, $http), 'Content-Type: application/json'], json_encode([
                'pscName' => $psc, 'redirectUri' => rtrim($config['site_url'], '/') . '/psc/retorno', 'state' => $state,
                'numberOfDocuments' => 1, 'scope' => 'signature_session', 'lifetime' => $lifetime, 'cpf' => $cpf,
            ], JSON_UNESCAPED_SLASHES));
            $result = json_decode($response['body'], true);
            if ($response['status'] !== 200 || !is_string($result['token'] ?? null) || !str_starts_with((string)($result['url'] ?? ''), 'https://')) {
                error_log('Flow Receita BRy psc/link: HTTP ' . $response['status'] . ' ' . (string)($result['error_description'] ?? ''));
                throw new SignatureFailure('Não foi possível iniciar a conexão com ' . $psc . '. Tente novamente.');
            }
            $pdo->prepare('DELETE FROM signature_psc_sessions WHERE user_id=?')->execute([$userId]);
            $stmt = $pdo->prepare('INSERT INTO signature_psc_sessions (user_id,psc,state_hash,token,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?)');
            $stmt->execute([$userId, $psc, hash('sha256', $state), pscEncrypt($config, $result['token']), 'pending', gmdate('Y-m-d H:i:s', time() + $lifetime), gmdate('Y-m-d H:i:s')]);
            respond(['ok' => true, 'url' => $result['url']]);
        }
        if ($action === 'signature.psc.disconnect') {
            $pdo->prepare('DELETE FROM signature_psc_sessions WHERE user_id=?')->execute([$userId]);
            respond(['ok' => true]);
        }
        if ($action === 'signature.prepare') {
            $type = (string)($data['type'] ?? '');
            if (!isset(SIGNATURE_TYPES[$type])) respond(['ok' => false, 'error' => 'Este tipo de documento não pode ser assinado digitalmente.'], 422);
            $pdo->exec("DELETE FROM signed_documents WHERE status='draft' AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)");
            $publicId = bin2hex(random_bytes(16));
            $code = newValidationCode();
            $stmt = $pdo->prepare('INSERT INTO signed_documents (user_id,public_id,secret_hash,doc_type,status,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())');
            $stmt->execute([$userId, $publicId, password_hash($code, PASSWORD_DEFAULT), $type, 'draft']);
            respond(['ok' => true, 'public_id' => $publicId, 'code' => substr($code, 0, 4) . '-' . substr($code, 4), 'validation_url' => validationUrl($config, $publicId)]);
        }
        if ($action === 'signature.sign') {
            $stmt = $pdo->prepare('SELECT id,public_id,status FROM signed_documents WHERE public_id=? AND user_id=?');
            $stmt->execute([(string)($data['public_id'] ?? ''), $userId]);
            $document = $stmt->fetch();
            if (!$document) respond(['ok' => false, 'error' => 'Documento para assinatura não encontrado. Gere-o novamente.'], 404);
            if ($document['status'] !== 'draft') respond(['ok' => false, 'error' => 'Este documento já foi assinado.'], 409);
            $method = (string)($data['method'] ?? 'kms');
            $pin = (string)($data['pin'] ?? '');
            if ($method === 'kms' && ($pin === '' || strlen($pin) > 64)) respond(['ok' => false, 'error' => 'Informe o PIN do certificado digital.'], 422);
            if (!in_array($method, ['kms', 'psc'], true)) respond(['ok' => false, 'error' => 'Escolha onde está o seu certificado.'], 422);
            $upload = $files['document'] ?? null;
            $valid = is_array($upload) && ($upload['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK && (PHP_SAPI === 'cli' || is_uploaded_file((string)$upload['tmp_name']));
            $pdf = $valid ? (string)file_get_contents((string)$upload['tmp_name']) : '';
            if (!str_starts_with($pdf, '%PDF-') || strlen($pdf) > 15 * 1024 * 1024) respond(['ok' => false, 'error' => 'Envie o documento em PDF com até 15 MB.'], 422);
            $user = doctorCpf($pdo, $userId);
            if ($user['cpf'] === '') respond(['ok' => false, 'error' => 'Cadastre seu CPF em Meu perfil antes de assinar.'], 422);
            if ($method === 'psc') {
                $session = pscSession($pdo, $userId);
                $token = $session && $session['status'] === 'active' ? pscDecrypt($config, $session['token']) : null;
                if ($token === null) respond(['ok' => false, 'error' => 'Conecte novamente o seu certificado em nuvem.', 'reconnect' => true], 409);
                $kms = ['type' => 'PSC', 'data' => ['url' => rtrim($config['integra_url'], '/'), 'token' => $token]];
            } else {
                $kms = ['type' => 'BRYKMS', 'data' => ['user' => $user['cpf'], 'pin' => base64_encode($pin)]];
            }
            try {
                $signed = brySign($config, $http, $pdf, $kms, signatureImage($user['signature']));
            } catch (SignatureFailure $e) {
                // Token do PSC vencido ou revogado: o médico precisa autorizar de novo.
                if ($method === 'psc' && in_array($e->upstream, [401, 403], true)) {
                    $pdo->prepare('DELETE FROM signature_psc_sessions WHERE user_id=?')->execute([$userId]);
                    respond(['ok' => false, 'error' => 'A autorização do certificado em nuvem expirou. Conecte novamente.', 'reconnect' => true], 409);
                }
                throw $e;
            }
            $path = signatureStorage($config) . '/' . $document['public_id'] . '.pdf';
            if (file_put_contents($path . '.tmp', $signed, LOCK_EX) !== strlen($signed) || !rename($path . '.tmp', $path)) {
                throw new SignatureFailure('O documento foi assinado, mas não foi possível salvá-lo no servidor.', 500);
            }
            $stmt = $pdo->prepare("UPDATE signed_documents SET status='signed', sha256=?, signed_at=UTC_TIMESTAMP() WHERE id=? AND status='draft'");
            $stmt->execute([hash('sha256', $signed), $document['id']]);
            respond(['ok' => true, 'public_id' => $document['public_id'], 'file_url' => 'api/index.php?action=signature.file&id=' . $document['public_id']]);
        }
        if ($action === 'signature.file') {
            $stmt = $pdo->prepare("SELECT public_id FROM signed_documents WHERE public_id=? AND user_id=? AND status='signed'");
            $stmt->execute([(string)($_GET['id'] ?? $data['id'] ?? ''), $userId]);
            $publicId = $stmt->fetchColumn();
            if (!$publicId) respond(['ok' => false, 'error' => 'Documento assinado não encontrado.'], 404);
            sendSignedPdf($config, (string)$publicId);
        }
    } catch (SignatureFailure $e) {
        respond(['ok' => false, 'error' => $e->getMessage()], $e->status);
    }
    respond(['ok' => false, 'error' => 'Ação inválida.'], 404);
}

if (!function_exists('signatureOutput')) {
    function signatureOutput(string $contentType, string $body, int $status = 200, array $headers = []): never {
        http_response_code($status);
        header('Content-Type: ' . $contentType);
        foreach ($headers as $header) header($header);
        echo $body;
        exit;
    }
}

function sendSignedPdf(array $config, string $publicId): never {
    $path = signatureStorage($config) . '/' . $publicId . '.pdf';
    $bytes = is_file($path) ? file_get_contents($path) : false;
    if ($bytes === false) respond(['ok' => false, 'error' => 'Arquivo assinado indisponível.'], 404);
    signatureOutput('application/pdf', $bytes, 200, ['Content-Disposition: inline; filename="documento-assinado-' . substr($publicId, 0, 8) . '.pdf"', 'Cache-Control: private, no-store', 'X-Content-Type-Options: nosniff']);
}

function signaturePage(string $title, string $body, string $script = ''): string {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . ' — Flow Receita</title>'
        . '<style>body{margin:0;font-family:system-ui,sans-serif;background:#eef2f6;color:#172033}main{max-width:460px;margin:40px auto;padding:24px 20px;background:#fff;border-radius:14px;box-shadow:0 2px 10px #0001}h1{font-size:20px;margin:0 0 12px}label{display:block;font-weight:600;margin:16px 0 6px}input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px;font-size:18px;letter-spacing:2px;border:1px solid #9ca8b7;border-radius:8px}button{margin-top:12px;width:100%;padding:12px;font-size:16px;border:0;border-radius:8px;background:#1f5fbf;color:#fff}.error{color:#b42318}.hint{font-size:14px;color:#4a5568}</style></head>'
        . '<body><main><h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1>' . $body . '</main>' . $script . '</body></html>';
}

function validationPage(array $config, ?array $document, string $publicId, string $error = ''): string {
    $e = fn(string $value): string => htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    if ($document) {
        $date = (new DateTimeImmutable($document['signed_at'], new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('America/Fortaleza'))->format('d/m/Y \à\s H:i');
        $body = '<p>' . $e(SIGNATURE_TYPES[$document['doc_type']] ?? 'Documento') . ' assinado digitalmente com certificado ICP-Brasil em ' . $e($date) . '.</p>'
            . '<form method="get" action="' . $e(validationUrl($config, $publicId)) . '"><label>Código de validação<input name="secretCode" autocomplete="off" autocapitalize="characters" required maxlength="12" placeholder="XXXX-XXXX"></label>'
            . ($error ? '<p class="error">' . $e($error) . '</p>' : '') . '<button>Abrir documento</button></form>'
            . '<p class="hint">O código está impresso ao lado do QR Code. Também é possível conferir a assinatura do arquivo em <a href="https://validar.iti.gov.br/" rel="noopener">validar.iti.gov.br</a>.</p>';
    } else {
        $body = '<p class="error">Documento não encontrado ou ainda não assinado.</p>';
    }
    return signaturePage('Validação de documento', $body);
}

// Retorno do PSC (via Integra BRy) após o médico autorizar o certificado; chega sem a sessão do site.
function finishPscAuthorization(PDO $pdo, array $query): void {
    signatureSchema($pdo);
    $state = (string)($query['state'] ?? '');
    $session = null;
    if (preg_match('/^[a-f0-9]{48}$/D', $state)) {
        $stmt = $pdo->prepare("SELECT user_id,psc FROM signature_psc_sessions WHERE state_hash=? AND status='pending' AND created_at > ?");
        $stmt->execute([hash('sha256', $state), gmdate('Y-m-d H:i:s', time() - 900)]);
        $session = $stmt->fetch() ?: null;
    }
    $headers = ['Cache-Control: no-store', 'Referrer-Policy: no-referrer'];
    if (!$session) signatureOutput('text/html; charset=utf-8', signaturePage('Autorização não encontrada', '<p class="error">Este link de autorização expirou ou já foi usado. Volte ao Flow Receita e conecte o certificado novamente.</p>'), 404, $headers);
    $error = (string)($query['error'] ?? '');
    if ($error !== '') {
        $pdo->prepare('DELETE FROM signature_psc_sessions WHERE state_hash=?')->execute([hash('sha256', $state)]);
        $detail = mb_substr((string)($query['error_description'] ?? $error), 0, 200);
        signatureOutput('text/html; charset=utf-8', signaturePage('Autorização não concluída', '<p class="error">' . htmlspecialchars($session['psc'] . ': ' . $detail, ENT_QUOTES, 'UTF-8') . '</p><p class="hint">Volte ao Flow Receita e tente novamente.</p>'), 400, $headers);
    }
    $pdo->prepare("UPDATE signature_psc_sessions SET status='active' WHERE state_hash=? AND status='pending'")->execute([hash('sha256', $state)]);
    $script = "<script>try{new BroadcastChannel('flow-signature').postMessage('psc-connected')}catch(e){}setTimeout(function(){window.close()},1500)</script>";
    signatureOutput('text/html; charset=utf-8', signaturePage('Certificado conectado', '<p>O certificado ' . htmlspecialchars($session['psc'], ENT_QUOTES, 'UTF-8') . ' foi autorizado. A assinatura continua na aba do Flow Receita; esta aba pode ser fechada.</p>', $script), 200, $headers);
}

function validateSignedDocument(PDO $pdo, array $query, ?array $config = null): void {
    $config ??= signatureConfig();
    $cors = ['Access-Control-Allow-Origin: *', 'Cache-Control: no-store'];
    signatureSchema($pdo);
    $publicId = (string)($query['id'] ?? '');
    $document = null;
    if (preg_match('/^[a-f0-9]{32}$/D', $publicId)) {
        $stmt = $pdo->prepare("SELECT public_id,secret_hash,doc_type,signed_at FROM signed_documents WHERE public_id=? AND status='signed'");
        $stmt->execute([$publicId]);
        $document = $stmt->fetch() ?: null;
    }
    $code = normalizeValidationCode((string)($query['secretCode'] ?? ''));
    // O validar.iti.gov.br acrescenta format e secretCode; quem lê o QR pela câmera recebe a página com o formulário.
    $json = isset($query['format']);
    if ($code === '' && !$json) signatureOutput('text/html; charset=utf-8', validationPage($config, $document, $publicId), $document ? 200 : 404, $cors);
    $bucket = hash('sha256', 'validar:' . ($_SERVER['REMOTE_ADDR'] ?? '') . ':' . gmdate('Y-m-d-H'));
    $stmt = $pdo->prepare('SELECT attempts FROM signature_rate_limits WHERE bucket=?');
    $stmt->execute([$bucket]);
    if ((int)$stmt->fetchColumn() >= 20) {
        $json ? signatureOutput('application/json', json_encode(['error' => 'Muitas tentativas. Tente novamente em uma hora.']), 429, $cors)
            : signatureOutput('text/html; charset=utf-8', validationPage($config, $document, $publicId, 'Muitas tentativas. Tente novamente em uma hora.'), 429, $cors);
    }
    if (!$document || $code === '' || !password_verify($code, $document['secret_hash'])) {
        $pdo->exec('DELETE FROM signature_rate_limits WHERE expires_at < UTC_TIMESTAMP()');
        $stmt = $pdo->prepare('INSERT INTO signature_rate_limits (bucket,attempts,expires_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR)) ON DUPLICATE KEY UPDATE attempts=attempts+1');
        $stmt->execute([$bucket]);
        $json ? signatureOutput('application/json', json_encode(['error' => 'Documento ou código de validação inválido.']), 404, $cors)
            : signatureOutput('text/html; charset=utf-8', validationPage($config, $document, $publicId, 'Código de validação incorreto.'), $document ? 403 : 404, $cors);
    }
    try {
        if ($json && !isset($query['pdf'])) {
            $url = validationUrl($config, $publicId) . '?' . http_build_query(['secretCode' => $code, 'pdf' => 1]);
            signatureOutput('application/json', json_encode(['url' => $url], JSON_UNESCAPED_SLASHES), 200, $cors);
        }
        sendSignedPdf($config, $publicId);
    } catch (SignatureFailure $e) {
        signatureOutput('application/json', json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE), $e->status, $cors);
    }
}
