<?php
declare(strict_types=1);
session_save_path('/tmp');
session_start();
require __DIR__ . '/../api/password-reset.php';
final class ApiResponse extends Exception {
    public function __construct(public array $data, public int $status) { parent::__construct('API response'); }
}
function respond(array $data, int $status = 200): never { throw new ApiResponse($data, $status); }
function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
// Use actual SQLite transactions and rows; only translate MySQL schema/time syntax.
final class TestDatabase extends PDO {
    public function __construct() { parent::__construct('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]); }
    public function exec(string $statement): int|false {
        if (str_contains($statement, 'CREATE TABLE IF NOT EXISTS password_resets')) $statement = 'CREATE TABLE IF NOT EXISTS password_resets (user_id INTEGER PRIMARY KEY,token_hash TEXT UNIQUE,email TEXT,password_hash TEXT,expires_at TEXT,requested_at TEXT)';
        if (str_contains($statement, 'CREATE TABLE IF NOT EXISTS reset_rate_limits')) $statement = 'CREATE TABLE IF NOT EXISTS reset_rate_limits (bucket TEXT PRIMARY KEY,attempts INTEGER,expires_at TEXT)';
        return parent::exec($this->translate($statement));
    }
    private function translate(string $sql): string {
        $sql = str_replace(['DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR)','DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)','DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)','UTC_TIMESTAMP()',' FOR UPDATE'], ["datetime('now','+1 hour')","datetime('now','+30 minutes')","datetime('now','-1 minute')","datetime('now')",''], $sql);
        $sql = str_replace('ON DUPLICATE KEY UPDATE attempts=attempts+1', 'ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1', $sql);
        $sql = str_replace('ON DUPLICATE KEY UPDATE', 'ON CONFLICT(user_id) DO UPDATE SET', $sql);
        return preg_replace('/VALUES\((\w+)\)/', 'excluded.$1', $sql);
    }
    public function prepare(string $query, array $options = []): PDOStatement|false { return parent::prepare($this->translate($query), $options); }
}
function callApi(callable $action): ApiResponse {
    try { $action(); } catch (ApiResponse $response) { return $response; }
    throw new RuntimeException('No API response');
}
$db = new TestDatabase();
$db->exec('CREATE TABLE users (id INTEGER PRIMARY KEY,email TEXT UNIQUE,password_hash TEXT)');
$original = password_hash('Original123', PASSWORD_DEFAULT);
$stmt = $db->prepare('INSERT INTO users VALUES (?,?,?)');$stmt->execute([1,'teste@example.com',$original]);
$mail = ['password' => 'simulated-password'];$sent = [];
$sender = function ($config, $email, $token) use (&$sent) { $sent[] = ['email' => $email, 'token' => $token]; };
$r = callApi(fn()=>requestPasswordReset($db,['email'=>'invalid'],$mail,$sender));check($r->status===422,'Reject invalid email');
$r = callApi(fn()=>requestPasswordReset($db,['email'=>'teste@example.com'],['password'=>''],$sender));check($r->status===503,'Missing SMTP must not claim success');
$unknown = callApi(fn()=>requestPasswordReset($db,['email'=>'unknown@example.com'],$mail,$sender));check(count($sent)===0,'Unknown account must not send');
$known = callApi(fn()=>requestPasswordReset($db,['email'=>' TESTE@example.com '],$mail,$sender));check($known->data===$unknown->data,'Do not disclose registration');check(count($sent)===1,'One email sent');
$token = $sent[0]['token'];check(strlen($token)===64,'Token entropy');
check($db->query('SELECT token_hash FROM password_resets')->fetchColumn()!==$token,'Store token hash only');
check($db->query('SELECT password_hash FROM users')->fetchColumn()===$original,'Request must not change password');
callApi(fn()=>requestPasswordReset($db,['email'=>'teste@example.com'],$mail,$sender));check(count($sent)===1,'Cooldown');
check(callApi(fn()=>finishPasswordReset($db,['token'=>'bad','password'=>'Updated123']))->status===422,'Reject malformed token');
check(callApi(fn()=>finishPasswordReset($db,['token'=>$token,'password'=>'short']))->status===422,'Reject short password');
check(callApi(fn()=>finishPasswordReset($db,['token'=>str_repeat('0',64),'password'=>'Updated123']))->status===422,'Reject unknown token');
$_SESSION=[];
check(callApi(fn()=>finishPasswordReset($db,['token'=>$token,'password'=>'Updated123']))->status===200,'Save new password');
$hash=$db->query('SELECT password_hash FROM users')->fetchColumn();check(password_verify('Updated123',$hash)&&!password_verify('Original123',$hash),'New password authenticates');
check(callApi(fn()=>finishPasswordReset($db,['token'=>$token,'password'=>'Other123']))->status===422,'Reject token reuse');
$db->exec('DELETE FROM reset_rate_limits');
callApi(fn()=>requestPasswordReset($db,['email'=>'teste@example.com'],$mail,$sender));$token=end($sent)['token'];
$db->exec("UPDATE password_resets SET expires_at='2000-01-01 00:00:00'");
check(callApi(fn()=>finishPasswordReset($db,['token'=>$token,'password'=>'Other123']))->status===422,'Reject expired token');
callApi(fn()=>requestPasswordReset($db,['email'=>'teste@example.com'],$mail,$sender));$token=end($sent)['token'];
$db->exec("UPDATE users SET email='changed@example.com'");
check(callApi(fn()=>finishPasswordReset($db,['token'=>$token,'password'=>'Other123']))->status===422,'Email change invalidates link');
callApi(fn()=>requestPasswordReset($db,['email'=>'changed@example.com'],$mail,$sender));$token=end($sent)['token'];
$stmt=$db->prepare('UPDATE users SET password_hash=?');$stmt->execute([password_hash('Another123',PASSWORD_DEFAULT)]);
check(callApi(fn()=>finishPasswordReset($db,['token'=>$token,'password'=>'Other123']))->status===422,'Password change invalidates link');
$db->exec('DELETE FROM reset_rate_limits');
$failure=function(){throw new RuntimeException('simulated SMTP failure');};
check(callApi(fn()=>requestPasswordReset($db,['email'=>'changed@example.com'],$mail,$failure))->status===503,'SMTP failure reported');
check((int)$db->query('SELECT COUNT(*) FROM password_resets')->fetchColumn()===0,'SMTP failure removes token');
$db->exec('DELETE FROM reset_rate_limits');
for($i=0;$i<10;$i++)callApi(fn()=>requestPasswordReset($db,['email'=>'unknown@example.com'],$mail,$sender));
check(callApi(fn()=>requestPasswordReset($db,['email'=>'unknown@example.com'],$mail,$sender))->status===429,'Rate limit');
echo "PASS: recuperação, envio, erros SMTP, senha, expiração, uso único, alteração de e-mail e limites.\n";
