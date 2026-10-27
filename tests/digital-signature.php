<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
final class ApiResponse extends Exception {
    public function __construct(public array $data, public int $status) { parent::__construct('API response'); }
}
final class OutputResponse extends Exception {
    public function __construct(public string $type, public string $body, public int $status) { parent::__construct('Output response'); }
}
function respond(array $data, int $status = 200): never { throw new ApiResponse($data, $status); }
function signatureOutput(string $contentType, string $body, int $status = 200, array $headers = []): never { throw new OutputResponse($contentType, $body, $status); }
require __DIR__ . '/../api/digital-signature.php';
function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
// SQLite real, traduzindo apenas a sintaxe MySQL de esquema e datas.
final class TestDatabase extends PDO {
    public function __construct() { parent::__construct('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]); }
    public function exec(string $statement): int|false {
        if (str_contains($statement, 'CREATE TABLE IF NOT EXISTS signed_documents')) $statement = 'CREATE TABLE IF NOT EXISTS signed_documents (id INTEGER PRIMARY KEY,user_id INTEGER,public_id TEXT UNIQUE,secret_hash TEXT,doc_type TEXT,status TEXT,sha256 TEXT,created_at TEXT,signed_at TEXT)';
        if (str_contains($statement, 'CREATE TABLE IF NOT EXISTS signature_rate_limits')) $statement = 'CREATE TABLE IF NOT EXISTS signature_rate_limits (bucket TEXT PRIMARY KEY,attempts INTEGER,expires_at TEXT)';
        return parent::exec($this->translate($statement));
    }
    private function translate(string $sql): string {
        $sql = str_replace(['DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR)', 'DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)', 'UTC_TIMESTAMP()'], ["datetime('now','+1 hour')", "datetime('now','-1 day')", "datetime('now')"], $sql);
        return str_replace('ON DUPLICATE KEY UPDATE attempts=attempts+1', 'ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1', $sql);
    }
    public function prepare(string $query, array $options = []): PDOStatement|false { return parent::prepare($this->translate($query), $options); }
}
function call(callable $action): ApiResponse|OutputResponse {
    try { $action(); } catch (ApiResponse|OutputResponse $response) { return $response; }
    throw new RuntimeException('No API response');
}
function upload(string $bytes): array {
    $path = tempnam(sys_get_temp_dir(), 'pdf');
    file_put_contents($path, $bytes);
    return ['document' => ['tmp_name' => $path, 'error' => UPLOAD_ERR_OK]];
}

$storage = sys_get_temp_dir() . '/flow-signature-test-' . bin2hex(random_bytes(4));
$config = signatureConfig();
$config = array_merge($config, ['client_id' => 'app', 'client_secret' => 'secret', 'storage_dir' => $storage, 'token_url' => 'https://token.test/jwt', 'hub_url' => 'https://hub.test']);
$signedPdf = "%PDF-1.7\n1 0 obj << /Type /Sig /ByteRange [0 10 20 30] /Contents <3082> >> endobj\n%%EOF";
$calls = [];
$replies = [];
$http = function (string $url, array $headers, array|string $body) use (&$calls, &$replies, $signedPdf): array {
    $calls[] = ['url' => $url, 'headers' => $headers, 'body' => $body];
    if ($replies) return array_shift($replies);
    if (str_ends_with($url, '/jwt')) return ['status' => 200, 'body' => json_encode(['access_token' => 'jwt-' . count($calls), 'expires_in' => 300])];
    return ['status' => 200, 'body' => json_encode([base64_encode($signedPdf)])];
};
$db = new TestDatabase();
$db->exec('CREATE TABLE users (id INTEGER PRIMARY KEY,cpf TEXT,signature TEXT)');
$png = 'data:image/png;base64,' . base64_encode("\x89PNG\r\n\x1a\nimagem");
$stmt = $db->prepare('INSERT INTO users VALUES (?,?,?)');
$stmt->execute([1, '52998224725', $png]);
$stmt->execute([2, '', null]);

$r = call(fn() => handleDigitalSignature($db, 1, 'signature.status', [], [], ['client_id' => '', 'client_secret' => '', 'storage_dir' => ''], $http));
check($r->data === ['ok' => true, 'enabled' => false], 'Status reports missing configuration');
check(call(fn() => handleDigitalSignature($db, 1, 'signature.prepare', ['type' => 'laudo'], [], ['client_id' => '', 'client_secret' => '', 'storage_dir' => ''], $http))->status === 503, 'Unconfigured server refuses signing');
check(call(fn() => handleDigitalSignature($db, 1, 'signature.status', [], [], $config, $http))->data['enabled'] === true, 'Status reports configuration');
check(call(fn() => handleDigitalSignature($db, 1, 'signature.prepare', ['type' => 'orcamento'], [], $config, $http))->status === 422, 'Reject unsupported document type');

$draft = call(fn() => handleDigitalSignature($db, 1, 'signature.prepare', ['type' => 'laudo'], [], $config, $http))->data;
check((bool)preg_match('/^[a-f0-9]{32}$/', $draft['public_id']), 'Unguessable public id');
check((bool)preg_match('/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/', $draft['code']), 'Readable validation code');
check($draft['validation_url'] === 'https://receita.drdanielleite.com.br/v/' . $draft['public_id'], 'Short validation URL');
check($db->query('SELECT secret_hash FROM signed_documents')->fetchColumn() !== $draft['code'], 'Store only the code hash');

$sign = fn(int $user, array $data, array $files) => call(fn() => handleDigitalSignature($db, $user, 'signature.sign', $data, $files, $config, $http));
check($sign(2, ['public_id' => $draft['public_id'], 'pin' => '1234'], upload('%PDF-1.4 x'))->status === 404, 'Other accounts cannot sign the draft');
check($sign(1, ['public_id' => $draft['public_id'], 'pin' => ''], upload('%PDF-1.4 x'))->status === 422, 'PIN is required');
check($sign(1, ['public_id' => $draft['public_id'], 'pin' => '1234'], upload('<html>'))->status === 422, 'Only PDF uploads');
check($sign(1, ['public_id' => $draft['public_id'], 'pin' => '1234'], [])->status === 422, 'Upload is required');
check($calls === [], 'Invalid requests never reach BRy');

$r = $sign(1, ['public_id' => $draft['public_id'], 'pin' => 'p1n-ok'], upload('%PDF-1.4 original'));
check($r->status === 200 && $r->data['file_url'] === 'api/index.php?action=signature.file&id=' . $draft['public_id'], 'Successful signature');
check(count($calls) === 2 && $calls[0]['url'] === 'https://token.test/jwt', 'Token requested first');
parse_str($calls[0]['body'], $tokenRequest);
check($tokenRequest === ['grant_type' => 'client_credentials', 'client_id' => 'app', 'client_secret' => 'secret'], 'Client credentials grant');
$request = $calls[1];
check($request['url'] === 'https://hub.test/fw/v1/pdf/kms/lote/assinaturas', 'HUB Signer KMS endpoint');
check(in_array('Authorization: Bearer jwt-1', $request['headers'], true) && in_array('kms_type: BRYKMS', $request['headers'], true), 'JWT and KMS headers');
$fields = $request['body'];
$signature = json_decode($fields['dados_assinatura'], true);
check($signature['perfil'] === 'TIMESTAMP' && $signature['algoritmoHash'] === 'SHA256' && $signature['tipoRetorno'] === 'BASE64', 'PAdES with timestamp, returned inline');
check($signature['kms_data'] === ['user' => '52998224725', 'pin' => base64_encode('p1n-ok')], 'Doctor CPF and Base64 PIN');
check($fields['documento[0]'] instanceof CURLStringFile && $fields['documento[0]']->data === '%PDF-1.4 original', 'Original PDF uploaded');
check($fields['imagem[0]'] instanceof CURLStringFile && $fields['imagem[0]']->mime === 'image/png', 'Signature image used in stamp');
check(json_decode($fields['configuracao_imagem[0]'], true)['pagina'] === 'ULTIMA', 'Stamp on last page');
$row = $db->query('SELECT status,sha256,signed_at FROM signed_documents')->fetch();
check($row['status'] === 'signed' && $row['sha256'] === hash('sha256', $signedPdf) && $row['signed_at'], 'Signed document recorded');
check(file_get_contents($storage . '/' . $draft['public_id'] . '.pdf') === $signedPdf, 'Signed PDF stored privately');
check(!str_contains((string)file_get_contents($storage . '/.bry-token.json'), 'secret'), 'Token cache has no client secret');
check($sign(1, ['public_id' => $draft['public_id'], 'pin' => 'p1n-ok'], upload('%PDF-1.4 again'))->status === 409, 'Signed documents cannot be signed again');

$file = call(fn() => (function () use ($db, $config, $http, $draft) { $_GET['id'] = $draft['public_id']; handleDigitalSignature($db, 1, 'signature.file', [], [], $config, $http); })());
check($file instanceof OutputResponse && $file->type === 'application/pdf' && $file->body === $signedPdf, 'Owner downloads signed PDF');
check(call(fn() => handleDigitalSignature($db, 2, 'signature.file', [], [], $config, $http))->status === 404, 'Other accounts cannot download');

$calls = [];
$second = call(fn() => handleDigitalSignature($db, 1, 'signature.prepare', ['type' => 'atestado'], [], $config, $http))->data;
check($sign(1, ['public_id' => $second['public_id'], 'pin' => '1'], upload('%PDF-1.4 b'))->status === 200 && count($calls) === 1, 'Cached token reused');
$calls = [];
$replies = [['status' => 401, 'body' => '{}']];
$third = call(fn() => handleDigitalSignature($db, 1, 'signature.prepare', ['type' => 'exame'], [], $config, $http))->data;
check($sign(1, ['public_id' => $third['public_id'], 'pin' => '1'], upload('%PDF-1.4 c'))->status === 200 && count($calls) === 3, 'Expired token renewed once');
$calls = [];
$replies = [['status' => 400, 'body' => json_encode(['status' => 400, 'message' => 'PIN inválido', 'traceId' => 'abc'])]];
$fourth = call(fn() => handleDigitalSignature($db, 1, 'signature.prepare', ['type' => 'simples'], [], $config, $http))->data;
$r = $sign(1, ['public_id' => $fourth['public_id'], 'pin' => 'errado'], upload('%PDF-1.4 d'));
check($r->status === 422 && str_contains($r->data['error'], 'PIN inválido'), 'BRy refusal shown to the doctor');
$replies = [['status' => 200, 'body' => json_encode([base64_encode('%PDF-1.4 sem assinatura')])]];
$r = $sign(1, ['public_id' => $fourth['public_id'], 'pin' => '1'], upload('%PDF-1.4 d'));
check($r->status === 502, 'Unsigned BRy response rejected');
check($db->query("SELECT status FROM signed_documents WHERE public_id='{$fourth['public_id']}'")->fetchColumn() === 'draft', 'Failed signatures stay as drafts');
check($sign(2, ['public_id' => call(fn() => handleDigitalSignature($db, 2, 'signature.prepare', ['type' => 'laudo'], [], $config, $http))->data['public_id'], 'pin' => '1'], upload('%PDF-1.4 e'))->status === 422, 'Doctor CPF required');

$validate = fn(array $query) => call(fn() => validateSignedDocument($db, $query, $config));
$_SERVER['REMOTE_ADDR'] = '203.0.113.5';
$r = $validate(['id' => $draft['public_id']]);
check($r->status === 200 && str_contains($r->type, 'text/html') && str_contains($r->body, 'name="secretCode"') && str_contains($r->body, 'Laudo'), 'QR opened by camera shows code form');
check(!str_contains($r->body, '52998224725'), 'Public page has no personal data');
check($validate(['id' => $draft['public_id'], 'secretCode' => 'AAAA-AAAA'])->status === 403, 'Wrong code refused');
check($validate(['id' => $fourth['public_id'], 'secretCode' => 'AAAA-AAAA', 'format' => 'json'])->status === 404, 'Drafts are not public');
$r = $validate(['id' => $draft['public_id'], 'secretCode' => strtolower($draft['code']), 'format' => 'application/validador-iti+json']);
check($r->type === 'application/json' && $r->status === 200, 'ITI receives JSON');
$url = json_decode($r->body, true)['url'];
check($url === 'https://receita.drdanielleite.com.br/v/' . $draft['public_id'] . '?secretCode=' . str_replace('-', '', $draft['code']) . '&pdf=1', 'JSON points to the PDF');
parse_str((string)parse_url($url, PHP_URL_QUERY), $pdfQuery);
$r = $validate(['id' => $draft['public_id']] + $pdfQuery);
check($r->type === 'application/pdf' && $r->body === $signedPdf, 'ITI downloads the signed PDF');
check($validate(['id' => $draft['public_id'], 'secretCode' => $draft['code']])->type === 'application/pdf', 'Code form opens the PDF');
for ($i = 0; $i < 20; $i++) $validate(['id' => $draft['public_id'], 'secretCode' => 'ZZZZ-ZZZZ']);
check($validate(['id' => $draft['public_id'], 'secretCode' => $draft['code']])->status === 429, 'Validation attempts are rate limited');

$_SERVER['DOCUMENT_ROOT'] = dirname($storage);
$fifth = call(fn() => handleDigitalSignature($db, 1, 'signature.prepare', ['type' => 'laudo'], [], $config, $http))->data;
check(call(fn() => handleDigitalSignature($db, 1, 'signature.sign', ['public_id' => $fifth['public_id'], 'pin' => '1'], upload('%PDF-1.4 g'), $config, $http))->status === 503, 'Storage inside the public site is refused');
unset($_SERVER['DOCUMENT_ROOT']);

foreach (array_diff(scandir($storage) ?: [], ['.', '..']) as $name) unlink($storage . '/' . $name);
rmdir($storage);
echo "PASS: configuração, rascunho, envio à BRy, token, erros, armazenamento privado, download e validação pública.\n";
